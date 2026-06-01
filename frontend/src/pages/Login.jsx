import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { LOGO_SRC, BRAND_NAME } from '../constants/brand';
import './Login.css';

const FEATURES = [
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
    title: 'Trusted & Secure',
    desc: 'Your data is protected',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 3v18h18" />
        <path d="M7 16l4-8 4 5 5-9" />
      </svg>
    ),
    title: 'Smart Dashboard',
    desc: 'Track all collections',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
    ),
    title: 'Weekly Collections',
    desc: 'Never miss a payment',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
        <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3v5zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3v5z" />
      </svg>
    ),
    title: '24/7 Support',
    desc: 'We are here to help',
  },
];

const ROLE_OPTIONS = [
  {
    id: 'manager',
    title: 'Manager Portal',
    desc: 'Premium control for collections, reports and reminders.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2a4 4 0 0 1 4 4v4h2a2 2 0 0 1 2 2v8h-4v2h-8v-2H4v-8a2 2 0 0 1 2-2h2V6a4 4 0 0 1 4-4z" />
      </svg>
    ),
  },
  {
    id: 'customer',
    title: 'Customer Portal',
    desc: 'Easy access to payment history and reminders.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
];

const STAT_CARDS = [
  { label: 'Trusted for Years', value: '14+', note: 'Reliability you can count on' },
  { label: 'Active Clients', value: '1,250', note: 'Growing community' },
  { label: 'Weekly Payments', value: '3,450+', note: 'Managed smoothly' },
  { label: 'Collections Processed', value: '₹12.8 Cr', note: 'Secure & transparent' },
];

const SERVICES = [
  { title: 'Collection Management', caption: 'Daily tally, weekly tracking and automatic reminders.' },
  { title: 'Client Insights', caption: 'Detailed profiles, payment trends and defaulter alerts.' },
  { title: 'Profit Analytics', caption: 'Monthly reports with cash, UPI and total collection breakdowns.' },
  { title: 'White-Glove Support', caption: 'Phone and WhatsApp support for managers and clients.' },
];

const TESTIMONIALS = [
  { name: 'Suresh K.', role: 'Business Partner', text: 'Lakshmi Ganapati Finance transformed our collections process with clarity and speed.' },
  { name: 'Radha P.', role: 'Client', text: 'Transparent updates and timely reminders keep our payments on track every week.' },
  { name: 'Anita M.', role: 'Field Manager', text: 'The dashboard is elegant, fast and easy to use on mobile during collection rounds.' },
];

const CONTACTS = [
  { label: 'Phone', value: '+91 93466 97486', href: 'tel:+919346697486' },
  { label: 'Email', value: 'support@lakshmiganapati.finance', href: 'mailto:support@lakshmiganapati.finance' },
  { label: 'Location', value: 'Chennai, Tamil Nadu', href: 'https://maps.google.com' },
];

export default function Login() {
  const navigate = useNavigate();
  const loginRef = useRef(null);
  const [role, setRole] = useState('manager');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeNav, setActiveNav] = useState('home');

  useEffect(() => {
    const saved = localStorage.getItem('lg_remember');
    if (saved) {
      try {
        const { username: u, role: r } = JSON.parse(saved);
        if (u) setUsername(u);
        if (r) setRole(r);
        setRemember(true);
      } catch {
        /* ignore */
      }
    }
  }, []);

  useEffect(() => {
    const token = sessionStorage.getItem('token') || localStorage.getItem('token');
    if (token) {
      const r = sessionStorage.getItem('role') || localStorage.getItem('role');
      navigate(r === 'manager' ? '/manager' : '/customer', { replace: true });
    }
  }, [navigate]);

  const scrollToLogin = (asRole = 'manager') => {
    setRole(asRole);
    setError('');
    loginRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api.login({ username, password, role });
      const storage = remember ? localStorage : sessionStorage;
      sessionStorage.clear();
      localStorage.removeItem('token');
      localStorage.removeItem('role');
      localStorage.removeItem('name');
      storage.setItem('token', data.token);
      storage.setItem('role', data.role);
      storage.setItem('name', data.name);
      if (remember) {
        localStorage.setItem('lg_remember', JSON.stringify({ username, role }));
      } else {
        localStorage.removeItem('lg_remember');
      }
      navigate(data.role === 'manager' ? '/manager' : '/customer');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const isManager = role === 'manager';

  return (
    <div className={`lg-home lg-home--${role}`} id="home">
      <div className="lg-home__bg" aria-hidden="true">
        <div className="lg-home__watermark" style={{ backgroundImage: `url(${LOGO_SRC})` }} />
        <div className="lg-home__glow lg-home__glow--1" />
        <div className="lg-home__glow lg-home__glow--2" />
        <div className="lg-home__sparkles" />
        <div className="lg-home__leaves" />
      </div>

      <header className="lg-home__nav">
        <a href="#home" className="lg-home__brand" onClick={(e) => e.preventDefault()}>
          <img src={LOGO_SRC} alt="" className="lg-home__brand-logo" />
          <div>
            <strong>{BRAND_NAME.toUpperCase()} FINANCE</strong>
            <span>Trust · Transparency · Growth</span>
          </div>
        </a>

        <nav className="lg-home__links">
          {[
            { id: 'home', label: 'Home', href: '#home' },
            { id: 'about', label: 'About Us', href: '#about-us' },
            { id: 'services', label: 'Services', href: '#services' },
            { id: 'weekly', label: 'Weekly Payments', href: '#weekly' },
            { id: 'contact', label: 'Contact Us', href: '#contact' },
          ].map((link) => (
            <a
              key={link.id}
              href={link.href}
              className={activeNav === link.id ? 'active' : ''}
              onClick={() => setActiveNav(link.id)}
            >
              {link.label}
            </a>
          ))}
        </nav>

        <button type="button" className="lg-home__mgr-btn" onClick={() => scrollToLogin('manager')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          Manager Login
        </button>
      </header>

      <main className="lg-home__main">
        <section className="lg-home__hero">
          <h1>
            Welcome to <span className="gold">{BRAND_NAME}</span>{' '}
            <span className="white">Finance</span>
          </h1>
          <p className="lg-home__tagline">Your Trusted Partner in Financial Growth</p>
          <p className="lg-home__desc">
            We simplify your financial management with smart tools, transparent processes,
            and dedicated support for your business growth.
          </p>

          <div className="lg-home__features">
            {FEATURES.map((f) => (
              <article key={f.title} className="lg-feature">
                <span className="lg-feature__icon">{f.icon}</span>
                <div>
                  <strong>{f.title}</strong>
                  <span>{f.desc}</span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="lg-home__login" ref={loginRef} id="login">
          <div className={`lg-login-card lg-login-card--${role}`}>
            <div className="lg-login-card__head">
              <span className="lg-login-card__logo-ring">
                <img src={LOGO_SRC} alt="" className="lg-login-card__logo" />
              </span>
              <div>
                <h2>{isManager ? 'Manager Login' : 'Customer Login'}</h2>
                <p>Please login to access your dashboard</p>
              </div>
            </div>

            {error && <div className="lg-login-card__error">{error}</div>}

            <form className="lg-login-form" onSubmit={handleLogin}>
              <label className="lg-login-field">
                <span className="lg-login-field__icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </span>
                <input
                  type="text"
                  placeholder="Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoComplete="username"
                />
              </label>

              <label className="lg-login-field">
                <span className="lg-login-field__icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </span>
                <input
                  type={showPass ? 'text' : 'password'}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="lg-login-field__eye"
                  onClick={() => setShowPass((v) => !v)}
                  tabIndex={-1}
                  aria-label={showPass ? 'Hide password' : 'Show password'}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    {showPass ? (
                      <>
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </>
                    ) : (
                      <>
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </>
                    )}
                  </svg>
                </button>
              </label>

              <div className="lg-login-form__row">
                <label className="lg-login-check">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                  />
                  Remember me
                </label>
                <button type="button" className="lg-login-forgot" onClick={() => alert('Contact your manager to reset password.')}>
                  Forgot Password?
                </button>
              </div>

              <button type="submit" className="lg-login-submit" disabled={loading}>
                {loading ? 'Signing in…' : 'Login'}
                {!loading && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" />
                  </svg>
                )}
              </button>
            </form>

            <div className="lg-login-divider">
              <span>or</span>
            </div>

            <button
              type="button"
              className="lg-login-alt"
              onClick={() => {
                setRole(isManager ? 'customer' : 'manager');
                setError('');
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              {isManager ? 'Login as Customer' : 'Login as Manager'}
            </button>

            <div className="lg-login-secure">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <div>
                <strong>Secure & Protected</strong>
                <span>Your data is encrypted and safe with us</span>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="lg-home__footer-banner">
        <span className="lg-home__footer-icon">✿</span>
        <p>Building Stronger Relationships, Empowering Your Financial Future</p>
      </footer>

      <section id="about-us" className="lg-home__section">
        <h2>About Us</h2>
        <p>
          {BRAND_NAME} Finance helps you manage weekly chitti collections, client loans,
          interest tracking, and payment reminders — all from one trusted platform.
        </p>
      </section>

      <section id="services" className="lg-home__section">
        <h2>Services</h2>
        <ul>
          <li>Client loan & interest management</li>
          <li>Weekly payment tracking</li>
          <li>Daily collections & profit reports</li>
          <li>WhatsApp payment reminders</li>
        </ul>
      </section>

      <section id="weekly" className="lg-home__section">
        <h2>Weekly Payments</h2>
        <p>
          Track who has paid each week, send reminders to defaulters, and download receipts
          for your customers.
        </p>
      </section>

      <section id="contact" className="lg-home__section lg-home__section--contact">
        <h2>Contact Us</h2>
        <p>
          <a href="tel:+919346697486">+91 93466 97486</a>
        </p>
        <p>Lakshmi Ganapati Finance — Trust · Transparency · Growth</p>
      </section>
    </div>
  );
}
