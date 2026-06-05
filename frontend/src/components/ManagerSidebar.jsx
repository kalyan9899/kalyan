import './ManagerSidebar.css';
import { LOGO_SRC, BRAND_NAME } from '../constants/brand';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: 'grid' },
  { id: 'client-list', label: 'Client List', icon: 'list' },
  { id: 'weekly', label: 'Weekly Payments', icon: 'calendar' },
  { id: 'payment-approvals', label: 'Payment Approvals', icon: 'rupee' },
  { id: 'clients', label: 'Clients', icon: 'users' },
  { id: 'collection', label: 'Collection', icon: 'rupee' },
  { id: 'defaulters', label: 'Defaulters', icon: 'alert', badge: true },
  { id: 'monthly-profit', label: 'Reports', icon: 'chart' },
  { id: 'reminders', label: 'Reminders', icon: 'bell' },
];

const ICONS = {
  grid: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  ),
  list: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  ),
  calendar: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  ),
  users: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
    </svg>
  ),
  rupee: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  ),
  alert: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    </svg>
  ),
  chart: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 3v18h18" />
      <path d="M7 16l4-8 4 5 5-9" />
    </svg>
  ),
  bell: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  ),
};

export default function ManagerSidebar({
  active,
  onNavigate,
  onLogout,
  mobileOpen,
  onMenuToggle,
  onCloseMobile,
  defaulterCount = 0,
}) {
  const isActive = (item) => active === item.id;

  const handleNav = (item) => {
    onNavigate(item.id);
    onCloseMobile?.();
  };

  return (
    <>
      <button
        type="button"
        className="manager-sidebar-toggle"
        onClick={onMenuToggle}
        aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {mobileOpen && (
        <button type="button" className="manager-sidebar-backdrop" onClick={onCloseMobile} aria-label="Close menu" />
      )}

      <aside className={`manager-sidebar ${mobileOpen ? 'manager-sidebar--open' : ''}`}>
        <div className="manager-sidebar__brand">
          <img src={LOGO_SRC} alt="" className="manager-sidebar__logo" loading="lazy" decoding="async" />
          <div>
            <strong>{BRAND_NAME.toUpperCase()}</strong>
            <span>FINANCE</span>
            <em>Trust · Transparency · Growth</em>
          </div>
        </div>

        <nav className="manager-sidebar__nav">
          {NAV_ITEMS.map((item) => (
            <a
              key={`${item.id}-${item.label}`}
              href={`#${item.id}`}
              data-nav-id={item.id}
              className={`manager-sidebar__btn ${isActive(item) ? 'active' : ''}`}
              aria-current={isActive(item) ? 'page' : undefined}
              onClick={() => handleNav(item)}
            >
              <span className="manager-sidebar__icon">{ICONS[item.icon]}</span>
              {item.label}
              {item.badge && defaulterCount > 0 && (
                <span className="sidebar-badge">{defaulterCount}</span>
              )}
            </a>
          ))}
        </nav>

        <div className="manager-sidebar__deco" aria-hidden="true">
          <img src={LOGO_SRC} alt="" className="manager-sidebar__deco-logo" loading="lazy" decoding="async" />
          <p>Trust · Transparency · Growth</p>
        </div>

        <div className="manager-sidebar__foot">
          <button type="button" className="manager-sidebar__btn logout" onClick={onLogout}>
            <span className="manager-sidebar__icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
            </span>
            Logout
          </button>
        </div>
      </aside>
    </>
  );
}
