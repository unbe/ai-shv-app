import { Chart, registerables } from 'chart.js';
import { store } from '../state.js';
import { ShvApi } from '../services/api.js';

Chart.register(...registerables);

export class ForecastView {
  constructor(container) {
    this.container = container;
    this.chart = null;
    this.emagramData = null;
    this.simTemp = 18;
    this.simDew = 8;
  }

  async mount() {
    this.container.innerHTML = `
      <div class="forecast-view-wrapper">
        <div class="loading-spinner">
          <div class="spinner"></div>
          <span>Flugwetter-Prognosen werden geladen...</span>
        </div>
      </div>
    `;

    try {
      this.emagramData = await ShvApi.getEmagramSounding();
      this.render();
    } catch (e) {
      console.error('Forecast load error:', e);
      this.container.innerHTML = `<div class="error-notice">Fehler beim Laden der Flugwetterdaten.</div>`;
    }
  }

  unmount() {
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
  }

  render() {
    const t = store.t;
    const em = this.emagramData || {
      cloud_base_lcl: { alt_asl: 1850, height_agl: 1360 },
      thermal_ceiling_asl: 2600,
      climb_rate_avg_ms: 2.5,
      thermal_rating: 'Gut (Good XC conditions)',
      trigger_temperature_c: 19.5,
      surface: { temp: 16.5, dew: 8.0 },
    };

    const lclAlt = em.cloud_base_lcl?.alt_asl || 1850;
    const lclAgl = em.cloud_base_lcl?.height_agl || 1360;
    const thermalCeiling = em.thermal_ceiling_asl || 2600;
    const climbRate = em.climb_rate_avg_ms || 2.5;

    this.container.innerHTML = `
      <div class="forecast-view-wrapper">
        <!-- 1. DAILY SEWING SYNOPSIS -->
        <section class="forecast-section synopsis-card">
          <div class="section-header-row">
            <div>
              <span class="badge-tag">SHV / MeteoSchweiz</span>
              <h2 class="section-heading">${t.forecast.synopsisTitle}</h2>
              <p class="section-sub">Alpenraum & Voralpen · Aktuelle Flugwetterlage</p>
            </div>
            <div class="thermal-rating-pill">
              <span class="rating-label">Thermik-Güte</span>
              <span class="rating-val">${em.thermal_rating}</span>
            </div>
          </div>

          <div class="synopsis-content">
            <p>
              Ein schwacher Hochdruckkeil über den Westalpen sorgt für vorwiegend sonnige und trockene Verhältnisse.
              Im Mittelland löst sich der morgendliche Frühnebel bis Mittag auf. In den Voralpen und Zentralalpen setzt
              ab 11:30 Uhr mässige bis gute thermische Entwicklung ein. Basissteigung am Nachmittag bis auf ca. ${lclAlt} m ü. M.
              Schwacher Überdruck im Süden, kein Föhndurchbruch zu erwarten.
            </p>
          </div>

          <!-- Key Metrics Badges -->
          <div class="forecast-metrics-grid">
            <div class="metric-card">
              <span class="metric-lbl">${t.forecast.cloudBase}</span>
              <span class="metric-val text-primary">${lclAlt} m</span>
              <span class="metric-sub">${lclAgl} m AGL</span>
            </div>
            <div class="metric-card">
              <span class="metric-lbl">${t.forecast.thermalCeiling}</span>
              <span class="metric-val">${thermalCeiling} m</span>
              <span class="metric-sub">Thermik-Obergrenze</span>
            </div>
            <div class="metric-card">
              <span class="metric-lbl">${t.forecast.climbRate}</span>
              <span class="metric-val text-success">+${climbRate} m/s</span>
              <span class="metric-sub">Integrierter Mittelwert</span>
            </div>
            <div class="metric-card">
              <span class="metric-lbl">${t.forecast.triggerTemp}</span>
              <span class="metric-val">${em.trigger_temperature_c}°C</span>
              <span class="metric-sub">Auslöse am Boden</span>
            </div>
          </div>
        </section>

        <!-- 2. WINDS ALOFT TABLE -->
        <section class="forecast-section">
          <h3 class="section-heading-sm">${t.forecast.windAloftTitle}</h3>
          <div class="wind-table-wrapper">
            <table class="wind-aloft-table">
              <thead>
                <tr>
                  <th>Höhe</th>
                  <th>Druckfläche</th>
                  <th>Richtung</th>
                  <th>Geschwindigkeit</th>
                  <th>Temperatur</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Boden (Mittelland)</strong></td>
                  <td>~960 hPa</td>
                  <td>240° (WSW)</td>
                  <td>8 – 14 km/h</td>
                  <td>+17°C</td>
                </tr>
                <tr>
                  <td><strong>1000 m ü. M.</strong></td>
                  <td>900 hPa</td>
                  <td>250° (WSW)</td>
                  <td>15 – 22 km/h</td>
                  <td>+13°C</td>
                </tr>
                <tr>
                  <td><strong>1500 m ü. M.</strong></td>
                  <td>850 hPa</td>
                  <td>260° (W)</td>
                  <td>18 – 25 km/h</td>
                  <td>+9°C</td>
                </tr>
                <tr>
                  <td><strong>2000 m ü. M.</strong></td>
                  <td>800 hPa</td>
                  <td>270° (W)</td>
                  <td>22 – 30 km/h</td>
                  <td>+5°C</td>
                </tr>
                <tr>
                  <td><strong>3000 m ü. M.</strong></td>
                  <td>700 hPa</td>
                  <td>275° (W)</td>
                  <td>30 – 42 km/h</td>
                  <td>-2°C</td>
                </tr>
                <tr>
                  <td><strong>4000 m ü. M.</strong></td>
                  <td>600 hPa</td>
                  <td>280° (W)</td>
                  <td>45 – 60 km/h</td>
                  <td>-9°C</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- 3. INTERACTIVE EMAGRAM & SOUNDING CALCULATOR -->
        <section class="forecast-section emagram-section">
          <div class="section-header-row">
            <div>
              <span class="badge-tag">Payerne 12Z · Python Engine</span>
              <h2 class="section-heading">${t.forecast.emagramTitle}</h2>
              <p class="section-sub">${t.forecast.emagramSub}</p>
            </div>
          </div>

          <!-- Sounding Chart Canvas -->
          <div class="emagram-canvas-container">
            <canvas id="emagram-chart"></canvas>
          </div>

          <!-- Interactive Simulation Controls -->
          <div class="emagram-sim-box">
            <h4 class="sim-heading">Interaktive Nachmittagserwärmung (Simulation)</h4>
            <div class="sim-controls-grid">
              <div class="sim-field">
                <label>Bodentemperatur: <strong id="sim-temp-val">${this.simTemp}°C</strong></label>
                <input type="range" id="sim-temp-slider" min="10" max="32" step="0.5" value="${this.simTemp}" />
              </div>
              <div class="sim-field">
                <label>Taupunkt: <strong id="sim-dew-val">${this.simDew}°C</strong></label>
                <input type="range" id="sim-dew-slider" min="0" max="20" step="0.5" value="${this.simDew}" />
              </div>
              <div class="sim-btn-wrapper">
                <button id="btn-recalc-emagram" class="btn-primary">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                  Berechnen
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    `;

    this.initEmagramChart();
    this.attachEvents();
  }

  initEmagramChart() {
    const canvas = this.container.querySelector('#emagram-chart');
    if (!canvas || !this.emagramData?.parcel_curve) return;

    const curve = this.emagramData.parcel_curve;
    const altitudes = curve.map(c => `${c.alt}m`);
    const envTemps = curve.map(c => c.env_t);
    const parcelTemps = curve.map(c => c.parcel_t);

    const isDark = store.state.theme === 'dark';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)';
    const textColor = isDark ? '#94A3B8' : '#64748B';

    this.chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: altitudes,
        datasets: [
          {
            label: 'Umgebungstemperatur T_env (°C)',
            data: envTemps,
            borderColor: '#3B82F6',
            backgroundColor: 'transparent',
            borderWidth: 2.5,
            pointRadius: 2,
          },
          {
            label: 'Aufsteigendes Thermikpaket T_parcel (°C)',
            data: parcelTemps,
            borderColor: '#EF4444',
            backgroundColor: 'rgba(239, 68, 68, 0.12)',
            borderWidth: 2,
            borderDash: [5, 4],
            fill: '+1',
            pointRadius: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: { color: textColor },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y}°C`,
            },
          },
        },
        scales: {
          x: {
            title: { display: true, text: 'Höhe ü. M.', color: textColor },
            grid: { color: gridColor },
            ticks: { color: textColor },
          },
          y: {
            title: { display: true, text: 'Temperatur (°C)', color: textColor },
            grid: { color: gridColor },
            ticks: { color: textColor },
          },
        },
      },
    });
  }

  attachEvents() {
    const tempSlider = this.container.querySelector('#sim-temp-slider');
    const dewSlider = this.container.querySelector('#sim-dew-slider');
    const tempVal = this.container.querySelector('#sim-temp-val');
    const dewVal = this.container.querySelector('#sim-dew-val');
    const recalcBtn = this.container.querySelector('#btn-recalc-emagram');

    if (tempSlider && tempVal) {
      tempSlider.addEventListener('input', (e) => {
        this.simTemp = parseFloat(e.target.value);
        tempVal.textContent = `${this.simTemp}°C`;
      });
    }

    if (dewSlider && dewVal) {
      dewSlider.addEventListener('input', (e) => {
        this.simDew = parseFloat(e.target.value);
        dewVal.textContent = `${this.simDew}°C`;
      });
    }

    if (recalcBtn) {
      recalcBtn.addEventListener('click', async () => {
        recalcBtn.disabled = true;
        recalcBtn.textContent = 'Berechne...';
        const updated = await ShvApi.calculateEmagram(this.simTemp, this.simDew);
        recalcBtn.disabled = false;
        recalcBtn.textContent = 'Berechnen';

        if (updated) {
          this.emagramData = updated;
          this.render();
        }
      });
    }
  }
}
