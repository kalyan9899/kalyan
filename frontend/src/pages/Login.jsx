import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import './Login.css';
import LoginHero from '../components/LoginHero';
import LoginAbout from '../components/LoginAbout';

export default function Login() {
  const navigate = useNavigate();
  const [role, setRole] = useState(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
    const token = localStorage.getItem('token');
    if (token) {
      const r = localStorage.getItem('role');
      navigate(r === 'manager' ? '/manager' : '/customer', { replace: true });
    }
  }, [navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!role) {
      setError('Please select Customer or Manager');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const data = await api.login({ username, password, role });
      localStorage.setItem('token', data.token);
      localStorage.setItem('role', data.role);
      localStorage.setItem('name', data.name);
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

  return (
    <div className="chitti-login">
      <div className="chitti-login__scene" aria-hidden="true">
        <div className="chitti-bokeh b1" />
        <div className="chitti-bokeh b2" />
        <div className="chitti-bokeh b3" />
        <div className="chitti-bokeh b4" />
        <div className="chitti-bokeh b5" />
        <div className="chitti-vignette" />
      </div>

      <header className="chitti-login__nav">
        <a href="/" className="chitti-brand" onClick={(e) => e.preventDefault()}>
          <span className="chitti-brand__icon">₹</span>
          <span className="chitti-brand__name">Lakshmi Ganapati</span>
        </a>
        <nav className="chitti-nav-links chitti-nav-links--mobile">
          <a href="#about-us">About Us</a>
          <a href="tel:+919346697486">Call</a>
        </nav>
        <nav className="chitti-nav-links">
          <a href="#about-us">About Us</a>
          <a href="#about-us">Weekly Payments</a>
          <a href="tel:+919346697486">Contact</a>
        </nav>
      </header>

      <div className="chitti-login__body">
        <LoginHero />

        <div className="chitti-login__aside">
        <section className="chitti-panel-wrap">
          <div className="chitti-glass">
            <div key={role ?? 'pick'} className="chitti-glass__inner">
              {!role ? (
                <>
                  <h2 className="chitti-glass__title">Lakshmi Ganapati</h2>
                  <p className="chitti-glass__sub">Choose your portal</p>

                  <div className="chitti-portals">
                    <button
                      type="button"
                      className="chitti-portal chitti-portal--user"
                      onClick={() => setRole('customer')}
                    >
                      <span className="chitti-portal__icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                          <circle cx="12" cy="7" r="4" />
                        </svg>
                      </span>
                      <span className="chitti-portal__label">Customer</span>
                      <span className="chitti-portal__hint">View loan & payments</span>
                    </button>
                    <button
                      type="button"
                      className="chitti-portal chitti-portal--mgr"
                      onClick={() => setRole('manager')}
                    >
                      <span className="chitti-portal__icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="3" />
                          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
                        </svg>
                      </span>
                      <span className="chitti-portal__label">Manager</span>
                      <span className="chitti-portal__hint">Clients & reminders</span>
                    </button>
                  </div>

                  <p className="chitti-glass__foot">
                    New client? Ask your manager to create your account.
                  </p>
                </>
              ) : (
                <form className="chitti-form" onSubmit={handleLogin}>
                  <button
                    type="button"
                    className="chitti-form__back"
                    onClick={() => {
                      setRole(null);
                      setError('');
                    }}
                  >
                    ← Change portal
                  </button>

                  <h2 className="chitti-glass__title">Lakshmi Ganapati</h2>
                  <p className="chitti-glass__sub">
                    {role === 'customer' ? 'Customer account' : 'Manager account'}
                  </p>

                  {error && <div className="chitti-form__error">{error}</div>}

                  <label className="chitti-field">
                    <span>Username</span>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Enter username"
                      required
                      autoComplete="username"
                      autoFocus
                    />
                  </label>

                  <label className="chitti-field">
                    <span>Password</span>
                    <div className="chitti-field__pass">
                      <input
                        type={showPass ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                        autoComplete="current-password"
                      />
                      <button
                        type="button"
                        className="chitti-field__toggle"
                        onClick={() => setShowPass((v) => !v)}
                        tabIndex={-1}
                      >
                        {showPass ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </label>

                  <div className="chitti-form__row">
                    <label className="chitti-check">
                      <input
                        type="checkbox"
                        checked={remember}
                        onChange={(e) => setRemember(e.target.checked)}
                      />
                      <span>Keep me logged in</span>
                    </label>
                  </div>

                  <button type="submit" className="chitti-btn" disabled={loading}>
                    <span>{loading ? 'Signing in…' : 'Sign In'}</span>
                    {!loading && <span className="chitti-btn__arrow">+</span>}
                  </button>

                  <p className="chitti-demo">
                    Demo: <strong>{role === 'manager' ? 'manager / manager123' : 'raju / customer123'}</strong>
                  </p>
                </form>
              )}
            </div>
          </div>
        </section>
        </div>
      </div>

      <div className="lg-about-wrap">
        <LoginAbout />
      </div>
    </div>
  );
}
