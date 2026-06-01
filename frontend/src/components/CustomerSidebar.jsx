import { memo } from 'react';
import './ManagerSidebar.css';
import { LOGO_SRC, BRAND_NAME } from '../constants/brand';

const NAV_ITEMS = [
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
    id: 'reminders',
    label: 'Reminders',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    ),
  },
];

function CustomerSidebar({
  active,
  onNavigate,
  onLogout,
  mobileOpen,
  onMenuToggle,
  onCloseMobile,
  pendingReminders = 0,
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
          <img src={LOGO_SRC} alt="" className="manager-sidebar__logo" />
          <div>
            <strong>{BRAND_NAME}</strong>
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
              {item.id === 'reminders' && pendingReminders > 0 && (
                <span className="sidebar-badge">{pendingReminders}</span>
              )}
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

export default memo(CustomerSidebar);
