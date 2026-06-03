import { memo, useMemo } from 'react';
import { LOGO_SRC } from '../constants/brand';
import './ManagerDashboard.css';

function formatMoney(n) {
  return `₹${Number(n || 0).toLocaleString('en-IN')}`;
}

function formatDate(d) {
  return new Date(d).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getInitials(name) {
  return (
    name
      ?.split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || '?'
  );
}

function SkeletonCard({ rows = 3, compact = false }) {
  return (
    <div className={`mg-skeleton-card ${compact ? 'mg-skeleton-card--compact' : ''}`}>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="mg-skeleton-line" />
      ))}
    </div>
  );
}

const LineChart = memo(function LineChart({ data, monthLabel }) {
  if (!data?.length) return <p className="mg-muted">No data for this month yet.</p>;

  const w = 100;
  const h = 48;
  const max = useMemo(() => Math.max(...data.map((d) => Math.max(d.collected, d.pending)), 1), [data]);
  const points = useMemo(
    () => data.map((d, i) => {
      const toY = (v) => h - (v / max) * (h - 4) - 2;
      const toX = (i2) => (i2 / Math.max(data.length - 1, 1)) * w;
      return {
        pending: `${toX(i)},${toY(d.pending)}`,
        collected: `${toX(i)},${toY(d.collected)}`,
      };
    }),
    [data, h, max, w]
  );

  return (
    <div className="mg-chart-wrap">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="mg-line-chart">
        <polyline
          points={points.map((point) => point.pending).join(' ')}
          fill="none"
          stroke="#ef4444"
          strokeWidth="0.9"
          strokeDasharray="2 1.5"
          vectorEffect="non-scaling-stroke"
        />
        <polyline
          points={points.map((point) => point.collected).join(' ')}
          fill="none"
          stroke="#15803d"
          strokeWidth="1.2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="mg-chart-legend">
        <span><i className="dot green" /> Collected Amount</span>
        <span><i className="dot red" /> Pending Amount</span>
      </div>
      <p className="mg-chart-caption">{monthLabel}</p>
    </div>
  );
});

const DonutChart = memo(function DonutChart({ overview }) {
  const { total, active, inactive, newThisMonth } = overview;
  if (!total) return <p className="mg-muted">No clients yet</p>;

  const { aPct, iPct, bg } = useMemo(() => {
    const totalValue = total || 1;
    const a = (active / totalValue) * 100;
    const i = (inactive / totalValue) * 100;
    return {
      aPct: a,
      iPct: i,
      bg: `conic-gradient(#15803d 0% ${a}%, #94a3b8 ${a}% ${a + i}%, #3b82f6 ${a + i}% 100%)`,
    };
  }, [active, inactive, total]);

  return (
    <div className="mg-donut-wrap">
      <div className="mg-donut" style={{ background: bg }}>
        <div className="mg-donut__hole">
          <strong>{total}</strong>
          <span>Total</span>
        </div>
      </div>
      <ul className="mg-donut-legend">
        <li><i className="dot green" /> Active ({active})</li>
        <li><i className="dot gray" /> Inactive ({inactive})</li>
        <li><i className="dot blue" /> New this month ({newThisMonth})</li>
      </ul>
    </div>
  );
});

const RingProgress = memo(function RingProgress({ percent }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const offset = useMemo(() => c - (percent / 100) * c, [c, percent]);

  return (
    <div className="mg-ring">
      <svg viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#e2e8f0" strokeWidth="10" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="#15803d"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          transform="rotate(-90 60 60)"
        />
      </svg>
      <span className="mg-ring__icon">💵</span>
    </div>
  );
});

function ManagerDashboardHome({
  data,
  loading,
  managerName,
  globalSearch,
  onSearchChange,
  onRemindAll,
  bulkReminding,
  onNavigate,
  onRemind,
  notificationCount,
  onMenuToggle,
}) {
  if (loading || !data) {
    return (
      <div className="mg-dashboard mg-dashboard--skeleton">
        <header className="mg-dash-top mg-dash-top--skeleton">
          <div className="mg-skeleton-line mg-skeleton-line--header" />
          <div className="mg-skeleton-line mg-skeleton-line--subheader" />
        </header>

        <div className="mg-kpi-row">
          {Array.from({ length: 6 }).map((_, index) => (
            <SkeletonCard key={index} compact />
          ))}
        </div>

        <div className="mg-row mg-row--3">
          <SkeletonCard key="chart" rows={5} />
          <SkeletonCard key="clients" rows={6} />
          <SkeletonCard key="recent" rows={6} />
        </div>
      </div>
    );
  }

  const {
    kpis,
    dailyCollection,
    clientsOverview,
    recentClients,
    collectionTrend,
    recentCollections,
    monthLabel,
  } = data;

  const quickActions = [
    { id: 'add', label: 'Add Client', icon: '➕', tone: 'green' },
    { id: 'collection', label: 'Add Collection', icon: '💰', tone: 'orange' },
    { id: 'weekly', label: 'Send Reminder', icon: '💬', tone: 'wa', action: onRemindAll },
    { id: 'daily-report', label: 'Download Report', icon: '📄', tone: 'blue' },
    { id: 'monthly-profit', label: 'Monthly Profit', icon: '📊', tone: 'purple' },
    { id: 'defaulters', label: 'View Defaulters', icon: '⚠', tone: 'red' },
  ];

  return (
    <div className="mg-dashboard">
      <header className="mg-dash-top">
        <div className="mg-dash-top__left">
          <button type="button" className="mg-menu-btn" onClick={onMenuToggle} aria-label="Menu">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div>
            <h1>Welcome back, {managerName || 'Manager'}! 👋</h1>
            <p>Here&apos;s what&apos;s happening with your business today.</p>
          </div>
        </div>

        <div className="mg-dash-top__search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="search"
            placeholder="Search customers..."
            value={globalSearch}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        <div className="mg-dash-top__right">
          <button type="button" className="mg-icon-btn" onClick={() => onNavigate('defaulters')} aria-label="Notifications">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            </svg>
            {notificationCount > 0 && <span className="mg-badge-count">{notificationCount}</span>}
          </button>
          <div className="mg-profile">
            <span className="mg-profile__avatar">{getInitials(managerName)}</span>
            <span>{managerName || 'Manager'}</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </div>
          <button type="button" className="mg-remind-all" disabled={bulkReminding} onClick={onRemindAll}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
            </svg>
            {bulkReminding ? 'Sending…' : 'Remind All'}
          </button>
        </div>
      </header>

      <div className="mg-kpi-row">
        {[
          { label: 'Total Clients', value: kpis.totalClients, delta: `+${kpis.clientsAddedThisMonth || 0} this month`, tone: 'green', icon: '👥' },
          { label: 'Pending Payments', value: kpis.pendingPayments, delta: `${kpis.pendingPayments} this week`, tone: 'orange', icon: '⏳' },
          { label: 'Completed Payments', value: kpis.completedPayments, delta: `${kpis.completedPayments} this week`, tone: 'teal', icon: '✓' },
          { label: 'Total Collected', value: formatMoney(kpis.totalCollected), delta: 'This month', tone: 'blue', icon: '₹' },
          { label: 'Pending Amount', value: formatMoney(kpis.totalDue), delta: 'Outstanding', tone: 'red', icon: '!' },
          { label: 'Defaulters', value: kpis.defaulters, delta: 'Unpaid', tone: 'purple', icon: '⚠' },
        ].map((k) => (
          <article key={k.label} className={`mg-kpi-card mg-kpi-card--${k.tone}`}>
            <span className="mg-kpi-card__icon">{k.icon}</span>
            <div>
              <span className="mg-kpi-card__label">{k.label}</span>
              <strong>{k.value}</strong>
              <em>{k.delta}</em>
            </div>
          </article>
        ))}
      </div>

      <div className="mg-row mg-row--3">
        <section className="mg-card">
          <h2>Daily Collection</h2>
          <p className="mg-card__big">{formatMoney(dailyCollection?.total)}</p>
          <div className="mg-daily-body">
            <RingProgress percent={dailyCollection?.progress || 0} />
            <ul className="mg-split-list">
              <li><span>Cash</span><strong>{formatMoney(dailyCollection?.cash)}</strong></li>
              <li><span>UPI</span><strong>{formatMoney(dailyCollection?.upi)}</strong></li>
              <li><span>Other</span><strong>{formatMoney(dailyCollection?.other)}</strong></li>
            </ul>
          </div>
          <button type="button" className="mg-card-btn" onClick={() => onNavigate('daily-report')}>
            View Details
          </button>
        </section>

        <section className="mg-card">
          <h2>Clients Overview</h2>
          <DonutChart overview={clientsOverview} />
          <button type="button" className="mg-card-btn mg-card-btn--dark" onClick={() => onNavigate('clients')}>
            Manage Clients
          </button>
        </section>

        <section className="mg-card">
          <h2>Recent Clients</h2>
          <ul className="mg-client-list">
            {recentClients?.length === 0 ? (
              <li className="mg-muted">No clients yet</li>
            ) : (
              recentClients.map((c) => (
                <li key={c.id}>
                  {c.profilePhoto ? (
                    <img src={c.profilePhoto} alt="" className="mg-avatar mg-avatar--img" loading="lazy" decoding="async" />
                  ) : (
                    <span className="mg-avatar">{getInitials(c.name)}</span>
                  )}
                  <div>
                    <strong>{c.name}</strong>
                    <span>{c.phone}</span>
                  </div>
                  <div className="mg-client-list__end">
                    <strong>{formatMoney(c.amountTaken)}</strong>
                    <span className="mg-pill mg-pill--active">Active</span>
                  </div>
                </li>
              ))
            )}
          </ul>
          <button type="button" className="mg-card-btn mg-card-btn--dark" onClick={() => onNavigate('add')}>
            Add New Client
          </button>
        </section>
      </div>

      <div className="mg-row mg-row--3">
        <section className="mg-card mg-card--wide-chart">
          <h2>Collection Overview</h2>
          <LineChart data={collectionTrend} monthLabel={monthLabel} />
        </section>

        <section className="mg-card">
          <h2>Quick Actions</h2>
          <div className="mg-quick-grid">
            {quickActions.map((qa) => (
              <button
                key={qa.label}
                type="button"
                className={`mg-quick-tile mg-quick-tile--${qa.tone}`}
                onClick={() => (qa.action ? qa.action() : onNavigate(qa.id))}
              >
                <span>{qa.icon}</span>
                {qa.label}
              </button>
            ))}
          </div>
        </section>

        <section className="mg-card">
          <h2>Recent Collections</h2>
          <ul className="mg-collect-list">
            {recentCollections?.length === 0 ? (
              <li className="mg-muted">No collections yet</li>
            ) : (
              recentCollections.map((r) => (
                <li key={r.id}>
                  <span className="mg-avatar">{getInitials(r.name)}</span>
                  <div>
                    <strong>{r.name}</strong>
                    <span>{formatDate(r.date)}</span>
                  </div>
                  <div className="mg-collect-list__end">
                    <strong>{formatMoney(r.amount)}</strong>
                    <span className="mg-pill mg-pill--paid">Paid</span>
                  </div>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>

      <div className="mg-row mg-row--3">
        <section className="mg-card">
          <h2>WhatsApp Reminders</h2>
          {data.paymentReminders?.length === 0 ? (
            <p className="mg-muted">No pending reminders</p>
          ) : (
            <ul className="mg-reminder-list">
              {data.paymentReminders.slice(0, 5).map((r) => (
                <li key={r.paymentId} className="anim-fade-up">
                  <div className="mg-reminder-meta">
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <strong>{r.name}</strong>
                      <span className="mg-muted">Week {r.weekNumber || ''} pending</span>
                    </div>
                    <div style={{ marginLeft: '0.75rem' }}>
                      <span className="mg-reminder-badge">{formatMoney(r.amount)}</span>
                    </div>
                  </div>
                  <div className="mg-reminder-actions" style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                    <button type="button" className="mg-card-btn" onClick={() => onRemind(r.paymentId, false)}>Remind</button>
                    <button type="button" className="mg-card-btn mg-card-btn--wa" onClick={() => onWhatsApp(r.phone, r.message)}>WhatsApp</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mg-card">
          <h2>Top Performers</h2>
          <ul className="mg-top-performers">
            {data.topPerformers?.length === 0 ? (
              <li className="mg-muted">No performers yet</li>
            ) : (
              data.topPerformers.map((t) => (
                <li key={t.name} className="anim-fade-up">
                  <strong>{t.name}</strong>
                  <span style={{ color: 'var(--mg-gold)', fontWeight: 800 }}>{formatMoney(t.amount)}</span>
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="mg-card">
          <h2>Pending Weeks</h2>
          <ul className="mg-reminder-list">
            {data.paymentReminders?.slice(0, 5).map((r) => (
              <li key={r.paymentId} className="anim-fade-up">
                <div>
                  <strong>{r.name}</strong>
                  <div className="mg-muted">Week {r.weekNumber || ''} pending</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <strong>{formatMoney(r.amount)}</strong>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <footer className="mg-footer">
        <span className="mg-footer__shield">🛡️</span>
        <p>Grow your business with trust and transparency. Keep collecting, keep growing! 🚀</p>
        <div className="mg-footer__wm" style={{ backgroundImage: `url(${LOGO_SRC})` }} />
      </footer>
    </div>
  );
}

export default memo(ManagerDashboardHome);
