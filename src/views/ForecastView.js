import { store } from '../state.js';

export class ForecastView {
  constructor(container) {
    this.container = container;
  }

  mount() {
    this.render();
  }

  unmount() {}

  render() {
    const p = store.state.profile;
    const sid = store.state.sid;

    if (sid && p) {
      const fullName = p.firstName && p.lastName
        ? `${p.firstName} ${p.lastName}`
        : (p.name || 'SHV Mitglied');
      const shvId = p.shvNumber || p.shvNummer || p.extId || '–';

      this.container.innerHTML = `
        <div class="forecast-view-wrapper">
          <div class="member-blocker-card" style="border-color: rgba(0, 137, 207, 0.4);">
            <div class="blocker-icon-badge" style="background: rgba(0, 137, 207, 0.12); border-color: rgba(0, 137, 207, 0.3); color: var(--primary-accent);">
              <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"></path>
              </svg>
            </div>
            <span class="badge-tag">SHV Flugwetter</span>
            <h2 class="blocker-title">SHV Meteo Portal</h2>
            <p class="blocker-text">
              Angemeldet als <strong>${fullName}</strong> (SHV-Nr. ${shvId}). Die täglichen Segelflug-Wetterberichte, Thermik- und Windprognosen stehen dir im offiziellen SHV-Wetterportal zur Verfügung.
            </p>

            <div class="blocker-actions-column" style="display: flex; flex-direction: column; gap: 10px; width: 100%; max-width: 380px; margin: 0 auto;">
              <a href="https://www.shv-fsvl.ch/wetter" target="_blank" rel="noopener" class="btn-primary" style="display: flex; align-items: center; justify-content: center; text-decoration: none; padding: 14px 18px; border-radius: 12px; font-weight: 700;">
                <span>SHV Wetterportal öffnen (shv-fsvl.ch/wetter) ↗</span>
              </a>
              <button id="btn-goto-profile" class="btn-secondary" style="padding: 12px 18px; border-radius: 12px; font-weight: 600;">
                <span>Mein SHV Profil & Lizenzen ansehen</span>
              </button>
            </div>
          </div>
        </div>
      `;

      const btnProfile = this.container.querySelector('#btn-goto-profile');
      if (btnProfile) {
        btnProfile.addEventListener('click', () => {
          store.setTab('profile');
        });
      }
      return;
    }

    this.container.innerHTML = `
      <div class="forecast-view-wrapper">
        <div class="member-blocker-card">
          <div class="blocker-icon-badge">
            <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          </div>
          <span class="badge-tag">SHV FSVL Flugwetter & Previtemps</span>
          <h2 class="blocker-title">Nur für Mitglieder</h2>
          <p class="blocker-text">
            Dieser Inhalt ist aktiven SHV-Mitgliedern vorbehalten. Die täglichen Segelflug-Wetterberichte, Thermikprognosen, Höhenwinde und Previtemps-Soundings erfordern einen Login mit deinem SHV-Mitgliedskonto auf dem offiziellen Verbandsportal.
          </p>

          <div class="auth-notice-box" style="background: rgba(255, 255, 255, 0.04); border: 1px solid var(--border-color); border-radius: 12px; padding: 14px; margin: 18px 0; text-align: left; font-size: 0.88rem; line-height: 1.45; color: var(--text-muted);">
            <div style="font-weight: 600; color: var(--text-main); margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
              Keine Beispieldaten
            </div>
            Die detaillierten Flugwetterberichte werden von autorisierten SHV-Meteo-Diensten bereitgestellt. Ohne verifizierten SHV-Login werden hier keine simulierten oder fiktiven Prognosen angezeigt.
          </div>

          <div class="blocker-actions-column" style="display: flex; flex-direction: column; gap: 10px; width: 100%; max-width: 380px; margin: 0 auto;">
            <button id="btn-goto-login-tab" class="btn-primary" style="display: flex; align-items: center; justify-content: center; padding: 12px 18px; border-radius: 12px; font-weight: 600;">
              <span>Mit SHV-Konto anmelden (im Profil)</span>
            </button>
            <a href="https://www.shv-fsvl.ch/wetter" target="_blank" rel="noopener" class="btn-secondary" style="display: flex; align-items: center; justify-content: center; text-decoration: none; padding: 12px 18px; border-radius: 12px; font-weight: 600;">
              <span>Offizielles SHV Wetterportal öffnen ↗</span>
            </a>
          </div>
        </div>
      </div>
    `;

    const btnLogin = this.container.querySelector('#btn-goto-login-tab');
    if (btnLogin) {
      btnLogin.addEventListener('click', () => {
        store.setTab('profile');
      });
    }
  }
}
