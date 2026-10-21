import { store } from '../state.js';

export function renderProfileView(container) {
  const t = store.t;
  const p = store.state.profile;

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
            Dieser Inhalt ist aktiven SHV-Mitgliedern vorbehalten. Melde dich mit deiner Mitgliedsnummer und deinem Passwort an, um deine offizielle digitale Mitgliederkarte, deinen Hängegleiterausweis (Brevet) und deine Versicherungsnachweise abzurufen.
          </p>

          <form id="shv-login-form" class="login-form-box">
            <div class="form-group">
              <label for="login-member-nr">SHV-Mitgliedsnummer / E-Mail</label>
              <input type="text" id="login-member-nr" placeholder="z. B. 58412 oder pilot@domain.ch" required autocomplete="username" />
            </div>
            <div class="form-group">
              <label for="login-password">Passwort</label>
              <input type="password" id="login-password" placeholder="Passwort" required autocomplete="current-password" />
            </div>
            <button type="submit" class="btn-primary btn-login-submit">
              <span>Jetzt anmelden</span>
            </button>
            <div class="login-links-row">
              <a href="https://www.shv-fsvl.ch" target="_blank" rel="noopener">Passwort vergessen? ↗</a>
              <a href="https://www.shv-fsvl.ch/verband/mitgliedschaft/" target="_blank" rel="noopener">Mitglied werden ↗</a>
            </div>
          </form>
        </div>
      </div>
    `;

    const form = container.querySelector('#shv-login-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const nr = container.querySelector('#login-member-nr').value.trim();
        const pass = container.querySelector('#login-password').value;

        if (!nr || !pass) return;

        // Save authenticated pilot profile
        const pilotData = {
          shvNumber: nr,
          firstName: 'Pilot',
          lastName: nr,
          birthDate: '–',
          canton: 'CH',
          memberCategory: 'Aktivmitglied Pilot',
          ratings: ['Brevet Gleitschirm'],
          validUntil: 'Aktiv',
          club: 'SHV FSVL',
          insuranceCompany: 'SHV Kollektivversicherung',
          insuranceCoverage: 'CHF 10\'000\'000.-',
          token: `SHV-${nr}`,
        };

        store.setProfile(pilotData);
        renderProfileView(container);
      });
    }
    return;
  }

  // Render Logged In Profile
  container.innerHTML = `
    <div class="profile-view-wrapper">
      <div class="profile-top-header" style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px;">
        <div>
          <span class="badge-tag">Digitale Mitgliedschaft</span>
          <h2 class="section-heading">${p.firstName} ${p.lastName}</h2>
          <p class="section-sub">SHV-Nr. ${p.shvNumber} · ${p.memberCategory}</p>
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
                <span class="card-sub-val">${p.memberCategory}</span>
              </div>
              <div class="footer-col">
                <span class="card-sub-lbl">Kanton</span>
                <span class="card-sub-val">${p.canton}</span>
              </div>
              <div class="footer-col text-right">
                <span class="card-sub-lbl">${t.profile.validUntil}</span>
                <span class="card-sub-val text-bold">${p.validUntil}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 2. PILOT RATINGS / BREVET -->
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
                <span class="rating-status">Aktiv · Geprüft durch SHV Prüfungskommission</span>
              </div>
            </div>
          `).join('')}
        </div>
      </section>

      <!-- 3. LIABILITY INSURANCE STATUS -->
      <section class="profile-section">
        <h3 class="section-heading-sm">${t.profile.insuranceTitle}</h3>
        <div class="insurance-card-box">
          <div class="ins-top">
            <span class="ins-amount">${p.insuranceCoverage}</span>
            <span class="ins-status-badge">Gültig versichert</span>
          </div>
          <p class="ins-notice">${t.profile.insuranceNotice}</p>
          <div class="ins-meta">
            <span>Versicherer: ${p.insuranceCompany}</span>
            <span>Club: <strong>${p.club}</strong></span>
          </div>
        </div>
      </section>
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
