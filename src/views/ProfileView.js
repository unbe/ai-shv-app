import { store } from '../state.js';

export function renderProfileView(container) {
  const t = store.t;
  const p = store.state.profile;

  // Ensure no dummy/rubbish profile is rendered
  if (p && (p.firstName === 'Pilot' || !p.firstName)) {
    store.logout();
    return renderProfileView(container);
  }

  if (!p) {
    container.innerHTML = `
      <div class="profile-view-wrapper">
        <div class="member-blocker-card">
          <div class="blocker-icon-badge">
            <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          </div>
          <span class="badge-tag">SHV FSVL Mitgliederbereich</span>
          <h2 class="blocker-title">Nur für Mitglieder</h2>
          <p class="blocker-text">
            Dieser Bereich ist ausschliesslich aktiven Mitgliedern des Schweizerischen Hängegleiter-Verbandes vorbehalten. Die offizielle digitale Mitgliederkarte, der Hängegleiterausweis (Brevet) und die Versicherungsnachweise erfordern einen Login über den offiziellen SHV-Verbandsserver (Keycloak SSO).
          </p>

          <div class="auth-notice-box" style="background: rgba(255, 255, 255, 0.04); border: 1px solid var(--border-color); border-radius: 12px; padding: 14px; margin: 18px 0; text-align: left; font-size: 0.88rem; line-height: 1.45; color: var(--text-muted);">
            <div style="font-weight: 600; color: var(--text-main); margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
              Authentische Verbandsdaten
            </div>
            Aus Datenschutz- und Sicherheitsgründen werden keine synthetischen Dummy- oder Testdaten angezeigt und keine Passwörter in dieser Web-App erfasst. Bitte nutze für Verwaltungsaufgaben und Ausweise das offizielle Verbandsportal.
          </div>

          <div class="blocker-actions-column" style="display: flex; flex-direction: column; gap: 10px; width: 100%; max-width: 380px; margin: 0 auto;">
            <a href="https://login.shv-fsvl.ch/realms/SHV/account/" target="_blank" rel="noopener" class="btn-primary btn-login-submit" style="display: flex; align-items: center; justify-content: center; text-decoration: none; padding: 12px 18px; border-radius: 12px; font-weight: 600;">
              <span>Offizielles SHV Login (login.shv-fsvl.ch) ↗</span>
            </a>
            <a href="https://www.shv-fsvl.ch/verband/mitgliedschaft/" target="_blank" rel="noopener" class="btn-secondary" style="display: flex; align-items: center; justify-content: center; text-decoration: none; padding: 12px 18px; border-radius: 12px; font-weight: 600;">
              <span>Mitgliedschaft beim SHV beantragen ↗</span>
            </a>
          </div>

          <div class="login-links-row" style="margin-top: 20px; display: flex; justify-content: center; gap: 20px; font-size: 0.85rem;">
            <a href="https://login.shv-fsvl.ch/realms/SHV/login-actions/reset-credentials" target="_blank" rel="noopener" style="color: var(--primary-accent); text-decoration: none;">Passwort vergessen? ↗</a>
            <a href="https://www.shv-fsvl.ch" target="_blank" rel="noopener" style="color: var(--primary-accent); text-decoration: none;">SHV FSVL Website ↗</a>
          </div>
        </div>
      </div>
    `;
    return;
  }

  // Render Logged In Profile (only when genuine profile data is present)
  container.innerHTML = `
    <div class="profile-view-wrapper">
      <div class="profile-top-header" style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px;">
        <div>
          <span class="badge-tag">Digitale Mitgliedschaft</span>
          <h2 class="section-heading">${p.firstName} ${p.lastName}</h2>
          <p class="section-sub">SHV-Nr. ${p.shvNumber} · ${p.memberCategory || 'Mitglied'}</p>
        </div>
        <div>
          <button id="btn-logout" class="btn-secondary" style="padding: 8px 16px; font-size: 0.85rem;">
            Abmelden
          </button>
        </div>
      </div>

      <!-- 1. OFFICIAL SHV DIGITAL MEMBER CARD -->
      <div class="card-presentation-box">
        <div class="shv-digital-card member-card-bg">
          <div class="card-watermark">
            <img src="/assets/ic_launcher.png" alt="SHV Logo" class="card-logo-watermark" />
          </div>
          <div class="card-inner">
            <div class="card-header-line">
              <div class="card-org">
                <span class="org-name">SCHWEIZERISCHER HÄNGEGLEITER-VERBAND</span>
                <span class="org-sub">FÉDÉRATION SUISSE DE VOL LIBRE · FSVL</span>
              </div>
              <img src="/assets/ic_license_paraglider.png" alt="Paraglider" class="card-glider-icon" />
            </div>

            <div class="card-center-body">
              <div class="pilot-identity">
                <span class="pilot-fullname">${p.firstName} ${p.lastName}</span>
                <span class="pilot-shv-id">${t.profile.memberNumber}: <strong>${p.shvNumber}</strong></span>
              </div>

              <div class="card-qr-box">
                <span class="qr-label">SHV MITGLIED</span>
              </div>
            </div>

            <div class="card-footer-line">
              <div class="footer-col">
                <span class="card-sub-lbl">Kategorie</span>
                <span class="card-sub-val">${p.memberCategory || '–'}</span>
              </div>
              <div class="footer-col">
                <span class="card-sub-lbl">Kanton</span>
                <span class="card-sub-val">${p.canton || '–'}</span>
              </div>
              <div class="footer-col text-right">
                <span class="card-sub-lbl">${t.profile.validUntil}</span>
                <span class="card-sub-val text-bold">${p.validUntil || '–'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 2. PILOT RATINGS / BREVET (if provided) -->
      ${Array.isArray(p.ratings) && p.ratings.length > 0 ? `
        <section class="profile-section">
          <h3 class="section-heading-sm">Berechtigungen & Lizenzen</h3>
          <div class="ratings-card-box">
            ${p.ratings.map(r => `
              <div class="rating-badge-item">
                <div class="rating-icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <div class="rating-info">
                  <span class="rating-title">${r}</span>
                  <span class="rating-status">Aktiv · SHV Brevet</span>
                </div>
              </div>
            `).join('')}
          </div>
        </section>
      ` : ''}

      <!-- 3. LIABILITY INSURANCE STATUS (if provided) -->
      ${p.insuranceCoverage ? `
        <section class="profile-section">
          <h3 class="section-heading-sm">${t.profile.insuranceTitle}</h3>
          <div class="insurance-card-box">
            <div class="ins-top">
              <span class="ins-amount">${p.insuranceCoverage}</span>
              <span class="ins-status-badge">Gültig versichert</span>
            </div>
            <p class="ins-notice">${t.profile.insuranceNotice}</p>
            <div class="ins-meta">
              ${p.insuranceCompany ? `<span>Versicherer: ${p.insuranceCompany}</span>` : ''}
              ${p.club ? `<span>Club: <strong>${p.club}</strong></span>` : ''}
            </div>
          </div>
        </section>
      ` : ''}
    </div>
  `;

  const btnLogout = container.querySelector('#btn-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      store.logout();
      renderProfileView(container);
    });
  }
}
