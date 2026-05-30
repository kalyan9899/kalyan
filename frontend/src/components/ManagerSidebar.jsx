import './ManagerSidebar.css';

const NAV_ITEMS = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
      </svg>
    ),
  },
  {
    id: 'weekly',
    label: 'Weekly payments',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
    ),
  },
  {
    id: 'clients',
    label: 'Clients',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    id: 'collection',
    label: 'Collection',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
  },
  {
    id: 'add',
    label: 'Add client',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M19 8v6M22 11h-6" />
      </svg>
    ),
  },
];

export default function ManagerSidebar({
  active,
  onNavigate,
  onLogout,
  mobileOpen,
  onMenuToggle,
  onCloseMobile,
}) {
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
        <button
          type="button"
          className="manager-sidebar-backdrop"
          onClick={onCloseMobile}
          aria-label="Close menu"
        />
      )}

      <aside className={`manager-sidebar ${mobileOpen ? 'manager-sidebar--open' : ''}`}>
        <div className="manager-sidebar__brand">
          <span className="manager-sidebar__logo">₹</span>
          <div>
            <strong>Lakshmi Ganapati</strong>
            <span>Manager</span>
          </div>
        </div>

        <nav className="manager-sidebar__nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`manager-sidebar__btn ${active === item.id ? 'active' : ''}`}
              onClick={() => {
                onNavigate(item.id);
                onCloseMobile?.();
              }}
            >
              <span className="manager-sidebar__icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

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
