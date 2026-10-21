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
            <a href="https://www.shv-fsvl.ch/wetter" target="_blank" rel="noopener" class="btn-primary" style="display: flex; align-items: center; justify-content: center; text-decoration: none; padding: 12px 18px; border-radius: 12px; font-weight: 600;">
              <span>Offizielles SHV Wetterportal öffnen ↗</span>
            </a>
            <a href="https://login.shv-fsvl.ch/realms/SHV/account/" target="_blank" rel="noopener" class="btn-secondary" style="display: flex; align-items: center; justify-content: center; text-decoration: none; padding: 12px 18px; border-radius: 12px; font-weight: 600;">
              <span>SHV Keycloak Login (login.shv-fsvl.ch) ↗</span>
            </a>
          </div>
        </div>
      </div>
    `;
  }
}
