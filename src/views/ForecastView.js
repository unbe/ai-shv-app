import { store } from '../state.js';
import { ShvApi } from '../services/api.js';

export class ForecastView {
  constructor(container) {
    this.container = container;
    this.forecastData = null;
    this.activeDay = '0'; // '0' | '1' | '2'
    this.activeSection = 'text'; // 'text' | 'isobaren' | 'soundings'
    this.loading = false;
    this.error = null;
  }

  async mount() {
    this.loading = true;
    this.error = null;
    this.render();

    try {
      const lang = store.state.lang || 'de';
      const data = await ShvApi.getTextForecast(lang);
      if (data && data.forecast) {
        this.forecastData = data.forecast;
      } else {
        throw new Error('Keine Prognosedaten verfügbar');
      }
    } catch (err) {
      console.error('[ForecastView] Error loading text forecast:', err);
      this.error = 'Flugwetter-Textprognose konnte nicht geladen werden.';
    } finally {
      this.loading = false;
      this.render();
    }
  }

  unmount() {}

  render() {
    const lang = store.state.lang || 'de';
    const isobarenUrl = ShvApi.getIsobarenSvgUrl(lang);

    const issueTimeStr = this.forecastData?.issueTime
      ? new Date(this.forecastData.issueTime).toLocaleString(lang === 'de' ? 'de-CH' : 'fr-CH', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : null;

    let dayContentHtml = '';
    if (this.forecastData?.text && this.forecastData.text[this.activeDay]) {
      const rawHtml = this.forecastData.text[this.activeDay];
      // Extract content from body
      const bodyMatch = rawHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      const innerContent = bodyMatch ? bodyMatch[1] : rawHtml;
      dayContentHtml = `
        <div class="prognosis-text-body">
          ${innerContent}
        </div>
      `;
    }

    const dayLabels = {
      de: { '0': 'Heute', '1': 'Morgen', '2': 'Übermorgen' },
      fr: { '0': "Aujourd'hui", '1': 'Demain', '2': 'Après-demain' },
      it: { '0': 'Oggi', '1': 'Domani', '2': 'Dopodomani' },
    }[lang] || { '0': 'Heute', '1': 'Morgen', '2': 'Übermorgen' };

    this.container.innerHTML = `
      <div class="forecast-view-wrapper">
        <!-- Top Navigation Segmented Bar -->
        <div class="forecast-top-bar">
          <div class="forecast-section-switcher">
            <button data-section="text" class="forecast-tab-btn ${this.activeSection === 'text' ? 'active' : ''}">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
              <span>Textprognose</span>
            </button>
            <button data-section="isobaren" class="forecast-tab-btn ${this.activeSection === 'isobaren' ? 'active' : ''}">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
              </svg>
              <span>Isobarenkarte</span>
            </button>
            <button data-section="soundings" class="forecast-tab-btn ${this.activeSection === 'soundings' ? 'active' : ''}">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 3v18h18"></path>
                <path d="m19 9-5 5-4-4-3 3"></path>
              </svg>
              <span>Soundings & Previtemps</span>
            </button>
          </div>
        </div>

        <!-- Section 1: Official Text Forecast -->
        ${this.activeSection === 'text' ? `
          <div class="forecast-content-card">
            <div class="section-header-row">
              <div>
                <span class="badge-tag">MeteoSchweiz & SHV</span>
                <h2 class="section-heading">Alpines Flugwetter</h2>
                ${issueTimeStr ? `<p class="section-sub">Ausgabe: ${issueTimeStr}</p>` : ''}
              </div>
            </div>

            <!-- Day Tabs -->
            <div class="day-pills-row">
              <button data-day="0" class="day-pill ${this.activeDay === '0' ? 'active' : ''}">${dayLabels['0']}</button>
              <button data-day="1" class="day-pill ${this.activeDay === '1' ? 'active' : ''}">${dayLabels['1']}</button>
              <button data-day="2" class="day-pill ${this.activeDay === '2' ? 'active' : ''}">${dayLabels['2']}</button>
            </div>

            ${this.loading ? `
              <div class="loading-spinner">
                <div class="spinner"></div>
                <span>Prognose wird geladen...</span>
              </div>
            ` : this.error ? `
              <div class="error-notice">${this.error}</div>
            ` : `
              <div class="forecast-prognosis-container">
                ${dayContentHtml}
              </div>
            `}
          </div>
        ` : ''}

        <!-- Section 2: Synoptic Isobar Chart -->
        ${this.activeSection === 'isobaren' ? `
          <div class="forecast-content-card">
            <div class="section-header-row">
              <div>
                <span class="badge-tag">Synoptik</span>
                <h2 class="section-heading">Offizielle Isobarenkarte</h2>
                <p class="section-sub">Bodennahres Druckfeld & Frontenverlauf über Mitteleuropa</p>
              </div>
              <a href="${isobarenUrl}" target="_blank" rel="noopener" class="btn-secondary" style="font-size: 0.8rem; padding: 6px 12px; text-decoration: none;">
                Vollbild ↗
              </a>
            </div>

            <div class="isobaren-container">
              <img src="${isobarenUrl}" alt="Offizielle Isobarenkarte" class="isobaren-svg" loading="lazy" />
            </div>
          </div>
        ` : ''}

        <!-- Section 3: Soundings & Previtemps -->
        ${this.activeSection === 'soundings' ? `
          <div class="forecast-content-card">
            <div class="section-header-row">
              <div>
                <span class="badge-tag">Previtemps</span>
                <h2 class="section-heading">Radiosondierungen & Thermikprognosen</h2>
                <p class="section-sub">Payerne, Stuttgart, Mailand & alpine Vertikalprofile</p>
              </div>
            </div>

            <div class="sounding-portal-box">
              <div class="portal-info-banner">
                <div class="info-icon">📈</div>
                <div class="info-text">
                  <strong>Previtemps & Sounding-Diagramme</strong>
                  <p>
                    Die hochauflösenden Emagramme und Vertikalschnitte von MeteoSchweiz für Payerne (00Z & 12Z) sowie ICON-D2-Soundings stehen allen lizenzierten SHV-Piloten im Verbandsportal zur Verfügung.
                  </p>
                </div>
              </div>

              <div class="soundings-links-grid">
                <a href="https://www.shv-fsvl.ch/wetter" target="_blank" rel="noopener" class="sounding-card-link">
                  <span class="card-link-title">SHV Meteo Portal ↗</span>
                  <span class="card-link-sub">Offizielle Flugwetterberichte, Windgramme & Thermik</span>
                </a>
                <a href="https://www.meteoschweiz.admin.ch/home/wetter/messwerte/radiosondierungen.html" target="_blank" rel="noopener" class="sounding-card-link">
                  <span class="card-link-title">Radiosondierung Payerne (MeteoSchweiz) ↗</span>
                  <span class="card-link-sub">Tägliche 00Z & 12Z Ballonaufstiege</span>
                </a>
              </div>
            </div>
          </div>
        ` : ''}
      </div>
    `;

    this.attachEvents();
  }

  attachEvents() {
    // Section Switcher
    this.container.querySelectorAll('.forecast-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.activeSection = btn.getAttribute('data-section');
        this.render();
      });
    });

    // Day Pills Switcher
    this.container.querySelectorAll('.day-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        this.activeDay = btn.getAttribute('data-day');
        this.render();
      });
    });
  }
}
