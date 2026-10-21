import { store } from '../state.js';
import { ShvApi } from '../services/api.js';

export async function renderProfileView(container) {
  const t = store.t;
  const sid = store.state.sid;
  let p = store.state.profile;

  // If session ID is present but profile not in memory, fetch fresh from server
  if (sid && !p) {
    try {
      const sessionData = await ShvApi.getAuthProfile(sid);
      if (sessionData && sessionData.profile) {
        p = sessionData.profile;
        store.setSession(sid, p);
      } else if (!sessionData) {
        // Session expired on server
        store.logout();
        return renderProfileView(container);
      }
    } catch (e) {
      console.warn('[ProfileView] Could not fetch profile for active session:', e);
    }
  }

  // Ensure no dummy/rubbish profile is rendered
  if (p && (p.firstName === 'Pilot' || (!p.firstName && !p.name))) {
    store.logout();
    p = null;
  }

  // 1. UNLOGGED / BLOCKED STATE (Option A Copy-Paste OIDC Flow)
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
            Dieser Bereich ist aktiven Mitgliedern des Schweizerischen Hängegleiter-Verbandes vorbehalten. Melde dich mit deinem offiziellen SHV-Konto an, um deine digitale Mitgliederkarte, Brevet-Lizenzen und Versicherungsnachweise abzurufen.
          </p>

          <!-- OPTION A: OFFICIAL OIDC FLOW -->
          <div style="width: 100%; max-width: 440px; margin: 0 auto; display: flex; flex-direction: column; gap: 14px;">
            <button id="btn-start-oidc" class="btn-primary" style="width: 100%; padding: 14px; border-radius: 12px; font-weight: 700; font-size: 1rem; display: flex; align-items: center; justify-content: center; gap: 8px;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
              <span>1. Mit SHV-Konto anmelden (Keycloak) ↗</span>
            </button>

            <div class="login-guide-steps" style="background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border-color); border-radius: 14px; padding: 16px; text-align: left;">
              <div style="font-weight: 600; font-size: 0.85rem; color: var(--text-main); margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/></svg>
                So funktioniert der Login:
              </div>
              <ol style="margin: 0; padding-left: 20px; font-size: 0.82rem; line-height: 1.5; color: var(--text-muted); display: flex; flex-direction: column; gap: 6px;">
                <li>Klicke oben auf <strong>«1. Mit SHV-Konto anmelden»</strong>. Das offizielle SHV-Login öffnet sich in einem neuen Tab.</li>
                <li>Melde dich mit deinen offiziellen SHV-Zugangsdaten an.</li>
                <li>Nach der Anmeldung erscheint die Bestätigungsseite <em>«Anmeldung erfolgreich – SHV»</em>.</li>
                <li>Kopiere die vollständige Webadresse (URL) aus der Browser-Adresszeile und füge sie unten ein:</li>
              </ol>
            </div>

            <div class="callback-paste-box" style="display: flex; flex-direction: column; gap: 8px; text-align: left;">
              <label for="input-callback-url" style="font-size: 0.8rem; font-weight: 600; color: var(--text-muted);">
                Callback-URL hier einfügen:
              </label>
              <input
                type="text"
                id="input-callback-url"
                placeholder="https://prod.shv-app.ch/oidc/callback?code=..."
                autocomplete="off"
                style="height: 46px; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 12px; padding: 0 14px; color: var(--text-main); font-size: 0.85rem; outline: none; width: 100%;"
              />
              <button id="btn-submit-callback" class="btn-primary" style="padding: 12px 18px; border-radius: 12px; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 8px;">
                <span>2. Anmeldung abschliessen</span>
              </button>
            </div>

            <div id="login-feedback" class="hidden" style="padding: 12px; border-radius: 10px; font-size: 0.85rem; text-align: left; line-height: 1.4;"></div>
          </div>

          <div class="auth-notice-box" style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-color); border-radius: 12px; padding: 12px 16px; margin: 20px 0 0; text-align: left; font-size: 0.82rem; line-height: 1.45; color: var(--text-muted); width: 100%; max-width: 440px;">
            <div style="font-weight: 600; color: var(--text-main); margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
              Sicherheit & Datenschutz
            </div>
            Dieser Ablauf verwendet das offizielle PKCE-Protokoll des SHV-App-Clients. Dein Passwort wird ausschliesslich auf dem Keycloak-Server des Verbandes eingegeben und niemals in dieser Web-App gespeichert.
          </div>

          <div class="login-links-row" style="margin-top: 20px; display: flex; justify-content: center; gap: 20px; font-size: 0.85rem;">
            <a href="https://www.shv-fsvl.ch/anmelden/login/" target="_blank" rel="noopener" style="color: var(--primary-accent); text-decoration: none;">SHV Web-Login (shv-fsvl.ch) ↗</a>
            <a href="https://admin.webmembership.ch/shv/pages/public/registration.jsf" target="_blank" rel="noopener" style="color: var(--primary-accent); text-decoration: none;">Mitglied werden ↗</a>
          </div>
        </div>
      </div>
    `;

    // Hook up Button 1: Start OIDC
    const btnStart = container.querySelector('#btn-start-oidc');
    const feedbackBox = container.querySelector('#login-feedback');
    const inputUrl = container.querySelector('#input-callback-url');

    if (btnStart) {
      btnStart.addEventListener('click', async () => {
        try {
          btnStart.disabled = true;
          btnStart.innerHTML = `<span>Login wird vorbereitet...</span>`;
          const authData = await ShvApi.authStart();
          window.open(authData.authUrl, '_blank');
          btnStart.disabled = false;
          btnStart.innerHTML = `<span>1. Mit SHV-Konto anmelden (Keycloak) ↗</span>`;

          feedbackBox.className = '';
          feedbackBox.style.background = 'rgba(0, 137, 207, 0.12)';
          feedbackBox.style.border = '1px solid rgba(0, 137, 207, 0.3)';
          feedbackBox.style.color = 'var(--text-main)';
          feedbackBox.innerHTML = `
            <strong>Login-Fenster geöffnet:</strong><br>
            Bitte melde dich im geöffneten Tab an. Kopiere anschliessend die URL der Seite <em>«Anmeldung erfolgreich – SHV»</em> und füge sie oben ein.
          `;
          if (inputUrl) inputUrl.focus();
        } catch (err) {
          console.error('[ProfileView] Error starting OIDC:', err);
          btnStart.disabled = false;
          btnStart.innerHTML = `<span>1. Mit SHV-Konto anmelden (Keycloak) ↗</span>`;
          feedbackBox.className = '';
          feedbackBox.style.background = 'rgba(213, 43, 30, 0.12)';
          feedbackBox.style.border = '1px solid rgba(213, 43, 30, 0.3)';
          feedbackBox.style.color = '#ff6b6b';
          feedbackBox.textContent = `Fehler beim Login-Start: ${err.message}`;
        }
      });
    }

    // Hook up Button 2: Submit Callback URL
    const btnSubmit = container.querySelector('#btn-submit-callback');
    if (btnSubmit) {
      btnSubmit.addEventListener('click', async () => {
        const val = inputUrl ? inputUrl.value.trim() : '';
        if (!val) {
          feedbackBox.className = '';
          feedbackBox.style.background = 'rgba(213, 43, 30, 0.12)';
          feedbackBox.style.border = '1px solid rgba(213, 43, 30, 0.3)';
          feedbackBox.style.color = '#ff6b6b';
          feedbackBox.textContent = 'Bitte füge die vollständige Callback-URL der Seite «Anmeldung erfolgreich» ein.';
          return;
        }

        try {
          btnSubmit.disabled = true;
          btnSubmit.innerHTML = `<span>Token wird geprüft & Profildaten werden geladen...</span>`;
          feedbackBox.className = '';
          feedbackBox.style.background = 'rgba(0, 137, 207, 0.12)';
          feedbackBox.style.border = '1px solid rgba(0, 137, 207, 0.3)';
          feedbackBox.style.color = 'var(--text-main)';
          feedbackBox.textContent = 'Token-Austausch läuft mit SHV Keycloak...';

          const exchangeResult = await ShvApi.authExchange(val);
          store.setSession(exchangeResult.sid, exchangeResult.profile);
          await renderProfileView(container);
        } catch (err) {
          console.error('[ProfileView] Exchange error:', err);
          btnSubmit.disabled = false;
          btnSubmit.innerHTML = `<span>2. Anmeldung abschliessen</span>`;
          feedbackBox.className = '';
          feedbackBox.style.background = 'rgba(213, 43, 30, 0.12)';
          feedbackBox.style.border = '1px solid rgba(213, 43, 30, 0.3)';
          feedbackBox.style.color = '#ff6b6b';
          feedbackBox.textContent = err.message || 'Token-Austausch fehlgeschlagen.';
        }
      });
    }

    return;
  }

  // 2. AUTHENTICATED LOGGED-IN PROFILE (Render genuine verified member data)
  const fullName = p.firstName && p.lastName
    ? `${p.firstName} ${p.lastName}`
    : (p.name || p.companyName || 'SHV Mitglied');
  const shvId = p.shvNumber || p.shvNummer || p.extId || '–';
  const canton = p.address?.kanton || p.canton || '–';
  const categoryName = p.memberships?.[0]?.mitgliedkategorie?.name || p.memberCategory || 'Aktivmitglied';
  const membershipOrg = p.memberships?.[0]?.organisationName || '';
  const validUntil = p.memberships?.[0]?.austrittsdatum || 'Aktiv';

  container.innerHTML = `
    <div class="profile-view-wrapper">
      <div class="profile-top-header" style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px;">
        <div>
          <span class="badge-tag">Offizielle Mitgliedschaft</span>
          <h2 class="section-heading">${fullName}</h2>
          <p class="section-sub">SHV-Nr. ${shvId} · ${categoryName}${membershipOrg ? ` (${membershipOrg})` : ''}</p>
        </div>
        <div>
          <button id="btn-logout" class="btn-secondary" style="padding: 8px 16px; font-size: 0.85rem; font-weight: 600;">
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
                <span class="pilot-fullname">${fullName}</span>
                <span class="pilot-shv-id">${t.profile.memberNumber}: <strong>${shvId}</strong></span>
              </div>

              <div class="card-qr-box">
                <span class="qr-label">SHV MITGLIED</span>
              </div>
            </div>

            <div class="card-footer-line">
              <div class="footer-col">
                <span class="card-sub-lbl">Kategorie</span>
                <span class="card-sub-val">${categoryName}</span>
              </div>
              <div class="footer-col">
                <span class="card-sub-lbl">Kanton</span>
                <span class="card-sub-val">${canton}</span>
              </div>
              <div class="footer-col text-right">
                <span class="card-sub-lbl">${t.profile.validUntil}</span>
                <span class="card-sub-val text-bold">${validUntil}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 2. PILOT RATINGS / BREVETS (Rendered only if present in genuine response) -->
      ${Array.isArray(p.brevets) && p.brevets.length > 0 ? `
        <section class="profile-section">
          <h3 class="section-heading-sm">Berechtigungen & Lizenzen</h3>
          <div class="ratings-card-box">
            ${p.brevets.map(b => {
              const catName = b.category || b.name || 'Brevet';
              return `
                <div class="rating-badge-item">
                  <div class="rating-icon">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <div class="rating-info">
                    <span class="rating-title">${catName}</span>
                    <span class="rating-status">Aktiv · SHV Prüfungskommission</span>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </section>
      ` : ''}

      <!-- 3. LIABILITY INSURANCE STATUS (Rendered only if present in genuine response) -->
      ${p.insurance ? `
        <section class="profile-section">
          <h3 class="section-heading-sm">${t.profile.insuranceTitle}</h3>
          <div class="insurance-card-box">
            <div class="ins-top">
              <span class="ins-amount">${p.insurance.beschreibung || p.insurance.name || 'Gültig versichert'}</span>
              <span class="ins-status-badge">Aktiv versichert</span>
            </div>
            <p class="ins-notice">${t.profile.insuranceNotice}</p>
            <div class="ins-meta">
              ${p.insurance.name ? `<span>Typ: ${p.insurance.name}</span>` : ''}
              ${p.insurance.endDatum ? `<span>Gültig bis: ${p.insurance.endDatum}</span>` : ''}
              ${membershipOrg ? `<span>Club: <strong>${membershipOrg}</strong></span>` : ''}
            </div>
          </div>
        </section>
      ` : ''}

      <!-- 4. MEMBERSHIPS & CLUBS -->
      ${Array.isArray(p.memberships) && p.memberships.length > 0 ? `
        <section class="profile-section">
          <h3 class="section-heading-sm">Verbandszugehörigkeit & Clubs</h3>
          <div class="ratings-card-box">
            ${p.memberships.map(m => `
              <div class="rating-badge-item">
                <div class="rating-icon" style="color: var(--primary-accent); background: rgba(0, 137, 207, 0.12);">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                </div>
                <div class="rating-info">
                  <span class="rating-title">${m.organisationName || 'SHV Verband'}</span>
                  <span class="rating-status">${m.mitgliedkategorie?.name || 'Mitglied'} ${m.eintrittsdatum ? `(Eintritt: ${m.eintrittsdatum})` : ''}</span>
                </div>
              </div>
            `).join('')}
          </div>
        </section>
      ` : ''}
    </div>
  `;

  const btnLogout = container.querySelector('#btn-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      const curSid = store.state.sid;
      if (curSid) {
        await ShvApi.authLogout(curSid);
      }
      store.logout();
      await renderProfileView(container);
    });
  }
}
