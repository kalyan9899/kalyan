import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import DashboardBg from '../components/DashboardBg';
import LoadingSpinner from '../components/LoadingSpinner';
import ManagerSidebar from '../components/ManagerSidebar';

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

export default function ManagerDashboard() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('dashboard');
  const [clients, setClients] = useState([]);
  const [weekly, setWeekly] = useState(null);
  const [collections, setCollections] = useState([]);
  const [form, setForm] = useState(emptyClient);
  const [collectionForm, setCollectionForm] = useState(emptyCollection);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [loading, setLoading] = useState(true);
  const [collectionLoading, setCollectionLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchClient, setSearchClient] = useState('');

  const loadClients = () => {
    api
      .getClients()
      .then(setClients)
      .catch((e) => setMessage({ type: 'error', text: e.message }));
  };

  const loadWeekly = () => {
    setLoading(true);
    api
      .getWeeklyStatus()
      .then(setWeekly)
      .catch((e) => setMessage({ type: 'error', text: e.message }))
      .finally(() => setLoading(false));
  };

  const loadCollections = () => {
    setCollectionLoading(true);
    api
      .getCollections()
      .then(setCollections)
      .catch((e) => setMessage({ type: 'error', text: e.message }))
      .finally(() => setCollectionLoading(false));
  };

  useEffect(() => {
    loadWeekly();
    loadClients();
  }, []);

  useEffect(() => {
    if (tab === 'collection') {
      loadCollections();
    }
  }, [tab]);

  const logout = () => {
    localStorage.clear();
    navigate('/');
  };

  const handleFormChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSearchChange = (e) => {
    setSearchClient(e.target.value);
  };

  const filteredClients = clients.filter((client) => {
    const term = searchClient.trim().toLowerCase();
    if (!term) return true;
    return (
      client.name.toLowerCase().includes(term) ||
      client.place.toLowerCase().includes(term) ||
      client.phone.includes(term)
    );
  });

  const handleAddClient = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage({ type: '', text: '' });
    try {
      await api.addClient(form);
      setForm(emptyClient);
      setMessage({ type: 'success', text: 'Client added successfully' });
      loadWeekly();
      setTab('weekly');
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const togglePaid = async (paymentId, currentPaid) => {
    try {
      await api.updatePayment(paymentId, !currentPaid);
      loadWeekly();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handleCollectionChange = (e) => {
    setCollectionForm({ ...collectionForm, [e.target.name]: e.target.value });
  };

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

  const sendReminder = async (paymentId) => {
    try {
      const res = await api.sendReminder(paymentId);
      setMessage({
        type: 'success',
        text: `${res.message} — ${res.smsPreview}`,
      });
      loadWeekly();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const pageTitles = {
    dashboard: 'Dashboard',
    weekly: 'Weekly payments',
    clients: 'Clients',
    collection: 'Collection',
    add: 'Add client',
  };

  const calculateMetrics = () => {
    const totalClients = clients.length;
    const totalPending = weekly?.clients?.filter((c) => !c.paid).length || 0;
    const totalPaid = weekly?.clients?.filter((c) => c.paid).length || 0;
    const totalCollected = collections.reduce((sum, c) => sum + Number(c.collection || 0), 0);
    return { totalClients, totalPending, totalPaid, totalCollected };
  };

  return (
    <div className="manager-layout dash-animated">
      <DashboardBg />
      <ManagerSidebar
        active={tab}
        onNavigate={setTab}
        onLogout={logout}
        mobileOpen={sidebarOpen}
        onMenuToggle={() => setSidebarOpen((v) => !v)}
        onCloseMobile={() => setSidebarOpen(false)}
      />

      <main className="manager-main">
        <header className="dash-header anim-fade-down">
          <div>
            <h1>{pageTitles[tab] || 'Manager Panel'}</h1>
            <p className="subtitle">{localStorage.getItem('name') || 'Lakshmi Ganapati'}</p>
          </div>
        </header>

        {message.text && (
          <div
            className={`alert anim-fade-up ${message.type === 'error' ? 'error' : 'success'}`}
          >
            {message.text}
          </div>
        )}

        {tab === 'dashboard' && (
          <section key="dashboard-tab" className="section anim-tab-in">
            <h2>Business Overview</h2>
            <div className="card-grid">
              <div className="info-card anim-fade-up">
                <span className="label">Total clients</span>
                <span className="value">{calculateMetrics().totalClients}</span>
              </div>
              <div className="info-card anim-fade-up">
                <span className="label">Pending payments</span>
                <span className="value">{calculateMetrics().totalPending}</span>
              </div>
              <div className="info-card anim-fade-up">
                <span className="label">Completed payments</span>
                <span className="value">{calculateMetrics().totalPaid}</span>
              </div>
              <div className="info-card anim-fade-up highlight">
                <span className="label">Total collected</span>
                <span className="value">₹{Number(calculateMetrics().totalCollected).toLocaleString('en-IN')}</span>
              </div>
            </div>
          </section>
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
                    <th>Weekly payment</th>
                    <th>Interest rate</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClients.length === 0 ? (
                    <tr>
                      <td colSpan={6}>{searchClient ? 'No clients found.' : 'No clients yet.'}</td>
                    </tr>
                  ) : (
                    filteredClients.map((client, i) => (
                      <tr
                        key={client._id}
                        className="anim-row-in"
                        style={{ animationDelay: `${0.08 + i * 0.03}s` }}
                      >
                        <td>{client.name}</td>
                        <td>{client.place}</td>
                        <td>{client.phone}</td>
                        <td>₹{Number(client.amountTaken).toLocaleString('en-IN')}</td>
                        <td>₹{Number(client.weeklyPayment).toLocaleString('en-IN')}</td>
                        <td>{client.interestRate}%</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

      {tab === 'add' && (
        <section key="add-tab" className="section card form-card anim-tab-in">
          <h2>Add new client</h2>
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
                  required
                  minLength={6}
                />
              </label>
            </div>
            <button type="submit" className="btn primary" disabled={submitting}>
              {submitting ? 'Adding...' : 'Add client'}
            </button>
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
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {!weekly?.clients?.length ? (
                    <tr>
                      <td colSpan={6}>No clients yet. Add a client first.</td>
                    </tr>
                  ) : (
                    weekly.clients.map((c, i) => (
                      <tr key={c.clientId} className="anim-row-in" style={{ animationDelay: `${0.15 + i * 0.05}s` }}>
                        <td>{c.name}</td>
                        <td>{c.place}</td>
                        <td>{c.phone}</td>
                        <td>₹{c.weeklyPayment.toLocaleString('en-IN')}</td>
                        <td>
                          <span className={`badge ${c.paid ? 'success' : 'warning'}`}>
                            {c.paid ? 'Paid' : 'Not paid'}
                          </span>
                          {c.reminderSent && !c.paid && (
                            <span className="reminder-tag">Reminder sent</span>
                          )}
                        </td>
                        <td className="actions">
                          <button
                            type="button"
                            className="btn small"
                            onClick={() => togglePaid(c.paymentId, c.paid)}
                          >
                            {c.paid ? 'Mark unpaid' : 'Mark paid'}
                          </button>
                          {!c.paid && (
                            <button
                              type="button"
                              className="btn small warning"
                              onClick={() => sendReminder(c.paymentId)}
                            >
                              Send reminder
                            </button>
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
