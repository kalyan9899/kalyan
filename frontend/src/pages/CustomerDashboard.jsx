import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import DashboardBg from '../components/DashboardBg';
import LoadingSpinner from '../components/LoadingSpinner';
import CustomerSidebar from '../components/CustomerSidebar';

function formatDate(d) {
  return new Date(d).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatMoney(n) {
  return `₹${Number(n).toLocaleString('en-IN')}`;
}

const pageTitles = {
  payments: 'Payment history',
  profile: 'Profile',
};

export default function CustomerDashboard() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [payments, setPayments] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('payments');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const getInitials = (name) => {
    return name
      ?.split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || 'CL';
  };

  useEffect(() => {
    Promise.all([api.getCustomerProfile(), api.getCustomerPayments()])
      .then(([p, pay]) => {
        setProfile(p);
        setPayments(pay);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const logout = () => {
    localStorage.clear();
    navigate('/');
  };

  const handlePayOnline = (payment) => {
    alert(`Pay online for ${formatMoney(payment.amount)}. Please contact your manager to complete payment.`);
  };

  const name = localStorage.getItem('name') || profile?.name;

  if (loading) return <LoadingSpinner />;
  if (error) return <div className="page center alert error anim-shake">{error}</div>;
  if (!profile) return null;

  const cards = [
    { label: 'Name', value: profile.name },
    { label: 'Place', value: profile.place },
    { label: 'Date amount taken', value: formatDate(profile.dateTaken) },
    { label: 'Amount taken', value: formatMoney(profile.amountTaken) },
    { label: 'Interest rate', value: `${profile.interestRate}%` },
    { label: 'Interest amount', value: formatMoney(profile.interestAmount) },
    {
      label: 'Weekly payment',
      value: formatMoney(profile.weeklyPayment),
      highlight: true,
      large: true,
    },
  ];

  return (
    <div className="manager-layout dash-animated">
      <DashboardBg />
      <CustomerSidebar
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
            <h1>{pageTitles[tab]}</h1>
            <p className="subtitle">Welcome back, {name}</p>
          </div>
          {!sidebarOpen && (
            <div className="customer-header-image" aria-label="Customer avatar" title={name}>
              <span className="customer-header-initials">{getInitials(name)}</span>
            </div>
          )}
        </header>

        {tab === 'payments' && (
          <>
            <div
              className={`status-banner ${profile.currentWeekPaid ? 'paid anim-fade-up' : 'pending'}`}
            >
              This week&apos;s payment: {profile.currentWeekPaid ? 'Paid ✓' : 'Pending'}
            </div>

            {profile.currentWeekReminderSent && !profile.currentWeekPaid && (
              <div className="alert warning anim-fade-up" style={{ marginTop: '1rem' }}>
                <strong>Reminder received:</strong>{' '}
                {profile.currentWeekReminderMessage || 'Your manager has sent a reminder for this week.'}
              </div>
            )}
          </>
        )}

        {tab === 'payments' && (
          <section className="section anim-tab-in">
            <h2>Payment history</h2>
            <div className="table-wrap anim-scale-in" style={{ animationDelay: '0.1s' }}>
              <table>
                <thead>
                  <tr>
                    <th>Week starting</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.length === 0 ? (
                    <tr>
                      <td colSpan={4}>No payment records yet</td>
                    </tr>
                  ) : (
                    payments.map((p, i) => (
                      <tr
                        key={p._id}
                        className="anim-row-in"
                        style={{ animationDelay: `${0.08 + i * 0.05}s` }}
                      >
                        <td>{formatDate(p.weekStart)}</td>
                        <td>{formatMoney(p.amount)}</td>
                        <td>
                          <span className={`badge ${p.paid ? 'success' : 'warning'}`}>
                            {p.paid ? 'Paid' : 'Pending'}
                          </span>
                        </td>
                        <td>
                          {p.paid ? (
                            <button type="button" className="btn small" disabled>
                              Paid
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn small primary"
                              onClick={() => handlePayOnline(p)}
                            >
                              Pay online
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === 'profile' && (
          <section className="section anim-tab-in">
            <h2>Account details</h2>
            <div className="card-grid">
              {cards.map((card, i) => (
                <div
                  key={card.label}
                  className={`info-card anim-fade-up ${card.highlight ? 'highlight' : ''}`}
                  style={{ animationDelay: `${0.08 + i * 0.06}s` }}
                >
                  <span className="label">{card.label}</span>
                  <span className={`value ${card.large ? 'large' : ''}`}>{card.value}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
