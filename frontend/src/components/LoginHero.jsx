import './LoginHero.css';
import { LOGO_SRC, BRAND_NAME } from '../constants/brand';

export default function LoginHero() {
  return (
    <section className="lg-hero">
      <div className="lg-hero__copy">
        <div className="lg-hero__brand-showcase">
          <img src={LOGO_SRC} alt={`${BRAND_NAME} Finance`} loading="lazy" decoding="async" />
        </div>
        <div className="lg-hero__brand-mini">
          <img src={LOGO_SRC} alt="" className="lg-hero__brand-logo" loading="lazy" decoding="async" />
          <span>{BRAND_NAME}</span>
        </div>

        <h1 className="lg-hero__title">
          <span className="lg-hero__title-sm">Welcome to</span>
          <span className="lg-hero__title-main">Login</span>
          <span className="lg-hero__title-underline" />
        </h1>

        <p className="lg-hero__lead">Sign in to continue your collections</p>

        <p className="lg-hero__desc">
          Manage weekly chitti payments, client loans, and reminders from one powerful
          dashboard built for your business.
        </p>

        <div className="lg-hero__trust">
          <div className="lg-trust-pill">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            Secure
          </div>
          <div className="lg-trust-pill">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
            Real-time
          </div>
          <div className="lg-trust-pill">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <path d="M22 4 12 14.01l-3-3" />
            </svg>
            Easy
          </div>
        </div>

        <div className="lg-hero__features">
          <article className="lg-feat-card">
            <span className="lg-feat-card__num">01</span>
            <h3>Track loans</h3>
            <p>Amount, interest & weekly dues</p>
          </article>
          <article className="lg-feat-card">
            <span className="lg-feat-card__num">02</span>
            <h3>Mark payments</h3>
            <p>Paid or pending per client</p>
          </article>
          <article className="lg-feat-card">
            <span className="lg-feat-card__num">03</span>
            <h3>Send alerts</h3>
            <p>Remind clients instantly</p>
          </article>
        </div>
      </div>

      <div className="lg-hero__stage" aria-hidden="true">
        <div className="lg-stage__grid" />
        <svg className="lg-stage__ring" viewBox="0 0 400 400">
          <defs>
            <linearGradient id="lgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f97316" stopOpacity="0.8" />
              <stop offset="50%" stopColor="#fbbf24" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#14b8a6" stopOpacity="0.6" />
            </linearGradient>
          </defs>
          <circle cx="200" cy="200" r="170" fill="none" stroke="url(#lgGrad)" strokeWidth="1.5" strokeDasharray="12 8" opacity="0.5" />
          <circle cx="200" cy="200" r="140" fill="none" stroke="url(#lgGrad)" strokeWidth="1" opacity="0.3" />
        </svg>

        <div className="lg-stack">
          <div className="lg-stack__card lg-stack__card--back">
            <div className="lg-stack__shimmer" />
          </div>

          <div className="lg-stack__card lg-stack__card--main">
            <header className="lg-dash__head">
              <div>
                <span className="lg-dash__eyebrow">Dashboard</span>
                <strong>Lakshmi Ganapati</strong>
              </div>
              <img src={LOGO_SRC} alt="" className="lg-dash__avatar lg-dash__avatar--logo" loading="lazy" decoding="async" />
            </header>

            <div className="lg-dash__metrics">
              <div className="lg-dash__metric">
                <span>Collected</span>
                <strong>₹1.2L</strong>
                <em className="up">↑ 18%</em>
              </div>
              <div className="lg-dash__metric">
                <span>Pending</span>
                <strong>₹24K</strong>
                <em className="warn">6 clients</em>
              </div>
            </div>

            <div className="lg-dash__progress">
              <div className="lg-dash__progress-label">
                <span>Week progress</span>
                <span>78%</span>
              </div>
              <div className="lg-dash__progress-bar">
                <div className="lg-dash__progress-fill" />
              </div>
            </div>

            <ul className="lg-dash__list">
              <li>
                <span className="lg-dash__user">RK</span>
                <div>
                  <strong>Raju Kumar</strong>
                  <small>₹2,500 · Weekly</small>
                </div>
                <span className="lg-dash__status paid">Paid</span>
              </li>
              <li>
                <span className="lg-dash__user">LM</span>
                <div>
                  <strong>Lakshmi M.</strong>
                  <small>₹3,000 · Weekly</small>
                </div>
                <span className="lg-dash__status pending">Pending</span>
              </li>
              <li>
                <span className="lg-dash__user">SP</span>
                <div>
                  <strong>Suresh P.</strong>
                  <small>₹2,200 · Weekly</small>
                </div>
                <span className="lg-dash__status paid">Paid</span>
              </li>
            </ul>
          </div>

          <div className="lg-stack__float lg-stack__float--a">
            <span className="lg-stack__float-icon">₹</span>
            <div>
              <small>Today</small>
              <strong>+₹8,400</strong>
            </div>
          </div>

          <div className="lg-stack__float lg-stack__float--b">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
            <div>
              <small>Growth</small>
              <strong>+24%</strong>
            </div>
          </div>
        </div>

        <div className="lg-stage__particles">
          {Array.from({ length: 12 }).map((_, i) => (
            <span key={i} className="lg-particle" style={{ '--i': i }} />
          ))}
        </div>
      </div>
    </section>
  );
}
