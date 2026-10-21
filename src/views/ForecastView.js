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
    const t = store.t;
    const p = store.state.profile;

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
            Dieser Inhalt ist aktiven SHV-Mitgliedern vorbehalten. Die täglichen Segelflug-Wetterberichte, Thermikprognosen, Höhenwinde und Previtemps-Soundings erfordern einen Login mit deinem SHV-Mitgliedskonto.
          </p>

          <div class="blocker-actions-column">
            <button id="btn-goto-login" class="btn-primary btn-login-submit" style="width: 100%;">
              <span>${p ? 'Mit SHV-Konto synchronisieren' : 'Jetzt anmelden (Mitglieds-Login)'}</span>
            </button>
            <a href="https://www.shv-fsvl.ch/wetter" target="_blank" rel="noopener" class="btn-secondary" style="width: 100%; text-align: center; display: inline-block; text-decoration: none; padding: 12px 16px; border-radius: 12px; margin-top: 10px; font-weight: 600;">
              Offizielles SHV Wetterportal öffnen ↗
            </a>
          </div>
        </div>
      </div>
    `;

    const btnLogin = this.container.querySelector('#btn-goto-login');
    if (btnLogin) {
      btnLogin.addEventListener('click', () => {
        store.setTab('profile');
      });
    }
  }
}
