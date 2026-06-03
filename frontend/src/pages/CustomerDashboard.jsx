import { Suspense, lazy, useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import CustomerSidebar from '../components/CustomerSidebar';
import CustomerAvatar from '../components/CustomerAvatar';

const DashboardBg = lazy(() => import('../components/DashboardBg'));

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
  reminders: 'Weekly reminders',
  profile: 'Profile',
};

function CustomerDashboardSkeleton() {
  return (
    <div className="manager-layout dash-animated customer-dashboard-skeleton">
      <Suspense fallback={null}>
        <DashboardBg />
      </Suspense>
      <aside className="manager-sidebar customer-skeleton-sidebar" aria-hidden="true">
        <div className="customer-skeleton-logo" />
        <div className="customer-skeleton-line wide" />
        <div className="customer-skeleton-nav" />
        <div className="customer-skeleton-nav" />
        <div className="customer-skeleton-nav" />
      </aside>
      <main className="manager-main">
        <header className="dash-header">
          <div>
            <div className="customer-skeleton-line title" />
            <div className="customer-skeleton-line subtitle" />
          </div>
          <div className="customer-skeleton-avatar" />
        </header>
        <section className="section">
          <div className="profile-photo-block">
            <div className="customer-skeleton-avatar large" />
            <div className="customer-skeleton-stack">
              <div className="customer-skeleton-line title" />
              <div className="customer-skeleton-line subtitle" />
              <div className="customer-skeleton-actions" />
            </div>
          </div>
          <div className="card-grid">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="info-card customer-skeleton-card">
                <div className="customer-skeleton-line" />
                <div className="customer-skeleton-line value" />
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

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
      return api
        .getCustomerDashboard()
        .then(({ profile: p, payments: pay, reminders: rem }) => {
          if (!active) return;
          setProfile(p);
          setPayments(pay || []);
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
    const refreshTimer = setInterval(() => {
      if (!document.hidden) loadCustomerData(true);
    }, 15000);
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
      pa: '9346697486@axl',
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
    if (file.size > 3 * 1024 * 1024) {
      setPaymentMessage('Screenshot must be under 3 MB before compression.');
      return;
    }

    setScreenshotUploading(true);
    setPaymentMessage('');
    try {
      const dataUrl = await readCompressedImageAsDataUrl(file, {
        maxSize: 1280,
        mimeType: 'image/jpeg',
        quality: 0.82,
      });
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

  const handleDownloadReceipt = async (payment) => {
    const totalAmount = Number(profile.totalPayable ?? (Number(profile.amountTaken) + Number(profile.interestAmount)));
    const paidThroughReceipt = payments
      .filter((p) => p.paid && new Date(p.weekStart) <= new Date(payment.weekStart))
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const { downloadPaymentReceipt } = await import('../utils/receiptPdf');
    await downloadPaymentReceipt(
      {
        name: profile.name,
        place: profile.place,
        phone: profile.phone,
        amountTaken: profile.amountTaken,
        totalAmount,
        totalPaid: paidThroughReceipt,
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
    if (file.size > 2 * 1024 * 1024) {
      setPhotoMessage('Image must be under 2 MB before compression.');
      return;
    }

    setPhotoUploading(true);
    setPhotoMessage('');
    try {
      const dataUrl = await readCompressedImageAsDataUrl(file, {
        maxSize: 520,
        mimeType: 'image/webp',
        quality: 0.76,
      });
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

  if (loading) return <CustomerDashboardSkeleton />;
  if (error) return <div className="page center alert error anim-shake">{error}</div>;
  if (!profile) return null;

  const totalAmount = Number(profile.totalPayable ?? (Number(profile.amountTaken) + Number(profile.interestAmount)));
  const remainingAmount = Math.max(totalAmount - totalPaid, 0);
  const paymentProgress = totalAmount > 0 ? Math.min(100, Math.round((totalPaid / totalAmount) * 100)) : 0;
  const latestPayments = payments
    .filter((p) => !p.isFuture)
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
      label: 'Total payable',
      value: formatMoney(totalAmount),
      highlight: true,
    },
    {
      label: 'Weekly payment',
      value: formatMoney(profile.weeklyPayment),
      highlight: true,
      large: true,
    },
  ];

  const totalPlanWeeks = paymentSchedule.totalWeeks || profile.totalWeeks || 25;
  const reminderSchedule = reminderData?.paymentSchedule || {};
  const reminderTotalWeeks = reminderSchedule.totalWeeks || totalPlanWeeks;

  const currentWeekLabel = paymentSchedule.isBeforeStart
    ? `Week 1 starts ${formatDate(paymentSchedule.firstPaymentWeekStart)}`
    : paymentSchedule.isAfterSchedule
      ? `${totalPlanWeeks} weeks complete`
      : `Week ${paymentSchedule.currentWeekNumber || 1} of ${totalPlanWeeks}`;
  const paymentStatusText = paymentSchedule.isBeforeStart
    ? `Payments start from ${formatDate(paymentSchedule.firstPaymentWeekStart)}`
    : paymentSchedule.isAfterSchedule
      ? `${totalPlanWeeks}-week payment schedule complete`
      : `${currentWeekLabel}: ${profile.currentWeekPaid ? 'Paid' : 'Pending'}`;
  const reminderStartsNextWeek = Boolean(reminderSchedule.isBeforeStart);
  const reminderWeekLabel = reminderStartsNextWeek
    ? `Week 1 starts ${formatDate(reminderSchedule.firstPaymentWeekStart)}`
    : reminderSchedule.isAfterSchedule
      ? `${reminderTotalWeeks} weeks complete`
      : `Week ${reminderSchedule.currentWeekNumber || 1} of ${reminderTotalWeeks}`;

  return (
    <div className="manager-layout dash-animated">
      <Suspense fallback={null}>
        <DashboardBg />
      </Suspense>
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
                  <span className="customer-stat__label">Current week</span>
                  <strong>{currentWeekLabel}</strong>
                  <p>{paymentSchedule.isBeforeStart ? 'Starts next week' : profile.currentWeekPaid ? 'Paid' : 'Pending'}</p>
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
                    <span>Payment Amount</span>
                    <strong>{formatMoney(profile.upiPayment?.amount || profile.weeklyPayment)}</strong>
                  </div>
                  <div>
                    <span>UPI ID</span>
                    <strong>9346697486@axl</strong>
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
                    <th>Week</th>
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
                        <td>
                          <strong>Week {p.weekNumber || i + 1}</strong>
                          <span className="reminder-list__due">Starting {formatDate(p.weekStart)}</span>
                        </td>
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
                          ) : p.isFuture || !p.paymentId ? (
                            <span className="badge warning">Pending</span>
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
            <div className="due-reminder-card">
              <h2>Weekly payment status</h2>
              <p className="due-reminder-card__date">{reminderWeekLabel}</p>
              <p className="due-reminder-card__countdown">
                {reminderStartsNextWeek ? 'Starts next week' : reminderData.currentWeekPaid ? 'Paid' : 'Pending'}
              </p>
              <p className="due-reminder-card__amount">
                Weekly amount: {formatMoney(reminderData.weeklyAmount || profile.weeklyPayment)}
              </p>
              {reminderStartsNextWeek ? (
                <span className="badge warning">Week 1 starts next week</span>
              ) : reminderSchedule.isAfterSchedule ? (
                <span className="badge success">{reminderTotalWeeks} weeks complete</span>
              ) : reminderData.currentWeekPaid ? (
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
                          Pending weekly payment
                        </span>
                      </div>
                      <p>{r.reminderMessage || 'Please pay your weekly amount.'}</p>
                      <span className="reminder-list__amount">{formatMoney(r.amount)}</span>
                    </li>
                  ))}
              </ul>
            )}

            <h2 style={{ marginTop: '1.5rem' }}>{totalPlanWeeks} week payment plan</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Week</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.length === 0 ? (
                    <tr>
                      <td colSpan={3}>No weekly payment plan yet</td>
                    </tr>
                  ) : (
                    payments.map((p) => (
                      <tr key={p._id}>
                        <td>
                          <strong>Week {p.weekNumber}</strong>
                          <span className="reminder-list__due">Starting {formatDate(p.weekStart)}</span>
                        </td>
                        <td>{formatMoney(p.amount)}</td>
                        <td>
                          {p.paid ? (
                            <span className="badge success">Paid</span>
                          ) : (
                            <span className="badge warning">Pending</span>
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

            {profile.latestTopUp && (
              <div className="topup-plan-card anim-fade-up">
                <div className="topup-plan-card__head">
                  <div>
                    <span>Active top-up plan</span>
                    <strong>{formatMoney(profile.latestTopUp.newTotalPayable)}</strong>
                  </div>
                  <em>{profile.latestTopUp.totalWeeks || totalPlanWeeks} weeks</em>
                </div>
                <div className="topup-plan-grid">
                  <div>
                    <span>Old balance</span>
                    <strong>{formatMoney(profile.latestTopUp.previousRemainingAmount)}</strong>
                  </div>
                  <div>
                    <span>Top-up amount</span>
                    <strong>{formatMoney(profile.latestTopUp.newAmountTaken)}</strong>
                  </div>
                  <div>
                    <span>Interest</span>
                    <strong>{formatMoney(profile.latestTopUp.newInterestAmount)}</strong>
                  </div>
                  <div>
                    <span>Weekly payment</span>
                    <strong>{formatMoney(profile.latestTopUp.newWeeklyPayment)}</strong>
                  </div>
                  <div>
                    <span>First payment</span>
                    <strong>{formatDate(profile.latestTopUp.firstPaymentDate)}</strong>
                  </div>
                </div>
              </div>
            )}

            <h2 style={{ marginTop: '1.5rem' }}>Top-up history</h2>
            {!profile.topUpHistory?.length ? (
              <p className="muted-text">No top-ups recorded yet.</p>
            ) : (
              <div className="renewal-timeline">
                {profile.topUpHistory.map((topUp, i) => (
                  <article key={`${topUp.topUpAt}-${i}`} className="renewal-timeline__item anim-fade-up">
                    <div>
                      <strong>Top-up on {formatDate(topUp.topUpAt)}</strong>
                      {topUp.note && <p>{topUp.note}</p>}
                    </div>
                    <div className="renewal-timeline__amounts">
                      <span>Old balance {formatMoney(topUp.previousRemainingAmount)}</span>
                      <span>Top-up {formatMoney(topUp.newAmountTaken)}</span>
                      <span>Total {formatMoney(topUp.newTotalPayable)}</span>
                      <span>Weekly {formatMoney(topUp.newWeeklyPayment)}</span>
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

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({ image, url });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not load image file'));
    };
    image.src = url;
  });
}

async function readCompressedImageAsDataUrl(file, options = {}) {
  if (!file.type?.startsWith('image/') || typeof document === 'undefined') {
    return readFileAsDataUrl(file);
  }

  const { image, url } = await loadImageFromFile(file);
  try {
    const maxSize = options.maxSize || 1280;
    const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d', { alpha: options.mimeType === 'image/png' });
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, options.mimeType || file.type, options.quality || 0.82)
    );
    return blob ? readFileAsDataUrl(blob) : readFileAsDataUrl(file);
  } finally {
    URL.revokeObjectURL(url);
  }
}
