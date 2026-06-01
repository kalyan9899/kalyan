import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { calcInterestAmount, calcTotalAmount } from '../utils/finance';
import { openWhatsApp } from '../utils/whatsapp';
import LoadingSpinner from '../components/LoadingSpinner';
import ManagerSidebar from '../components/ManagerSidebar';
import './ManagerDashboard.css';

const DashboardBg = lazy(() => import('../components/DashboardBg'));
const ManagerDashboardHome = lazy(() => import('./ManagerDashboardHome'));

const emptyClient = {
  name: '',
  place: '',
  phone: '',
  amountTaken: '',
  dateTaken: '',
  interestRate: '',
  weeklyPayment: '',
  username: '',
  password: '',
};

const emptyCollection = {
  name: '',
  collection: '',
  charges: '',
  payments: '',
  previousAmount: '',
  entryDate: new Date().toISOString().slice(0, 10),
};

const emptyRenewal = {
  amountTaken: '',
  dateTaken: new Date().toISOString().slice(0, 10),
  interestRate: '',
  weeklyPayment: '',
  note: '',
};

const ACTION_ICONS = {
  edit: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4 11.5-11.5z" />
    </svg>
  ),
  renew: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12a9 9 0 0 1-15.5 6.2" />
      <path d="M3 12A9 9 0 0 1 18.5 5.8" />
      <path d="M18 2v4h4" />
      <path d="M6 22v-4H2" />
    </svg>
  ),
  delete: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v5M14 11v5" />
    </svg>
  ),
  whatsapp: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.5-4.1A8 8 0 1 1 20 11.5z" />
      <path d="M9 8.5c.4 2.5 2 4.1 4.5 4.5l1.2-1.2 2.1 1.1c-.4 1.6-1.5 2.4-3.2 2.2-3.4-.4-6.3-3.3-6.7-6.7-.2-1.7.6-2.8 2.2-3.2l1.1 2.1L9 8.5z" />
    </svg>
  ),
};

function formatDate(d) {
  return new Date(d).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatMoney(n) {
  return `₹${Number(n || 0).toLocaleString('en-IN')}`;
}

function calcBalance(row) {
  return (
    Number(row.previousAmount || 0) +
    Number(row.collection || 0) +
    Number(row.charges || 0) -
    Number(row.payments || 0)
  );
}

const DASHBOARD_CACHE_KEY = 'lakshmi-dashboard-cache';
const DASHBOARD_CACHE_TTL = 5 * 60 * 1000;

function getDashboardCache() {
  try {
    const raw = localStorage.getItem(DASHBOARD_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.ts > DASHBOARD_CACHE_TTL) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function setDashboardCache(data) {
  try {
    localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
  } catch {
    // ignore storage failures
  }
}

export default function ManagerDashboard() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('dashboard');
  const [clients, setClients] = useState([]);
  const [weekly, setWeekly] = useState(null);
  const [collections, setCollections] = useState([]);
  const [form, setForm] = useState(emptyClient);
  const [collectionForm, setCollectionForm] = useState(emptyCollection);
  const [renewalForm, setRenewalForm] = useState(emptyRenewal);
  const [renewingClient, setRenewingClient] = useState(null);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [loading, setLoading] = useState(true);
  const [collectionLoading, setCollectionLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchClient, setSearchClient] = useState('');
  const [globalSearch, setGlobalSearch] = useState('');
  const [editClientId, setEditClientId] = useState(null);
  const [defaulters, setDefaulters] = useState([]);
  const [defaulterCount, setDefaulterCount] = useState(0);
  const [dailyReport, setDailyReport] = useState(null);
  const [dashboardStale, setDashboardStale] = useState(false);
  const pendingRequestsRef = useRef({});
  const [dailyDate, setDailyDate] = useState(new Date().toISOString().slice(0, 10));
  const [monthlyReport, setMonthlyReport] = useState(null);
  const [monthlyMonth, setMonthlyMonth] = useState(new Date().toISOString().slice(0, 7));
  const [reportLoading, setReportLoading] = useState(false);
  const [bulkReminding, setBulkReminding] = useState(false);
  const [dashboardData, setDashboardData] = useState(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [paymentApprovals, setPaymentApprovals] = useState([]);
  const [approvalsLoading, setApprovalsLoading] = useState(false);

  const requestOnce = useCallback(async (key, fn) => {
    if (pendingRequestsRef.current[key]) return pendingRequestsRef.current[key];
    const promise = fn().finally(() => {
      delete pendingRequestsRef.current[key];
    });
    pendingRequestsRef.current[key] = promise;
    return promise;
  }, []);

  const loadClients = useCallback(
    (q = '') =>
      requestOnce(`clients:${q}`, async () => {
        const data = await api.getClients(q);
        setClients(data);
        return data;
      }).catch((e) => setMessage({ type: 'error', text: e.message })),
    [requestOnce]
  );

  const loadDefaulters = useCallback(
    () =>
      requestOnce('defaulters', async () => {
        const data = await api.getDefaulters();
        setDefaulters(data.defaulters || []);
        setDefaulterCount(data.count || 0);
        setMessage((current) => (current.type === 'error' ? { type: '', text: '' } : current));
        return data;
      }).catch((e) => setMessage({ type: 'error', text: e.message })),
    [requestOnce]
  );

  const loadDailyReport = useCallback(
    (date = dailyDate) => {
      setReportLoading(true);
      return requestOnce(`daily-report:${date}`, async () => api.getDailyCollectionsReport(date))
        .then(setDailyReport)
        .catch((e) => setMessage({ type: 'error', text: e.message }))
        .finally(() => setReportLoading(false));
    },
    [dailyDate, requestOnce]
  );

  const loadMonthlyReport = useCallback(
    (month = monthlyMonth) => {
      setReportLoading(true);
      return requestOnce(`monthly-profit:${month}`, async () => api.getMonthlyProfitReport(month))
        .then(setMonthlyReport)
        .catch((e) => setMessage({ type: 'error', text: e.message }))
        .finally(() => setReportLoading(false));
    },
    [monthlyMonth, requestOnce]
  );

  const loadWeekly = useCallback(
    (background = false) =>
      requestOnce('weekly', async () => {
        if (!background) setLoading(true);
        const data = await api.getWeeklyStatus();
        setWeekly(data);
        setMessage((current) => (current.type === 'error' ? { type: '', text: '' } : current));
        return data;
      })
        .catch((e) => setMessage({ type: 'error', text: e.message }))
        .finally(() => {
          if (!background) setLoading(false);
        }),
    [requestOnce]
  );

  const loadPaymentApprovals = useCallback(
    (background = false) =>
      requestOnce('payment-approvals', async () => {
        if (!background) setApprovalsLoading(true);
        const data = await api.getPaymentApprovals();
        setPaymentApprovals(data);
        setMessage((current) => (current.type === 'error' ? { type: '', text: '' } : current));
        return data;
      })
        .catch((e) => setMessage({ type: 'error', text: e.message }))
        .finally(() => {
          if (!background) setApprovalsLoading(false);
        }),
    [requestOnce]
  );

  const loadDashboard = useCallback(
    async ({ background = false } = {}) => {
      if (!background) setDashboardLoading(true);
      const load = async () => {
        const data = await api.getManagerDashboard();
        setDashboardData(data);
        setDashboardCache(data);
        setMessage((current) => (current.type === 'error' ? { type: '', text: '' } : current));
        return data;
      };

      return requestOnce('dashboard', load)
        .catch((e) => setMessage({ type: 'error', text: e.message }))
        .finally(() => {
          if (!background) setDashboardLoading(false);
        });
    },
    [requestOnce]
  );

  const loadCollections = useCallback(
    () =>
      requestOnce('collections', async () => {
        setCollectionLoading(true);
        const data = await api.getCollections();
        setCollections(data);
        return data;
      })
        .catch((e) => setMessage({ type: 'error', text: e.message }))
        .finally(() => setCollectionLoading(false)),
    [requestOnce]
  );

  useEffect(() => {
    const cachedDashboard = getDashboardCache();
    if (cachedDashboard) {
      setDashboardData(cachedDashboard);
      setDashboardStale(true);
      setDashboardLoading(false);
    }

    const startup = async () => {
      const requests = [
        loadClients(),
        loadWeekly(),
        loadDefaulters(),
        loadCollections(),
        loadPaymentApprovals(),
      ];
      if (!cachedDashboard) requests.push(loadDashboard());
      await Promise.allSettled(requests);
    };

    startup();
  }, [loadClients, loadWeekly, loadDefaulters, loadCollections, loadDashboard, loadPaymentApprovals]);

  useEffect(() => {
    if (tab === 'collection') loadCollections();
    if (tab === 'daily-report') loadDailyReport();
    if (tab === 'monthly-profit') loadMonthlyReport();
    if (tab === 'defaulters') loadDefaulters();
    if (tab === 'payment-approvals') loadPaymentApprovals();
    if (tab === 'dashboard') loadDashboard({ background: true });
  }, [tab, loadCollections, loadDailyReport, loadMonthlyReport, loadDefaulters, loadDashboard, loadPaymentApprovals]);

  useEffect(() => {
    const timer = setInterval(() => {
      loadDefaulters();
      if (tab === 'dashboard') loadDashboard({ background: true });
      if (tab === 'weekly') loadWeekly(true);
      if (tab === 'payment-approvals') loadPaymentApprovals(true);
      if (tab === 'clients') loadClients(globalSearch.trim());
    }, 10000);
    return () => clearInterval(timer);
  }, [
    tab,
    globalSearch,
    loadClients,
    loadDashboard,
    loadDefaulters,
    loadPaymentApprovals,
    loadWeekly,
  ]);

  useEffect(() => {
    const timer = setTimeout(() => loadClients(globalSearch.trim()), 300);
    return () => clearTimeout(timer);
  }, [globalSearch, loadClients]);

  const logout = useCallback(() => {
    localStorage.clear();
    sessionStorage.clear();
    navigate('/');
  }, [navigate]);

  const handleFormChange = useCallback((e) => {
    const { name, value } = e.target;
    setForm((current) => ({ ...current, [name]: value }));
  }, []);

  const handleSearchChange = useCallback(
    (e) => {
      const term = e.target.value;
      setSearchClient(term);
      setGlobalSearch(term);
      loadClients(term);
    },
    [loadClients]
  );

  const interestPreview = useMemo(
    () => calcInterestAmount(form.amountTaken, form.interestRate),
    [form.amountTaken, form.interestRate]
  );

  const totalPreview = useMemo(
    () => calcTotalAmount(form.amountTaken, form.interestRate),
    [form.amountTaken, form.interestRate]
  );

  const filteredClients = useMemo(() => clients, [clients]);

  const handleAddClient = useCallback(
    async (e) => {
      e.preventDefault();
      setSubmitting(true);
      setMessage({ type: '', text: '' });
      try {
        if (editClientId) {
          await api.updateClient(editClientId, form);
          setMessage({ type: 'success', text: 'Client updated successfully' });
        } else {
          await api.addClient(form);
          setMessage({ type: 'success', text: 'Client added successfully' });
        }
        setForm(emptyClient);
        setEditClientId(null);
        loadClients();
        loadWeekly();
        setTab('clients');
      } catch (err) {
        setMessage({ type: 'error', text: err.message });
      } finally {
        setSubmitting(false);
      }
    },
    [editClientId, form, loadClients, loadWeekly]
  );

  const handleEditClient = useCallback((client) => {
    setForm({
      name: client.name,
      place: client.place,
      phone: client.phone,
      amountTaken: client.amountTaken?.toString() || '',
      dateTaken: client.dateTaken ? client.dateTaken.slice(0, 10) : '',
      interestRate: client.interestRate?.toString() || '',
      weeklyPayment: client.weeklyPayment?.toString() || '',
      username: client.username || '',
      password: '',
    });
    setEditClientId(client._id);
    setMessage({ type: 'info', text: `Editing ${client.name}. Update the fields and save.` });
    setTab('add');
  }, []);

  const handleDeleteClient = useCallback(
    async (id) => {
      if (!window.confirm('Delete this client? This action cannot be undone.')) return;
      setSubmitting(true);
      setMessage({ type: '', text: '' });
      try {
        await api.deleteClient(id);
        setMessage({ type: 'success', text: 'Client deleted successfully' });
        loadClients();
        loadWeekly();
      } catch (err) {
        setMessage({ type: 'error', text: err.message });
      } finally {
        setSubmitting(false);
      }
    },
    [loadClients, loadWeekly]
  );

  const handleCancelEdit = useCallback(() => {
    setForm(emptyClient);
    setEditClientId(null);
    setMessage({ type: '', text: '' });
  }, []);

  const startRenewal = useCallback((client) => {
    setRenewingClient(client);
    setRenewalForm({
      amountTaken: client.amountTaken?.toString() || '',
      dateTaken: new Date().toISOString().slice(0, 10),
      interestRate: client.interestRate?.toString() || '',
      weeklyPayment: client.weeklyPayment?.toString() || '',
      note: '',
    });
    setMessage({ type: 'info', text: `Renewing ${client.name}. Enter the new loan details.` });
  }, []);

  const handleRenewalChange = useCallback((e) => {
    const { name, value } = e.target;
    setRenewalForm((current) => ({ ...current, [name]: value }));
  }, []);

  const handleRenewClient = useCallback(
    async (e) => {
      e.preventDefault();
      if (!renewingClient) return;
      setSubmitting(true);
      setMessage({ type: '', text: '' });
      try {
        await api.renewClient(renewingClient._id, renewalForm);
        setMessage({ type: 'success', text: `${renewingClient.name} renewed successfully` });
        setRenewingClient(null);
        setRenewalForm(emptyRenewal);
        loadClients();
        loadWeekly();
        loadDashboard();
      } catch (err) {
        setMessage({ type: 'error', text: err.message });
      } finally {
        setSubmitting(false);
      }
    },
    [loadClients, loadDashboard, loadWeekly, renewalForm, renewingClient]
  );

  const togglePaid = useCallback(
    async (paymentId, currentPaid) => {
      try {
        await api.updatePayment(paymentId, !currentPaid);
        loadWeekly();
      } catch (err) {
        setMessage({ type: 'error', text: err.message });
      }
    },
    [loadWeekly]
  );

  const handleReviewPayment = useCallback(
    async (paymentId, action) => {
      try {
        await api.reviewPaymentApproval(paymentId, action);
        setMessage({
          type: 'success',
          text: action === 'approve' ? 'Payment approved successfully' : 'Payment rejected',
        });
        loadPaymentApprovals();
        loadWeekly();
        loadDefaulters();
        loadDashboard();
      } catch (err) {
        setMessage({ type: 'error', text: err.message });
      }
    },
    [loadDashboard, loadDefaulters, loadPaymentApprovals, loadWeekly]
  );

  const handleCollectionChange = useCallback((e) => {
    const { name, value } = e.target;
    setCollectionForm((current) => ({ ...current, [name]: value }));
  }, []);

  const handleAddCollection = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage({ type: '', text: '' });
    try {
      await api.addCollection(collectionForm);
      setCollectionForm(emptyCollection);
      setMessage({ type: 'success', text: 'Collection saved successfully' });
      loadCollections();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteCollection = async (id) => {
    if (!window.confirm('Delete this collection record?')) return;
    try {
      await api.deleteCollection(id);
      setMessage({ type: 'success', text: 'Record deleted' });
      loadCollections();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handlePrintCollection = (row) => {
    const printWindow = window.open('', '_blank');
    const balance = calcBalance(row);
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Collection Record</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .header { text-align: center; margin-bottom: 30px; }
            .header h1 { margin: 0; font-size: 24px; }
            .header p { margin: 5px 0; color: #666; }
            .details { margin: 20px 0; }
            .detail-row { display: flex; justify-content: space-between; margin: 10px 0; padding: 5px; border-bottom: 1px solid #eee; }
            .detail-label { font-weight: 600; }
            .detail-value { text-align: right; }
            .balance-row { font-size: 18px; font-weight: bold; margin-top: 20px; padding: 10px; background: #f0f0f0; }
            .footer { margin-top: 40px; text-align: center; color: #999; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Lakshmi Ganapati</h1>
            <p>Collection Record</p>
          </div>
          <div class="details">
            ${row.name ? `<div class="detail-row"><span class="detail-label">Name:</span><span class="detail-value">${row.name}</span></div>` : ''}
            <div class="detail-row"><span class="detail-label">Date:</span><span class="detail-value">${formatDate(row.entryDate)}</span></div>
            <div class="detail-row"><span class="detail-label">Previous Amount:</span><span class="detail-value">₹${Number(row.previousAmount).toLocaleString('en-IN')}</span></div>
            <div class="detail-row"><span class="detail-label">Collection:</span><span class="detail-value">₹${Number(row.collection).toLocaleString('en-IN')}</span></div>
            <div class="detail-row"><span class="detail-label">Charges:</span><span class="detail-value">₹${Number(row.charges).toLocaleString('en-IN')}</span></div>
            <div class="detail-row"><span class="detail-label">Payments:</span><span class="detail-value">₹${Number(row.payments).toLocaleString('en-IN')}</span></div>
            <div class="balance-row"><span class="detail-label">Balance:</span><span class="detail-value">₹${balance.toLocaleString('en-IN')}</span></div>
          </div>
          <div class="footer">
            <p>Printed on ${new Date().toLocaleString('en-IN')}</p>
          </div>
        </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 100);
  };

  const sendReminder = async (paymentId, openWa = false) => {
    try {
      const res = await api.sendReminder(paymentId);
      setMessage({
        type: 'success',
        text: openWa
          ? 'Reminder saved. Opening WhatsApp…'
          : `${res.message} — ${res.smsPreview}`,
      });
      loadWeekly();
      loadDefaulters();
      loadDashboard();
      if (openWa && res.phone && res.smsPreview) {
        openWhatsApp(res.phone, res.smsPreview);
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const sendBulkReminders = async () => {
    if (!window.confirm('Send reminders to all pending payments this week?')) return;
    setBulkReminding(true);
    try {
      const res = await api.sendBulkReminders();
      setMessage({ type: 'success', text: res.message });
      loadWeekly();
      loadDefaulters();
      loadDashboard();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setBulkReminding(false);
    }
  };

  const handleWhatsApp = useCallback((phone, message) => {
    openWhatsApp(phone, message);
  }, []);

  const handleGlobalSearch = useCallback(
    (value) => {
      setGlobalSearch(value);
      setSearchClient(value);
      loadClients(value);
      if (value.trim()) setTab('clients');
    },
    [loadClients]
  );

  const handleSidebarToggle = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  const pageTitles = useMemo(
    () => ({
      dashboard: 'Dashboard',
      weekly: 'Weekly payments',
      clients: 'Clients',
      collection: 'Collection',
      'payment-approvals': 'Payment approvals',
      add: 'Add client',
      'daily-report': 'Daily collections',
      'monthly-profit': 'Monthly profit',
      defaulters: 'Defaulters',
    }),
    []
  );

  const managerName = useMemo(
    () => sessionStorage.getItem('name') || localStorage.getItem('name') || 'Manager',
    []
  );

  const isDashboard = tab === 'dashboard';

  return (
    <div className={`manager-layout dash-animated ${isDashboard ? 'manager-layout--premium' : ''}`}>
      {!isDashboard && (
        <Suspense fallback={<div className="mg-suspense-fallback" />}> 
          <DashboardBg />
        </Suspense>
      )}
      <ManagerSidebar
        active={tab}
        onNavigate={setTab}
        onLogout={logout}
        mobileOpen={sidebarOpen}
        onMenuToggle={handleSidebarToggle}
        onCloseMobile={() => setSidebarOpen(false)}
        defaulterCount={defaulterCount}
      />

      <main className="manager-main">
        {!isDashboard && (
        <header className="dash-header anim-fade-down">
          <div>
            <h1>{pageTitles[tab] || 'Manager Panel'}</h1>
            <p className="subtitle">{managerName}</p>
          </div>
          <div className="manager-header-toolbar">
            <input
              type="search"
              className="search-input manager-global-search"
              placeholder="Search customers…"
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              aria-label="Search customers"
            />
            <button
              type="button"
              className="btn small warning"
              disabled={bulkReminding}
              onClick={sendBulkReminders}
              title="One-click reminder for all pending this week"
            >
              {bulkReminding ? 'Sending…' : 'Remind all'}
            </button>
          </div>
        </header>
        )}

        {message.text && (
          <div
            className={`alert anim-fade-up ${message.type === 'error' ? 'error' : 'success'}`}
          >
            {message.text}
          </div>
        )}

        {tab === 'dashboard' && (
          <Suspense fallback={<div className="mg-suspense-fallback" />}>
            <ManagerDashboardHome
              data={dashboardData}
              loading={dashboardLoading}
              managerName={managerName}
              globalSearch={globalSearch}
              onSearchChange={handleGlobalSearch}
              onRemindAll={sendBulkReminders}
              bulkReminding={bulkReminding}
              onNavigate={setTab}
              onRemind={sendReminder}
              onWhatsApp={handleWhatsApp}
              notificationCount={defaulterCount}
              onMenuToggle={handleSidebarToggle}
            />
          </Suspense>
        )}

        {tab === 'clients' && (
          <section key="clients-tab" className="section anim-tab-in">
            <h2>Clients</h2>
            <div className="section-toolbar">
              <input
                type="text"
                value={searchClient}
                onChange={handleSearchChange}
                placeholder="Search by name, place, or phone"
                className="search-input"
              />
            </div>
            <div className="table-wrap anim-scale-in">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Place</th>
                    <th>Phone</th>
                    <th>Amount</th>
                    <th>Interest</th>
                    <th>Total</th>
                    <th>Weekly</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClients.length === 0 ? (
                    <tr>
                      <td colSpan={8}>{searchClient ? 'No clients found.' : 'No clients yet.'}</td>
                    </tr>
                  ) : (
                    filteredClients.map((client, i) => {
                      const msg = `Namaste ${client.name}, Lakshmi Ganapati. Your account total is ${formatMoney(client.totalAmount ?? calcTotalAmount(client.amountTaken, client.interestRate))}. Weekly payment: ${formatMoney(client.weeklyPayment)}.`;
                      return (
                      <tr
                        key={client._id}
                        className="anim-row-in"
                        style={{ animationDelay: `${0.08 + i * 0.03}s` }}
                      >
                        <td>{client.name}</td>
                        <td>{client.place}</td>
                        <td>{client.phone}</td>
                        <td>{formatMoney(client.amountTaken)}</td>
                        <td>{formatMoney(client.interestAmount ?? calcInterestAmount(client.amountTaken, client.interestRate))}</td>
                        <td>{formatMoney(client.totalAmount ?? calcTotalAmount(client.amountTaken, client.interestRate))}</td>
                        <td>{formatMoney(client.weeklyPayment)}</td>
                        <td className="actions">
                          <div className="client-actions">
                            <button
                              type="button"
                              className="action-icon-btn action-icon-btn--edit"
                              onClick={() => handleEditClient(client)}
                              aria-label={`Edit ${client.name}`}
                              title="Edit"
                              data-tooltip="Edit"
                            >
                              {ACTION_ICONS.edit}
                            </button>
                            <button
                              type="button"
                              className="action-icon-btn action-icon-btn--renew"
                              onClick={() => startRenewal(client)}
                              aria-label={`Renew ${client.name}`}
                              title="Renew"
                              data-tooltip="Renew"
                            >
                              {ACTION_ICONS.renew}
                            </button>
                            <button
                              type="button"
                              className="action-icon-btn action-icon-btn--delete"
                              onClick={() => handleDeleteClient(client._id)}
                              aria-label={`Delete ${client.name}`}
                              title="Delete"
                              data-tooltip="Delete"
                            >
                              {ACTION_ICONS.delete}
                            </button>
                            <button
                              type="button"
                              className="action-icon-btn action-icon-btn--wa"
                              onClick={() => handleWhatsApp(client.phone, msg)}
                              aria-label={`WhatsApp ${client.name}`}
                              title="WhatsApp"
                              data-tooltip="WhatsApp"
                            >
                              {ACTION_ICONS.whatsapp}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {renewingClient && (
              <form onSubmit={handleRenewClient} className="renewal-form card form-card anim-fade-up">
                <div className="section-toolbar">
                  <div>
                    <h2>Renew {renewingClient.name}</h2>
                    <p className="muted-text">Previous total: {formatMoney(renewingClient.totalAmount ?? calcTotalAmount(renewingClient.amountTaken, renewingClient.interestRate))}</p>
                  </div>
                  <button
                    type="button"
                    className="btn small"
                    onClick={() => {
                      setRenewingClient(null);
                      setRenewalForm(emptyRenewal);
                    }}
                  >
                    Cancel
                  </button>
                </div>
                <div className="form-row">
                  <label>
                    New amount taken
                    <input
                      name="amountTaken"
                      type="number"
                      min="0"
                      value={renewalForm.amountTaken}
                      onChange={handleRenewalChange}
                      required
                    />
                  </label>
                  <label>
                    Renewal date
                    <input
                      name="dateTaken"
                      type="date"
                      value={renewalForm.dateTaken}
                      onChange={handleRenewalChange}
                      required
                    />
                  </label>
                  <label>
                    Interest rate (%)
                    <input
                      name="interestRate"
                      type="number"
                      min="0"
                      step="0.1"
                      value={renewalForm.interestRate}
                      onChange={handleRenewalChange}
                      required
                    />
                  </label>
                  <label>
                    Weekly payment
                    <input
                      name="weeklyPayment"
                      type="number"
                      min="0"
                      value={renewalForm.weeklyPayment}
                      onChange={handleRenewalChange}
                      required
                    />
                  </label>
                </div>
                <div className="form-row">
                  <label>
                    Renewal note
                    <input
                      name="note"
                      value={renewalForm.note}
                      onChange={handleRenewalChange}
                      placeholder="Optional note"
                    />
                  </label>
                </div>
                <div className="interest-calc-preview anim-fade-up">
                  <div className="interest-calc-preview__item">
                    <span>New interest amount</span>
                    <strong>{formatMoney(calcInterestAmount(renewalForm.amountTaken, renewalForm.interestRate))}</strong>
                  </div>
                  <div className="interest-calc-preview__item highlight">
                    <span>New total amount</span>
                    <strong>{formatMoney(calcTotalAmount(renewalForm.amountTaken, renewalForm.interestRate))}</strong>
                  </div>
                </div>
                <button type="submit" className="btn primary" disabled={submitting}>
                  {submitting ? 'Renewing...' : 'Save renewal'}
                </button>
              </form>
            )}
          </section>
        )}

      {tab === 'add' && (
        <section key="add-tab" className="section card form-card anim-tab-in">
          <h2>{editClientId ? 'Edit client' : 'Add new client'}</h2>
          <form onSubmit={handleAddClient} className="client-form">
            <div className="form-row">
              <label>
                Name
                <input name="name" value={form.name} onChange={handleFormChange} required />
              </label>
              <label>
                Place
                <input name="place" value={form.place} onChange={handleFormChange} required />
              </label>
            </div>
            <div className="form-row">
              <label>
                Phone (for reminders)
                <input name="phone" type="tel" value={form.phone} onChange={handleFormChange} required />
              </label>
              <label>
                Date amount taken
                <input
                  name="dateTaken"
                  type="date"
                  value={form.dateTaken}
                  onChange={handleFormChange}
                  required
                />
              </label>
            </div>
            <div className="form-row">
              <label>
                Amount taken (₹)
                <input
                  name="amountTaken"
                  type="number"
                  min="0"
                  value={form.amountTaken}
                  onChange={handleFormChange}
                  required
                />
              </label>
              <label>
                Interest rate (%)
                <input
                  name="interestRate"
                  type="number"
                  min="0"
                  step="0.1"
                  value={form.interestRate}
                  onChange={handleFormChange}
                  required
                />
              </label>
            </div>
            <div className="interest-calc-preview anim-fade-up">
              <div className="interest-calc-preview__item">
                <span>Interest amount (auto)</span>
                <strong>{formatMoney(interestPreview)}</strong>
              </div>
              <div className="interest-calc-preview__item highlight">
                <span>Total amount (auto)</span>
                <strong>{formatMoney(totalPreview)}</strong>
              </div>
              <p className="muted-text">Total = amount taken + interest</p>
            </div>
            <div className="form-row">
              <label>
                Weekly payment (₹)
                <input
                  name="weeklyPayment"
                  type="number"
                  min="0"
                  value={form.weeklyPayment}
                  onChange={handleFormChange}
                  required
                />
              </label>
            </div>
            <div className="form-row">
              <label>
                Login username
                <input name="username" value={form.username} onChange={handleFormChange} required />
              </label>
              <label>
                Login password
                <input
                  name="password"
                  type="password"
                  value={form.password}
                  onChange={handleFormChange}
                  required={!editClientId}
                  minLength={6}
                />
              </label>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn primary" disabled={submitting}>
                {submitting
                  ? editClientId ? 'Saving...' : 'Adding...'
                  : editClientId ? 'Update client' : 'Add client'}
              </button>
              {editClientId && (
                <button type="button" className="btn secondary" onClick={handleCancelEdit}>
                  Cancel edit
                </button>
              )}
            </div>
          </form>
        </section>
      )}

      {tab === 'collection' && (
        <section key="collection-tab" className="section anim-tab-in">
          <h2>Collection</h2>

          <form onSubmit={handleAddCollection} className="collection-form card form-card">
            <div className="form-row collection-fields">
              <label>
                Name
                <input
                  name="name"
                  type="text"
                  value={collectionForm.name}
                  onChange={handleCollectionChange}
                  placeholder="Client name"
                />
              </label>
              <label>
                Date
                <input
                  name="entryDate"
                  type="date"
                  value={collectionForm.entryDate}
                  onChange={handleCollectionChange}
                  required
                />
              </label>
              <label>
                Previous Amount (₹)
                <input
                  name="previousAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={collectionForm.previousAmount}
                  onChange={handleCollectionChange}
                  placeholder="0"
                />
              </label>
              <label>
                Collection (₹)
                <input
                  name="collection"
                  type="number"
                  min="0"
                  step="0.01"
                  value={collectionForm.collection}
                  onChange={handleCollectionChange}
                  placeholder="0"
                />
              </label>
              <label>
                Charges (₹)
                <input
                  name="charges"
                  type="number"
                  min="0"
                  step="0.01"
                  value={collectionForm.charges}
                  onChange={handleCollectionChange}
                  placeholder="0"
                />
              </label>
              <label>
                Payments (₹)
                <input
                  name="payments"
                  type="number"
                  min="0"
                  step="0.01"
                  value={collectionForm.payments}
                  onChange={handleCollectionChange}
                  placeholder="0"
                />
              </label>
            </div>
            <button type="submit" className="btn primary" disabled={submitting}>
              {submitting ? 'Saving...' : 'Save collection'}
            </button>
          </form>

          {collectionLoading ? (
            <LoadingSpinner label="Loading collections..." inline />
          ) : (
            <div className="table-wrap anim-scale-in" style={{ marginTop: '1.5rem' }}>
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Date</th>
                    <th>Previous Amount</th>
                    <th>Collection</th>
                    <th>Charges</th>
                    <th>Payments</th>
                    <th>Balance</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {collections.length === 0 ? (
                    <tr>
                      <td colSpan={8}>No collection records yet.</td>
                    </tr>
                  ) : (
                    collections.map((row, i) => (
                      <tr
                        key={row._id}
                        className="anim-row-in"
                        style={{ animationDelay: `${0.1 + i * 0.04}s` }}
                      >
                        <td>{row.name || '—'}</td>
                        <td>{formatDate(row.entryDate)}</td>
                        <td>{formatMoney(row.previousAmount)}</td>
                        <td>{formatMoney(row.collection)}</td>
                        <td>{formatMoney(row.charges)}</td>
                        <td>{formatMoney(row.payments)}</td>
                        <td className="balance-cell">{formatMoney(calcBalance(row))}</td>
                        <td>
                          <button
                            type="button"
                            className="btn small"
                            onClick={() => handlePrintCollection(row)}
                            title="Print record"
                          >
                            Print
                          </button>
                          <button
                            type="button"
                            className="btn small danger"
                            onClick={() => handleDeleteCollection(row._id)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === 'daily-report' && (
        <section key="daily-report-tab" className="section anim-tab-in">
          <div className="section-toolbar">
            <h2>Daily collections report</h2>
            <input
              type="date"
              value={dailyDate}
              onChange={(e) => setDailyDate(e.target.value)}
              className="search-input"
            />
            <button type="button" className="btn small primary" onClick={() => loadDailyReport(dailyDate)}>
              Load report
            </button>
          </div>
          {reportLoading ? (
            <LoadingSpinner label="Loading report..." inline />
          ) : dailyReport ? (
            <>
              <div className="card-grid">
                <div className="info-card">
                  <span className="label">Collections</span>
                  <span className="value">{formatMoney(dailyReport.summary.collectionTotal)}</span>
                </div>
                <div className="info-card">
                  <span className="label">Weekly paid</span>
                  <span className="value">{formatMoney(dailyReport.summary.weeklyPaymentsTotal)}</span>
                </div>
                <div className="info-card">
                  <span className="label">Charges</span>
                  <span className="value">{formatMoney(dailyReport.summary.chargesTotal)}</span>
                </div>
                <div className="info-card highlight">
                  <span className="label">Day total</span>
                  <span className="value">{formatMoney(dailyReport.summary.dayTotal)}</span>
                </div>
              </div>
              <div className="table-wrap" style={{ marginTop: '1.25rem' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Collection</th>
                      <th>Charges</th>
                      <th>Payments</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyReport.entries.length === 0 ? (
                      <tr><td colSpan={4}>No collection entries for this date.</td></tr>
                    ) : (
                      dailyReport.entries.map((row) => (
                        <tr key={row._id}>
                          <td>{row.name || '—'}</td>
                          <td>{formatMoney(row.collection)}</td>
                          <td>{formatMoney(row.charges)}</td>
                          <td>{formatMoney(row.payments)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </section>
      )}

      {tab === 'monthly-profit' && (
        <section key="monthly-profit-tab" className="section anim-tab-in">
          <div className="section-toolbar">
            <h2>Monthly profit report</h2>
            <input
              type="month"
              value={monthlyMonth}
              onChange={(e) => setMonthlyMonth(e.target.value)}
              className="search-input"
            />
            <button type="button" className="btn small primary" onClick={() => loadMonthlyReport(monthlyMonth)}>
              Load report
            </button>
          </div>
          {reportLoading ? (
            <LoadingSpinner label="Loading report..." inline />
          ) : monthlyReport ? (
            <div className="card-grid">
              <div className="info-card">
                <span className="label">Collection income</span>
                <span className="value">{formatMoney(monthlyReport.summary.collectionIncome)}</span>
              </div>
              <div className="info-card">
                <span className="label">Weekly income</span>
                <span className="value">{formatMoney(monthlyReport.summary.weeklyIncome)}</span>
              </div>
              <div className="info-card">
                <span className="label">Charges</span>
                <span className="value">{formatMoney(monthlyReport.summary.chargesIncome)}</span>
              </div>
              <div className="info-card">
                <span className="label">Payments out</span>
                <span className="value">{formatMoney(monthlyReport.summary.paymentsOut)}</span>
              </div>
              <div className="info-card highlight">
                <span className="label">Monthly profit</span>
                <span className="value large">{formatMoney(monthlyReport.summary.profit)}</span>
              </div>
            </div>
          ) : null}
        </section>
      )}

      {tab === 'defaulters' && (
        <section key="defaulters-tab" className="section anim-tab-in">
          <h2>Defaulters ({defaulterCount})</h2>
          <p className="muted-text">Customers with unpaid weekly payments.</p>
          <div className="table-wrap anim-scale-in" style={{ marginTop: '1rem' }}>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Place</th>
                  <th>Week</th>
                  <th>Due</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {defaulters.length === 0 ? (
                  <tr><td colSpan={7}>No defaulters. All payments are up to date.</td></tr>
                ) : (
                  defaulters.map((d) => (
                    <tr key={d.paymentId}>
                      <td>{d.name}</td>
                      <td>{d.place}</td>
                      <td>{formatDate(d.weekStart)}</td>
                      <td>
                        {formatDate(d.dueDate)}
                        {d.isOverdue && <span className="reminder-tag">Overdue</span>}
                      </td>
                      <td>{formatMoney(d.weeklyPayment)}</td>
                      <td>
                        {d.reminderSent ? (
                          <span className="badge warning">Reminded</span>
                        ) : (
                          <span className="badge warning">Pending</span>
                        )}
                      </td>
                      <td className="actions">
                        <button
                          type="button"
                          className="btn small warning"
                          onClick={() => sendReminder(d.paymentId, true)}
                        >
                          Remind
                        </button>
                        <button
                          type="button"
                          className="btn small whatsapp"
                          onClick={() => handleWhatsApp(d.phone, d.reminderMessage)}
                        >
                          WhatsApp
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'payment-approvals' && (
        <section key="payment-approvals-tab" className="section anim-tab-in">
          <div className="section-toolbar">
            <div>
              <h2>Payment Approvals</h2>
              <p className="muted-text">Review UPI screenshots submitted by customers.</p>
            </div>
            <button type="button" className="btn small primary" onClick={loadPaymentApprovals}>
              Refresh
            </button>
          </div>
          {approvalsLoading ? (
            <LoadingSpinner label="Loading payment approvals..." inline />
          ) : paymentApprovals.length === 0 ? (
            <div className="upi-empty-state">
              <strong>No screenshots waiting for approval.</strong>
              <p>Submitted UPI payments will appear here.</p>
            </div>
          ) : (
            <div className="payment-approval-grid">
              {paymentApprovals.map((payment) => (
                <article key={payment._id} className="payment-approval-card">
                  <div className="payment-approval-card__top">
                    <div>
                      <span className="upi-card__eyebrow">UPI Screenshot</span>
                      <h3>{payment.customerName}</h3>
                      <p>{payment.place} · {payment.phone}</p>
                    </div>
                    <span className={`badge ${payment.paymentStatus === 'rejected' ? 'warning' : 'success'}`}>
                      {payment.paymentStatus === 'rejected' ? 'Rejected' : 'Submitted'}
                    </span>
                  </div>
                  <div className="upi-details-grid compact">
                    <div>
                      <span>Due Amount</span>
                      <strong>{formatMoney(payment.amount)}</strong>
                    </div>
                    <div>
                      <span>Week</span>
                      <strong>{formatDate(payment.weekStart)}</strong>
                    </div>
                    <div>
                      <span>Uploaded</span>
                      <strong>{payment.screenshotUploadedAt ? formatDate(payment.screenshotUploadedAt) : 'Pending'}</strong>
                    </div>
                    <div>
                      <span>UPI ID</span>
                      <strong>9346697486@ptsbi</strong>
                    </div>
                  </div>
                  {payment.screenshot && (
                    <a
                      href={payment.screenshot}
                      target="_blank"
                      rel="noreferrer"
                      className="payment-shot-link"
                    >
                      <img src={payment.screenshot} alt={`${payment.customerName} payment screenshot`} />
                    </a>
                  )}
                  {payment.managerNote && (
                    <p className="payment-manager-note">{payment.managerNote}</p>
                  )}
                  <div className="payment-approval-actions">
                    <button
                      type="button"
                      className="btn small primary"
                      onClick={() => handleReviewPayment(payment._id, 'approve')}
                    >
                      Approve Payment
                    </button>
                    <button
                      type="button"
                      className="btn small danger"
                      onClick={() => handleReviewPayment(payment._id, 'reject')}
                    >
                      Reject Payment
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {tab === 'weekly' && (
        <section key="weekly-tab" className="section anim-tab-in">
          <h2>
            Weekly payment status
            {weekly?.weekStart && (
              <span className="week-label"> — Week of {formatDate(weekly.weekStart)}</span>
            )}
          </h2>
          {loading ? (
            <LoadingSpinner label="Loading payments..." inline />
          ) : (
            <div className="table-wrap anim-scale-in">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Place</th>
                    <th>Phone</th>
                    <th>Weekly ₹</th>
                    <th>Due</th>
                    <th>Status</th>
                    <th>Auto message</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {!weekly?.clients?.length ? (
                    <tr>
                      <td colSpan={8}>No clients yet. Add a client first.</td>
                    </tr>
                  ) : (
                    weekly.clients.map((c, i) => (
                      <tr key={c.clientId} className="anim-row-in" style={{ animationDelay: `${0.15 + i * 0.05}s` }}>
                        <td>{c.name}</td>
                        <td>{c.place}</td>
                        <td>{c.phone}</td>
                        <td>{formatMoney(c.weeklyPayment)}</td>
                        <td>
                          {c.dueDate ? formatDate(c.dueDate) : '—'}
                          {c.isOverdue && !c.paid && (
                            <span className="reminder-tag">Overdue</span>
                          )}
                        </td>
                        <td>
                          <span className={`badge ${c.paid ? 'success' : 'warning'}`}>
                            {c.paymentStatus === 'not-started'
                              ? 'Starts soon'
                              : c.paymentStatus === 'completed'
                                ? 'Completed'
                                : c.paid ? 'Paid' : 'Not paid'}
                          </span>
                          {c.paymentStatus === 'submitted' && !c.paid && (
                            <span className="reminder-tag">Approval pending</span>
                          )}
                          {c.paymentStatus === 'rejected' && !c.paid && (
                            <span className="reminder-tag">Screenshot rejected</span>
                          )}
                          {c.reminderSent && !c.paid && (
                            <span className="reminder-tag">Reminder sent</span>
                          )}
                        </td>
                        <td className="reminder-preview-cell">
                          {!c.paid && c.reminderPreview && (
                            <span className="reminder-preview" title={c.reminderPreview}>
                              {c.reminderPreview.length > 50
                                ? `${c.reminderPreview.slice(0, 50)}…`
                                : c.reminderPreview}
                            </span>
                          )}
                        </td>
                        <td className="actions">
                          {c.paymentId ? (
                            <>
                              <button
                                type="button"
                                className="btn small"
                                onClick={() => togglePaid(c.paymentId, c.paid)}
                              >
                                {c.paid ? 'Mark unpaid' : 'Mark paid'}
                              </button>
                              {!c.paid && (
                                <>
                              <button
                                type="button"
                                className="btn small warning"
                                onClick={() => sendReminder(c.paymentId, true)}
                                title="Save reminder and open WhatsApp"
                              >
                                Remind
                              </button>
                              <button
                                type="button"
                                className="btn small whatsapp"
                                onClick={() =>
                                  handleWhatsApp(c.phone, c.reminderMessage || c.reminderPreview)
                                }
                              >
                                WhatsApp
                              </button>
                                </>
                              )}
                            </>
                          ) : (
                            <span className="muted-text">
                              {c.paymentStatus === 'not-started' ? 'Not started' : 'No action'}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
      </main>
    </div>
  );
}
