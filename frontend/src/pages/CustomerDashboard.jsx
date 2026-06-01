import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { downloadPaymentReceipt } from '../utils/receiptPdf';
import DashboardBg from '../components/DashboardBg';
import LoadingSpinner from '../components/LoadingSpinner';
import CustomerSidebar from '../components/CustomerSidebar';
import CustomerAvatar from '../components/CustomerAvatar';

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
  reminders: 'Due date reminders',
  profile: 'Profile',
};

export default function CustomerDashboard() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const screenshotInputRef = useRef(null);
  const [profile, setProfile] = useState(null);
  const [payments, setPayments] = useState([]);
  const [reminderData, setReminderData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('profile');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoMessage, setPhotoMessage] = useState('');
  const [activePaymentId, setActivePaymentId] = useState('');
  const [screenshotUploading, setScreenshotUploading] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState('');

  useEffect(() => {
    let active = true;

    const loadCustomerData = (silent = false) => {
      if (!silent) setLoading(true);
      return Promise.all([
        api.getCustomerProfile(),
        api.getCustomerPayments(),
        api.getCustomerReminders(),
      ])
        .then(([p, pay, rem]) => {
          if (!active) return;
          setProfile(p);
          setPayments(pay);
          setReminderData(rem);
          setError('');
        })
        .catch((e) => {
          if (active && !silent) setError(e.message);
        })
        .finally(() => {
          if (active && !silent) setLoading(false);
        });
    };

    loadCustomerData();
    const refreshTimer = setInterval(() => loadCustomerData(true), 10000);
    return () => {
      active = false;
      clearInterval(refreshTimer);
    };
  }, []);

  const logout = () => {
    localStorage.clear();
    sessionStorage.clear();
    navigate('/');
  };

  const getUpiLink = (amount) => {
    const params = new URLSearchParams({
      pa: '9346697486@ptsbi',
      pn: 'Lakshmi Ganapati Finance',
      am: Number(amount || 0).toFixed(2),
      cu: 'INR',
      tn: 'Weekly Payment',
    });
    return `upi://pay?${params.toString()}`;
  };

  const handlePayOnline = (payment) => {
    setActivePaymentId(payment._id);
    setPaymentMessage('Complete the UPI payment, then upload the payment screenshot.');
    window.open(getUpiLink(payment.amount), '_blank', 'noopener,noreferrer');
  };

  const handleScreenshotSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !activePaymentId) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setPaymentMessage('Please choose a JPG or PNG screenshot.');
      return;
    }
    if (file.size > 1024 * 1024) {
      setPaymentMessage('Screenshot must be under 1 MB.');
      return;
    }

    setScreenshotUploading(true);
    setPaymentMessage('');
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const updated = await api.uploadPaymentScreenshot(activePaymentId, dataUrl);
      setPayments((current) =>
        current.map((p) =>
          p._id === activePaymentId
            ? { ...p, paymentStatus: updated.paymentStatus, screenshotUploadedAt: updated.screenshotUploadedAt }
            : p
        )
      );
      if (profile.currentWeekPaymentId === activePaymentId) {
        setProfile((prev) => ({ ...prev, currentWeekPaymentStatus: updated.paymentStatus }));
      }
      setPaymentMessage('Screenshot submitted. Your manager can now approve the payment.');
    } catch (err) {
      setPaymentMessage(err.message);
    } finally {
      setScreenshotUploading(false);
      e.target.value = '';
    }
  };

  const handleDownloadReceipt = (payment) => {
    downloadPaymentReceipt(
      {
        name: profile.name,
        place: profile.place,
        phone: profile.phone,
      },
      payment
    );
  };

  const handlePhotoSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setPhotoMessage('Please choose a JPEG or PNG image.');
      return;
    }
    if (file.size > 300 * 1024) {
      setPhotoMessage('Image must be under 300 KB.');
      return;
    }

    setPhotoUploading(true);
    setPhotoMessage('');
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const { profilePhoto } = await api.uploadCustomerPhoto(dataUrl);
      setProfile((prev) => ({ ...prev, profilePhoto }));
      setPhotoMessage('Profile photo updated.');
    } catch (err) {
      setPhotoMessage(err.message);
    } finally {
      setPhotoUploading(false);
      e.target.value = '';
    }
  };

  const handleRemovePhoto = async () => {
    setPhotoUploading(true);
    setPhotoMessage('');
    try {
      await api.removeCustomerPhoto();
      setProfile((prev) => ({ ...prev, profilePhoto: '' }));
      setPhotoMessage('Profile photo removed.');
    } catch (err) {
      setPhotoMessage(err.message);
    } finally {
      setPhotoUploading(false);
    }
  };

  const name = sessionStorage.getItem('name') || localStorage.getItem('name') || profile?.name;

  const paidCount = payments.filter((p) => p.paid).length;
  const pendingCount = payments.filter((p) => !p.paid).length;
  const totalPaid = payments.filter((p) => p.paid).reduce((sum, p) => sum + p.amount, 0);
  const approvalPendingCount = payments.filter((p) => p.paymentStatus === 'submitted').length;

  if (loading) return <LoadingSpinner />;
  if (error) return <div className="page center alert error anim-shake">{error}</div>;
  if (!profile) return null;

  const totalAmount = Number(profile.amountTaken) + Number(profile.interestAmount);
  const remainingAmount = Math.max(totalAmount - totalPaid, 0);
  const paymentProgress = totalAmount > 0 ? Math.min(100, Math.round((totalPaid / totalAmount) * 100)) : 0;
  const latestPayments = [...payments]
    .sort((a, b) => new Date(b.weekStart) - new Date(a.weekStart))
    .slice(0, 6);
  const paidStreak = latestPayments.reduce((streak, payment) => {
    if (streak.stopped || !payment.paid) return { ...streak, stopped: true };
    return { count: streak.count + 1, stopped: false };
  }, { count: 0, stopped: false }).count;
  const paymentSchedule = profile.paymentSchedule || {};

  const cards = [
    { label: 'Name', value: profile.name },
    { label: 'Place', value: profile.place },
    { label: 'Phone', value: profile.phone },
    { label: 'Date amount taken', value: formatDate(profile.dateTaken) },
    { label: 'Amount taken', value: formatMoney(profile.amountTaken) },
    { label: 'Interest rate', value: `${profile.interestRate}%` },
    { label: 'Interest amount', value: formatMoney(profile.interestAmount) },
    {
      label: 'Total amount',
      value: formatMoney(Number(profile.amountTaken) + Number(profile.interestAmount)),
      highlight: true,
    },
    {
      label: 'Weekly payment',
      value: formatMoney(profile.weeklyPayment),
      highlight: true,
      large: true,
    },
  ];

  const dueLabel = paymentSchedule.isAfterSchedule
    ? '25 weeks complete'
    : profile.isOverdue
      ? 'Overdue'
      : profile.daysUntilDue === 0
        ? 'Due today'
        : profile.daysUntilDue === 1
          ? 'Due tomorrow'
          : `${profile.daysUntilDue} days left`;
  const paymentStatusText = paymentSchedule.isBeforeStart
    ? `Payments start from ${formatDate(paymentSchedule.firstPaymentWeekStart)}`
    : paymentSchedule.isAfterSchedule
      ? '25-week payment schedule complete'
      : `This week's payment: ${profile.currentWeekPaid ? 'Paid' : 'Pending'}`;

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
        pendingReminders={
          reminderData?.reminders?.filter((r) => r.reminderSent && !r.isCurrentWeek)?.length || 0
        }
      />

      <main className="manager-main">
        <header className="dash-header anim-fade-down">
          <div>
            <h1>{pageTitles[tab]}</h1>
            <p className="subtitle">Welcome back, {name}</p>
          </div>
          {!sidebarOpen && (
            <CustomerAvatar name={name} photo={profile.profilePhoto} size="md" />
          )}
        </header>

        {tab === 'payments' && (
          <>
            <div
              className={`status-banner ${profile.currentWeekPaid ? 'paid anim-fade-up' : 'pending'}`}
            >
              {paymentStatusText}
              {!profile.currentWeekPaid && !paymentSchedule.isAfterSchedule && (
                <span className="status-banner__due">
                  · Due by {formatDate(profile.dueDate)} ({dueLabel})
                </span>
              )}
            </div>

            {profile.currentWeekReminderSent && !profile.currentWeekPaid && (
              <div className="alert warning anim-fade-up" style={{ marginTop: '1rem' }}>
                <strong>Reminder received:</strong>{' '}
                {profile.currentWeekReminderMessage ||
                  'Your manager has sent a reminder for this week.'}
              </div>
            )}

            <div className="customer-stats anim-fade-up">
              <div className="customer-stat">
                <span className="customer-stat__label">Weeks paid</span>
                <span className="customer-stat__value">{paidCount}</span>
              </div>
              <div className="customer-stat">
                <span className="customer-stat__label">Pending</span>
                <span className="customer-stat__value warning">{pendingCount}</span>
              </div>
              <div className="customer-stat">
                <span className="customer-stat__label">Total paid</span>
                <span className="customer-stat__value">{formatMoney(totalPaid)}</span>
              </div>
            </div>

            <div className="customer-insights anim-fade-up">
              <div className="customer-progress-card">
                <div
                  className="customer-progress-ring"
                  style={{ '--progress': `${paymentProgress}%` }}
                  aria-label={`${paymentProgress}% paid`}
                >
                  <span>{paymentProgress}%</span>
                </div>
                <div>
                  <span className="customer-stat__label">Repayment progress</span>
                  <strong>{formatMoney(totalPaid)} paid</strong>
                  <p>{formatMoney(remainingAmount)} remaining</p>
                </div>
              </div>
              <div className="customer-feature-card">
                <span className="customer-feature-card__icon">₹</span>
                <div>
                  <span className="customer-stat__label">Next due</span>
                  <strong>{paymentSchedule.isAfterSchedule ? 'Completed' : profile.currentWeekPaid ? 'All clear' : formatDate(profile.dueDate)}</strong>
                  <p>{paymentSchedule.isBeforeStart ? 'Week 1 starts next week' : profile.currentWeekPaid ? 'This week is paid' : dueLabel}</p>
                </div>
              </div>
              <div className="customer-feature-card">
                <span className="customer-feature-card__icon">✓</span>
                <div>
                  <span className="customer-stat__label">Paid streak</span>
                  <strong>{paidStreak} week{paidStreak === 1 ? '' : 's'}</strong>
                  <p>Recent on-time payments</p>
                </div>
              </div>
              <div className="customer-feature-card">
                <span className="customer-feature-card__icon">UPI</span>
                <div>
                  <span className="customer-stat__label">Approvals</span>
                  <strong>{approvalPendingCount}</strong>
                  <p>Screenshot review pending</p>
                </div>
              </div>
            </div>

            {!profile.currentWeekPaid && profile.currentWeekPaymentId && !paymentSchedule.isBeforeStart && (
              <section className="upi-card anim-fade-up">
                <div className="upi-card__header">
                  <div>
                    <span className="upi-card__eyebrow">Direct UPI</span>
                    <h2>Weekly Payment</h2>
                  </div>
                  <div className="upi-card__amount">{formatMoney(profile.upiPayment?.amount || profile.weeklyPayment)}</div>
                </div>
                <div className="upi-card__apps" aria-label="Supported UPI apps">
                  <span>GPay</span>
                  <span>PhonePe</span>
                  <span>Paytm</span>
                </div>
                <div className="upi-details-grid">
                  <div>
                    <span>Customer Name</span>
                    <strong>{profile.name}</strong>
                  </div>
                  <div>
                    <span>Due Amount</span>
                    <strong>{formatMoney(profile.upiPayment?.amount || profile.weeklyPayment)}</strong>
                  </div>
                  <div>
                    <span>UPI ID</span>
                    <strong>9346697486@ptsbi</strong>
                  </div>
                  <div>
                    <span>Payment Note</span>
                    <strong>Weekly Payment</strong>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn upi-pay-btn"
                  onClick={() =>
                    handlePayOnline({
                      _id: profile.currentWeekPaymentId,
                      amount: profile.upiPayment?.amount || profile.weeklyPayment,
                    })
                  }
                  disabled={!profile.currentWeekPaymentId}
                >
                  Pay Now
                </button>
                {(activePaymentId === profile.currentWeekPaymentId ||
                  ['submitted', 'rejected'].includes(profile.currentWeekPaymentStatus)) && (
                  <div className="upi-upload-panel">
                    <div>
                      <strong>Upload Payment Screenshot</strong>
                      <p>JPG or PNG, max 1 MB</p>
                    </div>
                    <input
                      ref={screenshotInputRef}
                      type="file"
                      accept="image/jpeg,image/png"
                      hidden
                      onChange={handleScreenshotSelect}
                    />
                    <button
                      type="button"
                      className="btn small"
                      disabled={screenshotUploading}
                      onClick={() => {
                        setActivePaymentId(profile.currentWeekPaymentId);
                        screenshotInputRef.current?.click();
                      }}
                    >
                      {screenshotUploading ? 'Uploading...' : 'Upload screenshot'}
                    </button>
                  </div>
                )}
                {paymentMessage && <p className="upi-message">{paymentMessage}</p>}
              </section>
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
                    <th>Due by</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.length === 0 ? (
                    <tr>
                      <td colSpan={5}>No payment records yet</td>
                    </tr>
                  ) : (
                    payments.map((p, i) => (
                      <tr
                        key={p._id}
                        className="anim-row-in"
                        style={{ animationDelay: `${0.08 + i * 0.05}s` }}
                      >
                        <td>{formatDate(p.weekStart)}</td>
                        <td>{formatDate(p.dueDate)}</td>
                        <td>{formatMoney(p.amount)}</td>
                        <td>
                          <span className={`badge ${p.paid ? 'success' : 'warning'}`}>
                            {p.paid ? 'Paid' : 'Pending'}
                          </span>
                          {p.reminderSent && !p.paid && (
                            <span className="reminder-tag">Reminder</span>
                          )}
                        </td>
                        <td className="customer-actions-cell">
                          {p.paid ? (
                            <button
                              type="button"
                              className="btn small"
                              onClick={() => handleDownloadReceipt(p)}
                            >
                              PDF receipt
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="btn small primary"
                                onClick={() => handlePayOnline(p)}
                              >
                                Pay Now
                              </button>
                              {p.paymentStatus === 'submitted' && (
                                <span className="badge warning">Approval pending</span>
                              )}
                              {p.paymentStatus === 'rejected' && (
                                <span className="badge warning">Rejected</span>
                              )}
                            </>
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

        {tab === 'reminders' && reminderData && (
          <section className="section anim-tab-in">
            <div
              className={`due-reminder-card ${profile.isOverdue ? 'overdue' : profile.daysUntilDue <= 2 ? 'urgent' : ''}`}
            >
              <h2>Next payment due</h2>
              <p className="due-reminder-card__date">{formatDate(reminderData.nextDueDate)}</p>
              <p className="due-reminder-card__countdown">{dueLabel}</p>
              <p className="due-reminder-card__amount">
                Weekly amount: {formatMoney(reminderData.weeklyAmount || profile.weeklyPayment)}
              </p>
              {reminderData.currentWeekPaid ? (
                <span className="badge success">This week is paid</span>
              ) : (
                <span className="badge warning">Payment pending for this week</span>
              )}
            </div>

            <h2 style={{ marginTop: '1.5rem' }}>Manager reminders</h2>
            {reminderData.reminders.filter((r) => r.reminderSent).length === 0 ? (
              <p className="muted-text">No reminders from your manager yet.</p>
            ) : (
              <ul className="reminder-list">
                {reminderData.reminders
                  .filter((r) => r.reminderSent)
                  .map((r) => (
                    <li key={r._id} className="reminder-list__item anim-fade-up">
                      <div>
                        <strong>Week of {formatDate(r.weekStart)}</strong>
                        <span className="reminder-list__due">
                          Due {formatDate(r.dueDate)}
                          {!r.isCurrentWeek && r.daysUntilDue < 0
                            ? ' (overdue)'
                            : r.daysUntilDue >= 0
                              ? ` · ${r.daysUntilDue} days left`
                              : ''}
                        </span>
                      </div>
                      <p>{r.reminderMessage || 'Please pay your weekly amount.'}</p>
                      <span className="reminder-list__amount">{formatMoney(r.amount)}</span>
                    </li>
                  ))}
              </ul>
            )}

            <h2 style={{ marginTop: '1.5rem' }}>Upcoming due dates</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Week</th>
                    <th>Due by</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {reminderData.reminders.length === 0 ? (
                    <tr>
                      <td colSpan={4}>No pending payments</td>
                    </tr>
                  ) : (
                    reminderData.reminders.map((r) => (
                      <tr key={r._id}>
                        <td>{formatDate(r.weekStart)}</td>
                        <td>{formatDate(r.dueDate)}</td>
                        <td>{formatMoney(r.amount)}</td>
                        <td>
                          {r.isCurrentWeek && reminderData.currentWeekPaid ? (
                            <span className="badge success">Paid</span>
                          ) : (
                            <span className="badge warning">
                              {r.daysUntilDue < 0
                                ? 'Overdue'
                                : r.daysUntilDue === 0
                                  ? 'Due today'
                                  : `${r.daysUntilDue} days`}
                            </span>
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
            <div className="profile-photo-block anim-fade-up">
              <CustomerAvatar name={profile.name} photo={profile.profilePhoto} size="lg" />
              <div className="profile-photo-block__actions">
                <h2>Profile photo</h2>
                <p className="muted-text">JPEG or PNG, max 300 KB</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  hidden
                  onChange={handlePhotoSelect}
                />
                <div className="profile-photo-block__btns">
                  <button
                    type="button"
                    className="btn small primary"
                    disabled={photoUploading}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {photoUploading ? 'Uploading…' : 'Upload photo'}
                  </button>
                  {profile.profilePhoto && (
                    <button
                      type="button"
                      className="btn small"
                      disabled={photoUploading}
                      onClick={handleRemovePhoto}
                    >
                      Remove
                    </button>
                  )}
                </div>
                {photoMessage && (
                  <p className={`profile-photo-msg ${photoMessage.includes('updated') ? 'success' : ''}`}>
                    {photoMessage}
                  </p>
                )}
              </div>
            </div>

            <h2 style={{ marginTop: '1.5rem' }}>Account details</h2>
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

            <h2 style={{ marginTop: '1.5rem' }}>Renewal history</h2>
            {!profile.renewalHistory?.length ? (
              <p className="muted-text">No renewals recorded yet.</p>
            ) : (
              <div className="renewal-timeline">
                {profile.renewalHistory.map((renewal, i) => (
                  <article key={`${renewal.renewedAt}-${i}`} className="renewal-timeline__item anim-fade-up">
                    <div>
                      <strong>Renewed on {formatDate(renewal.renewedAt)}</strong>
                      {renewal.note && <p>{renewal.note}</p>}
                    </div>
                    <div className="renewal-timeline__amounts">
                      <span>Old {formatMoney(renewal.previousAmountTaken)}</span>
                      <span>New {formatMoney(renewal.newAmountTaken)}</span>
                      <span>Weekly {formatMoney(renewal.newWeeklyPayment)}</span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read image file'));
    reader.readAsDataURL(file);
  });
}
