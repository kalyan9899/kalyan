import './ManagerSidebar.css';

const NAV_ITEMS = [
  {
    id: 'payments',
    label: 'Payments',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 6h16" />
        <path d="M4 12h16" />
        <path d="M4 18h16" />
      </svg>
    ),
  },
  {
    id: 'profile',
    label: 'Profile',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="8" r="3" />
        <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
      </svg>
    ),
  },
];

export default function CustomerSidebar({
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
            <span>Customer</span>
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
