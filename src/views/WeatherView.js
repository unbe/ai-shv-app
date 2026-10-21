import { Chart, registerables } from 'chart.js';
import { store } from '../state.js';
import { ShvApi } from '../services/api.js';

Chart.register(...registerables);

export class WeatherView {
  constructor(container) {
    this.container = container;
    this.chart = null;
    this.foehnData = null;
    this.measurementsData = null;
    this.selectedCanton = 'ALL';
    this.stationSearch = '';
  }

  async mount() {
    this.container.innerHTML = `
      <div class="weather-view-wrapper">
        <div class="loading-spinner">
          <div class="spinner"></div>
          <span>Wetterdaten werden geladen...</span>
        </div>
      </div>
    `;

    try {
      const [foehn, measurements] = await Promise.all([
        ShvApi.getFoehn(),
        ShvApi.getMeasurements(),
      ]);

      this.foehnData = foehn;
      this.measurementsData = measurements;
      this.render();
    } catch (e) {
      console.error('Weather load error:', e);
      this.container.innerHTML = `<div class="error-notice">Fehler beim Laden der Wetterdaten.</div>`;
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
    const f = this.foehnData?.primaryPair || { diffHpa: 0, status: 'CALM', alertLevel: 'NONE' };
    const diff = f.diffHpa;
    const isDanger = f.alertLevel === 'DANGER';
    const isMod = f.alertLevel === 'MODERATE';
    const bannerClass = isDanger ? 'banner-danger' : isMod ? 'banner-warning' : 'banner-safe';

    // Filter stations
    let stations = (this.measurementsData && this.measurementsData.features) || [];
    if (this.stationSearch) {
      const q = this.stationSearch.toLowerCase();
      stations = stations.filter(st => (st.properties?.name || '').toLowerCase().includes(q));
    }

    this.container.innerHTML = `
      <div class="weather-view-wrapper">
        <!-- 1. FOEHN PRESSURE GRADIENT SECTION -->
        <section class="weather-section foehn-card">
          <div class="section-header-row">
            <div>
              <span class="badge-tag">Stationspaare</span>
              <h2 class="section-heading">${t.weather.foehnTitle}</h2>
              <p class="section-sub">${t.weather.foehnSub}</p>
            </div>
            <div class="foehn-gauge-pill ${bannerClass}">
              <span class="gauge-val">${diff > 0 ? '+' : ''}${diff}</span>
              <span class="gauge-unit">hPa</span>
            </div>
          </div>

          <!-- Status Alert Banner -->
          <div class="foehn-banner ${bannerClass}">
            <div class="banner-icon">
              ${isDanger ? '⚠️' : isMod ? '⚡' : '✅'}
            </div>
            <div class="banner-content">
              <strong>${f.status}</strong>
              <p>${store.state.lang === 'de' ? (f.descriptionDe || '') : (f.descriptionEn || '')}</p>
            </div>
          </div>

          <!-- Transect Stations Comparison -->
          <div class="transect-row">
            <div class="transect-station">
              <span class="station-side">Südseite (Tessin)</span>
              <span class="st-name">${f.southStation?.name || 'Lugano'}</span>
              <span class="st-qnh">${f.southStation?.pressureHpa || '1018.5'} hPa</span>
            </div>
            <div class="transect-arrow-box">
              <span class="arrow-label">Δp = ${diff > 0 ? '+' : ''}${diff} hPa</span>
              <div class="transect-line"></div>
            </div>
            <div class="transect-station">
              <span class="station-side">Nordseite (Mittelland)</span>
              <span class="st-name">${f.northStation?.name || 'Zürich / Kloten'}</span>
              <span class="st-qnh">${f.northStation?.pressureHpa || '1017.8'} hPa</span>
            </div>
          </div>

          <!-- Trend Chart Container -->
          <div class="chart-wrapper">
            <h4 class="chart-title">${t.weather.foehnChartTitle}</h4>
            <div class="chart-canvas-container">
              <canvas id="foehn-history-chart"></canvas>
            </div>
          </div>

          <!-- Secondary Transects -->
          ${this.foehnData?.secondaryPairs ? `
            <div class="secondary-transects-grid">
              ${this.foehnData.secondaryPairs.map(p => `
                <div class="sec-pair-card">
                  <span class="sec-pair-name">${p.name}</span>
                  <span class="sec-pair-diff ${Math.abs(p.diffHpa) >= 4 ? 'text-warning' : ''}">${p.diffHpa > 0 ? '+' : ''}${p.diffHpa} hPa</span>
                </div>
              `).join('')}
            </div>
          ` : ''}
        </section>

        <!-- 2. LIVE WEATHER STATIONS SECTION -->
        <section class="weather-section stations-section">
          <div class="section-header-row">
            <div>
              <span class="badge-tag">MeteoSchweiz & SLF</span>
              <h2 class="section-heading">${t.weather.stationsTitle}</h2>
              <p class="section-sub">${stations.length} aktive alpine Messstationen</p>
            </div>
          </div>

          <!-- Search Input -->
          <div class="station-search-box">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input type="text" id="station-filter-input" placeholder="${t.weather.searchStation}" value="${this.stationSearch}" />
          </div>

          <!-- Stations Grid -->
          <div class="stations-cards-grid">
            ${stations.slice(0, 48).map(st => {
              const p = st.properties || {};
              const windSpeed = p.windSpeedValue ? Math.round(p.windSpeedValue * 3.6) : null;
              const windGust = p.windGustValue ? Math.round(p.windGustValue * 3.6) : null;
              const dir = p.windDirectionValue || 0;
              const temp = p.temperatureValue ? (p.temperatureValue > 200 ? Math.round((p.temperatureValue - 273.15) * 10) / 10 : Math.round(p.temperatureValue * 10) / 10) : null;
              const press = p.pressureStandardMslValue ? (p.pressureStandardMslValue > 5000 ? Math.round(p.pressureStandardMslValue / 10) : Math.round(p.pressureStandardMslValue)) : null;

              return `
                <div class="station-card-item" data-station-id="${st.id || ''}">
                  <div class="st-card-top">
                    <div>
                      <h4 class="st-card-name">${p.name || 'Station'}</h4>
                      <span class="st-card-alt">${p.altitude ? `${p.altitude}m` : ''} · ${(p.providerKey || 'Meteo').toUpperCase()}</span>
                    </div>
                    <div class="st-card-arrow" style="transform: rotate(${dir}deg)" title="Windrichtung ${Math.round(dir)}°">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2L4 20l8-4 8 4z"/>
                      </svg>
                    </div>
                  </div>
                  <div class="st-card-stats">
                    <div class="st-stat">
                      <span class="st-stat-lbl">Wind</span>
                      <span class="st-stat-val ${windSpeed >= 30 ? 'text-danger' : windSpeed >= 20 ? 'text-warning' : ''}">${windSpeed !== null ? `${windSpeed} km/h` : '–'}</span>
                    </div>
                    <div class="st-stat">
                      <span class="st-stat-lbl">Böe</span>
                      <span class="st-stat-val text-warning">${windGust !== null ? `${windGust} km/h` : '–'}</span>
                    </div>
                    <div class="st-stat">
                      <span class="st-stat-lbl">Temp</span>
                      <span class="st-stat-val">${temp !== null ? `${temp}°` : '–'}</span>
                    </div>
                    <div class="st-stat">
                      <span class="st-stat-lbl">QNH</span>
                      <span class="st-stat-val">${press !== null ? `${press}` : '–'}</span>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </section>
      </div>
    `;

    this.initChart();
    this.attachEvents();
  }

  initChart() {
    const canvas = this.container.querySelector('#foehn-history-chart');
    if (!canvas || !this.foehnData?.history) return;

    const history = this.foehnData.history;
    const labels = history.map(h => h.time);
    const dataPoints = history.map(h => h.diffHpa);

    const isDark = store.state.theme === 'dark';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)';
    const textColor = isDark ? '#94A3B8' : '#64748B';

    this.chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Druckdifferenz Lugano - Kloten (hPa)',
            data: dataPoints,
            borderColor: '#EF4444',
            backgroundColor: 'rgba(239, 68, 68, 0.12)',
            borderWidth: 2.5,
            fill: true,
            tension: 0.35,
            pointRadius: 3,
            pointHoverRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `Differenz: ${ctx.parsed.y > 0 ? '+' : ''}${ctx.parsed.y} hPa`,
            },
          },
        },
        scales: {
          x: {
            grid: { color: gridColor },
            ticks: { color: textColor },
          },
          y: {
            grid: { color: gridColor },
            ticks: {
              color: textColor,
              callback: (v) => `${v > 0 ? '+' : ''}${v} hPa`,
            },
          },
        },
      },
    });
  }

  attachEvents() {
    const searchInput = this.container.querySelector('#station-filter-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.stationSearch = e.target.value;
        this.render();
      });
    }

    // Clicking station card opens BottomSheet on map
    this.container.querySelectorAll('.station-card-item').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.getAttribute('data-station-id');
        const st = (this.measurementsData?.features || []).find(f => f.id === id);
        if (st) {
          store.selectStation(st);
          store.setTab('map');
        }
      });
    });
  }
}
