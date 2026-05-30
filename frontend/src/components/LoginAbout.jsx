import './LoginAbout.css';

const PHONE = '9346697486';
const PHONE_DISPLAY = '+91 93466 97486';
const MAPS_URL = 'https://www.google.com/maps/search/?api=1&query=Anaparthi,+Andhra+Pradesh,+India';

const TERMS = [
  { icon: 'W', title: 'Weekly payments', sub: 'Pay every week' },
  { icon: '6', title: '6 months tenure', sub: 'Total loan period' },
  { icon: '%', title: '25% interest', sub: 'Total on loan' },
  { icon: '₹', title: 'Min ₹5,000', sub: 'Minimum amount' },
];

export default function LoginAbout() {
  return (
    <section className="lg-about" id="about-us">
      <h2 className="lg-about__title">About Us</h2>

      <div className="lg-about__horizontal">
        <div className="lg-about__col lg-about__col--intro">
          <p className="lg-about__intro">
            <strong>Lakshmi Ganapati</strong> offers trusted weekly collection services in
            Anaparthi. Clear loan terms and timely weekly payments for every customer.
          </p>
        </div>

        <div className="lg-about__col lg-about__col--terms">
          <h3>Loan terms</h3>
          <ul className="lg-about__grid">
            {TERMS.map((t) => (
              <li key={t.title}>
                <span className="lg-about__icon" aria-hidden="true">
                  {t.icon}
                </span>
                <div>
                  <strong>{t.title}</strong>
                  <span>{t.sub}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="lg-about__col lg-about__col--contact">
          <h3>Contact & office</h3>
          <a href={`tel:+91${PHONE}`} className="lg-about__link">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
            {PHONE_DISPLAY}
          </a>
          <p className="lg-about__address">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            Office: Anaparthi
          </p>
          <a
            href={MAPS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="lg-about__map-btn"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <path d="M15 3h6v6M10 14 21 3" />
            </svg>
            Google Maps
          </a>
        </div>
      </div>
    </section>
  );
}
