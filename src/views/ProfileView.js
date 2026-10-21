import { store } from '../state.js';

export function renderProfileView(container) {
  const t = store.t;
  const p = store.state.profile;

  container.innerHTML = `
    <div class="profile-view-wrapper">
      <div class="profile-top-header">
        <div>
          <span class="badge-tag">Digitale Mitgliedschaft</span>
          <h2 class="section-heading">${t.profile.title}</h2>
          <p class="section-sub">${t.profile.sub}</p>
        </div>

        <!-- Presets quick-switcher -->
        <div class="preset-switcher">
          <span class="preset-label">${t.profile.switchPreset}</span>
          <div class="preset-buttons">
            <button class="btn-preset active" data-preset="pilot">${t.profile.presetPilot}</button>
            <button class="btn-preset" data-preset="tandem">${t.profile.presetTandem}</button>
            <button class="btn-preset" data-preset="student">${t.profile.presetStudent}</button>
          </div>
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
                <!-- SVG QR Code Representation -->
                <svg width="84" height="84" viewBox="0 0 33 33" fill="currentColor" class="qr-svg">
                  <!-- QR Code Pattern -->
                  <rect x="0" y="0" width="7" height="7" rx="1"/>
                  <rect x="1" y="1" width="5" height="5" fill="#FFFFFF"/>
                  <rect x="2" y="2" width="3" height="3"/>

                  <rect x="26" y="0" width="7" height="7" rx="1"/>
                  <rect x="27" y="1" width="5" height="5" fill="#FFFFFF"/>
                  <rect x="28" y="2" width="3" height="3"/>

                  <rect x="0" y="26" width="7" height="7" rx="1"/>
                  <rect x="1" y="27" width="5" height="5" fill="#FFFFFF"/>
                  <rect x="2" y="28" width="3" height="3"/>

                  <!-- Data dots -->
                  <rect x="9" y="2" width="2" height="2"/>
                  <rect x="13" y="2" width="2" height="2"/>
                  <rect x="17" y="2" width="2" height="2"/>
                  <rect x="21" y="2" width="2" height="2"/>
                  <rect x="9" y="6" width="2" height="2"/>
                  <rect x="15" y="6" width="2" height="2"/>
                  <rect x="19" y="6" width="2" height="2"/>

                  <rect x="2" y="10" width="2" height="2"/>
                  <rect x="6" y="10" width="2" height="2"/>
                  <rect x="10" y="10" width="2" height="2"/>
                  <rect x="14" y="10" width="2" height="2"/>
                  <rect x="18" y="10" width="2" height="2"/>
                  <rect x="22" y="10" width="2" height="2"/>
                  <rect x="26" y="10" width="2" height="2"/>
                  <rect x="30" y="10" width="2" height="2"/>

                  <rect x="2" y="14" width="2" height="2"/>
                  <rect x="10" y="14" width="2" height="2"/>
                  <rect x="14" y="14" width="2" height="2"/>
                  <rect x="22" y="14" width="2" height="2"/>
                  <rect x="30" y="14" width="2" height="2"/>

                  <rect x="9" y="18" width="2" height="2"/>
                  <rect x="13" y="18" width="2" height="2"/>
                  <rect x="17" y="18" width="2" height="2"/>
                  <rect x="21" y="18" width="2" height="2"/>
                  <rect x="25" y="18" width="2" height="2"/>

                  <rect x="9" y="26" width="2" height="2"/>
                  <rect x="13" y="26" width="2" height="2"/>
                  <rect x="17" y="26" width="2" height="2"/>
                  <rect x="21" y="26" width="2" height="2"/>
                </svg>
                <span class="qr-label">OFFLINE VALID</span>
              </div>
            </div>

            <div class="card-footer-line">
              <div class="footer-col">
                <span class="card-sub-lbl">${t.profile.birthDate}</span>
                <span class="card-sub-val">${p.birthDate}</span>
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

      <!-- 2. OFFICIAL PILOT LICENSE RATINGS -->
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

      <!-- 4. EDIT PROFILE FORM -->
      <section class="profile-section">
        <h3 class="section-heading-sm">Pilotendaten bearbeiten</h3>
        <form id="edit-profile-form" class="edit-profile-card">
          <div class="form-row">
            <div class="form-group">
              <label>Vorname</label>
              <input type="text" name="firstName" value="${p.firstName}" required />
            </div>
            <div class="form-group">
              <label>Nachname</label>
              <input type="text" name="lastName" value="${p.lastName}" required />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>SHV-Nummer</label>
              <input type="text" name="shvNumber" value="${p.shvNumber}" required />
            </div>
            <div class="form-group">
              <label>Geburtsdatum</label>
              <input type="text" name="birthDate" value="${p.birthDate}" required />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Stammclub</label>
              <input type="text" name="club" value="${p.club}" required />
            </div>
            <div class="form-group">
              <label>Kanton</label>
              <input type="text" name="canton" value="${p.canton}" required />
            </div>
          </div>
          <div class="text-right mt-2">
            <button type="submit" class="btn-primary">Änderungen speichern</button>
          </div>
        </form>
      </section>
    </div>
  `;

  // Attach handlers
  container.querySelectorAll('.btn-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = btn.getAttribute('data-preset');
      store.setProfilePreset(preset);
      renderProfileView(container);
    });
  });

  const form = container.querySelector('#edit-profile-form');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      store.updateProfile({
        firstName: fd.get('firstName'),
        lastName: fd.get('lastName'),
        shvNumber: fd.get('shvNumber'),
        birthDate: fd.get('birthDate'),
        club: fd.get('club'),
        canton: fd.get('canton'),
      });
      renderProfileView(container);
    });
  }
}
