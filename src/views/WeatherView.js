import { Chart, registerables } from 'chart.js';
import { store } from '../state.js';
import { ShvApi } from '../services/api.js';

Chart.register(...registerables);

export class WeatherView {
  constructor(container) {
    this.container = container;
    this.chart = null;
    this.timeseriesChart = null;
    this.foehnData = null;
    this.measurementsData = null;
    this.webcamsData = null;
    this.selectedPairId = 'KLO_LUG'; // 'KLO_LUG' | 'GVE_GUT' | 'PIL_MTR' | 'DEM_GRE'
    this.activeTab = 'stations'; // 'stations' | 'webcams'
    this.selectedProvider = 'ALL'; // 'ALL' | 'meteo_swiss' | 'slf'
    this.stationSearch = '';
    this.modalStation = null;
    this.modalTimeseries = null;
    this.modalLoading = false;
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
      const [foehn, measurements, webcams] = await Promise.all([
        ShvApi.getFoehn(),
        ShvApi.getMeasurements(),
        ShvApi.getWebcams(),
      ]);

      this.foehnData = foehn;
      this.measurementsData = measurements;
      this.webcamsData = webcams;
      this.render();
    } catch (e) {
      console.error('[WeatherView] Load error:', e);
      this.container.innerHTML = `<div class="error-notice">Fehler beim Laden der Wetterdaten.</div>`;
    }
  }

  unmount() {
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
    if (this.timeseriesChart) {
      this.timeseriesChart.destroy();
      this.timeseriesChart = null;
    }
  }

  render() {
    const t = store.t;
    const pairs = this.foehnData?.pairs || [];
    const activePair = pairs.find(p => p.id === this.selectedPairId) || pairs[0] || {
      id: 'KLO_LUG',
      nameDe: 'Gotthard-Achse (Zürich/Kloten – Lugano)',
      unit: 'hPa',
      delta: 0,
      status: 'CALM',
      alertLevel: 'NONE',
    };

    const diff = activePair.delta ?? 0;
    const isDanger = activePair.alertLevel === 'DANGER';
    const isMod = activePair.alertLevel === 'MODERATE';
    const bannerClass = isDanger ? 'banner-danger' : isMod ? 'banner-warning' : 'banner-safe';

    // Filter stations
    let stations = (this.measurementsData && this.measurementsData.features) || [];
    if (this.selectedProvider !== 'ALL') {
      stations = stations.filter(st => (st.properties?.providerKey || '').toLowerCase() === this.selectedProvider.toLowerCase());
    }
    if (this.stationSearch) {
      const q = this.stationSearch.toLowerCase();
      stations = stations.filter(st => {
        const name = (st.properties?.name || '').toLowerCase();
        const id = (st.properties?.stationIdentifier || st.id || '').toLowerCase();
        return name.includes(q) || id.includes(q);
      });
    }

    // Filter webcams
    let webcams = (this.webcamsData && this.webcamsData.webcams) || [];
    if (this.stationSearch) {
      const q = this.stationSearch.toLowerCase();
      webcams = webcams.filter(w => (w.name || '').toLowerCase().includes(q) || (w.location || '').toLowerCase().includes(q));
    }

    this.container.innerHTML = `
      <div class="weather-view-wrapper">
        <!-- 1. OFFICIAL STATION DIFFERENCE PAIRS (4 OFFICIAL TRANSECTS) -->
        <section class="weather-section foehn-card">
          <div class="section-header-row">
            <div>
              <span class="badge-tag">Offizielle Stationspaare</span>
              <h2 class="section-heading">${t.weather.foehnTitle}</h2>
              <p class="section-sub">Druck- & Temperaturgradienten über den Alpenbogen</p>
            </div>
            <div class="foehn-gauge-pill ${bannerClass}">
              <span class="gauge-val">${diff > 0 ? '+' : ''}${diff}</span>
              <span class="gauge-unit">${activePair.unit || 'hPa'}</span>
            </div>
          </div>

          <!-- Pair Switcher Tabs -->
          <div class="pair-switcher-row">
            ${pairs.map(p => `
              <button data-pair-id="${p.id}" class="pair-pill-btn ${p.id === this.selectedPairId ? 'active' : ''}">
                <span class="pair-pill-id">${p.id.replace('_', ' – ')}</span>
                <span class="pair-pill-val ${p.alertLevel === 'DANGER' ? 'text-danger' : p.alertLevel === 'MODERATE' ? 'text-warning' : ''}">${p.delta > 0 ? '+' : ''}${p.delta} ${p.unit}</span>
              </button>
            `).join('')}
          </div>

          <!-- Status Alert Banner -->
          <div class="foehn-banner ${bannerClass}">
            <div class="banner-icon">
              ${isDanger ? '⚠️' : isMod ? '⚡' : '✅'}
            </div>
            <div class="banner-content">
              <strong>${activePair.status || 'NORMAL'}</strong>
              <p>${store.state.lang === 'de' ? (activePair.descriptionDe || '') : (activePair.descriptionEn || '')}</p>
            </div>
          </div>

          <!-- Active Pair Stations Comparison -->
          <div class="transect-row">
            <div class="transect-station">
              <span class="station-side">${activePair.isNorthSouth ? 'Südseite' : 'Ostseite'}</span>
              <span class="st-name">${activePair.station2?.name || 'Station 2'}</span>
              <span class="st-qnh">${activePair.isPressure ? `${activePair.station2?.pressureHpa ?? '–'} hPa` : `${activePair.station2?.temperatureC ?? '–'}°C`}</span>
              <span class="st-alt">${activePair.station2?.altitude ? `${activePair.station2.altitude} m` : ''}</span>
            </div>
            <div class="transect-arrow-box">
              <span class="arrow-label">Δ = ${diff > 0 ? '+' : ''}${diff} ${activePair.unit}</span>
              <div class="transect-line"></div>
            </div>
            <div class="transect-station">
              <span class="station-side">${activePair.isNorthSouth ? 'Nordseite' : 'Westseite'}</span>
              <span class="st-name">${activePair.station1?.name || 'Station 1'}</span>
              <span class="st-qnh">${activePair.isPressure ? `${activePair.station1?.pressureHpa ?? '–'} hPa` : `${activePair.station1?.temperatureC ?? '–'}°C`}</span>
              <span class="st-alt">${activePair.station1?.altitude ? `${activePair.station1.altitude} m` : ''}</span>
            </div>
          </div>

          <!-- Trend Chart Container (Real History) -->
          <div class="chart-wrapper">
            <h4 class="chart-title">Verlauf Gotthard-Druckdifferenz (Lugano - Kloten, 24h)</h4>
            <div class="chart-canvas-container">
              <canvas id="foehn-history-chart"></canvas>
            </div>
          </div>
        </section>

        <!-- 2. LIVE STATIONS & WEBCAMS SECTION -->
        <section class="weather-section stations-section">
          <div class="section-header-row">
            <div class="sub-view-switcher">
              <button id="btn-tab-stations" class="sub-tab-btn ${this.activeTab === 'stations' ? 'active' : ''}">
                Alpine Messstationen (${stations.length})
              </button>
              <button id="btn-tab-webcams" class="sub-tab-btn ${this.activeTab === 'webcams' ? 'active' : ''}">
                Webcams (${webcams.length})
              </button>
            </div>
          </div>

          <!-- Filters Row: Search & Provider -->
          <div class="station-filters-bar">
            <div class="station-search-box">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input type="text" id="weather-filter-input" placeholder="${this.activeTab === 'stations' ? 'Station suchen (z.B. Pilatus, KLO)...' : 'Webcam suchen...'}" value="${this.stationSearch}" />
            </div>

            ${this.activeTab === 'stations' ? `
              <div class="provider-filter-pills">
                <button data-provider="ALL" class="prov-pill ${this.selectedProvider === 'ALL' ? 'active' : ''}">Alle</button>
                <button data-provider="meteo_swiss" class="prov-pill ${this.selectedProvider === 'meteo_swiss' ? 'active' : ''}">MeteoSchweiz</button>
                <button data-provider="slf" class="prov-pill ${this.selectedProvider === 'slf' ? 'active' : ''}">SLF</button>
              </div>
            ` : ''}
          </div>

          <!-- Section Content -->
          ${this.activeTab === 'stations' ? `
            <div class="stations-cards-grid">
              ${stations.slice(0, 48).map(st => {
                const p = st.properties || {};
                const windSpeed = p.windSpeedValue ? Math.round(p.windSpeedValue * 3.6) : null;
                const windGust = p.windGustValue ? Math.round(p.windGustValue * 3.6) : null;
                const dir = p.windDirectionValue || 0;
                const rawT = p.temperature2mValue ?? p.temperatureValue;
                const temp = rawT ? (rawT > 200 ? Math.round((rawT - 273.15) * 10) / 10 : Math.round(rawT * 10) / 10) : null;
                const rawP = p.pressureMslValue ?? p.pressureStandardMslValue ?? p.pressureSurfaceValue;
                const press = rawP ? (rawP > 5000 ? Math.round(rawP / 10) : Math.round(rawP)) : null;

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
          ` : `
            <div class="webcams-cards-grid">
              ${webcams.slice(0, 36).map(wc => `
                <div class="webcam-card-item" data-webcam-id="${wc.identifier || ''}">
                  <div class="webcam-thumb-container">
                    <img src="${wc.thumbnailUrl || wc.latestImageUrl}" alt="${wc.name}" class="webcam-thumb-img" loading="lazy" />
                    <span class="webcam-alt-tag">${wc.altitudeM ? `${Math.round(wc.altitudeM)}m` : ''}</span>
                  </div>
                  <div class="webcam-card-meta">
                    <h4 class="webcam-title">${wc.name}</h4>
                    <span class="webcam-loc">${wc.location || wc.providerDisplayName || ''}</span>
                  </div>
                </div>
              `).join('')}
            </div>
          `}
        </section>

        <!-- 3. STATION DETAIL & TIMESERIES MODAL -->
        ${this.modalStation ? this.renderStationModal() : ''}
      </div>
    `;

    this.initChart();
    if (this.modalStation && this.modalTimeseries) {
      this.initTimeseriesChart();
    }
    this.attachEvents();
  }

  renderStationModal() {
    const st = this.modalStation;
    const p = st.properties || {};
    const rawT = p.temperature2mValue ?? p.temperatureValue;
    const tempC = rawT ? (rawT > 200 ? Math.round((rawT - 273.15) * 10) / 10 : Math.round(rawT * 10) / 10) : null;
    const rawDew = p.dewPoint2mValue;
    const dewC = rawDew ? (rawDew > 200 ? Math.round((rawDew - 273.15) * 10) / 10 : Math.round(rawDew * 10) / 10) : null;
    const humidity = p.relativeHumidity2mValue ?? p.relativeHumidityValue;
    const windSpeedKmH = p.windSpeedValue ? Math.round(p.windSpeedValue * 3.6) : null;
    const windGustKmH = p.windGustValue ? Math.round(p.windGustValue * 3.6) : null;
    const rawQnh = p.pressureMslValue ?? p.pressureStandardMslValue;
    const qnh = rawQnh ? (rawQnh > 5000 ? Math.round(rawQnh / 10) : Math.round(rawQnh)) : null;

    return `
      <div class="station-modal-backdrop" id="modal-backdrop">
        <div class="station-modal-content">
          <div class="modal-header">
            <div>
              <span class="sheet-badge badge-station">${(p.providerKey || 'Meteo').toUpperCase()}</span>
              <h3 class="modal-title">${p.name || 'Wetterstation'}</h3>
              <p class="modal-subtitle">${p.altitude ? `${p.altitude} m ü. M.` : ''} · ID: ${p.stationIdentifier || st.id}</p>
            </div>
            <button class="modal-close" id="btn-close-modal">&times;</button>
          </div>

          <!-- Telemetry Grid -->
          <div class="modal-telemetry-grid">
            <div class="stat-box">
              <span class="stat-label">Wind</span>
              <span class="stat-val ${windSpeedKmH >= 30 ? 'text-danger' : windSpeedKmH >= 20 ? 'text-warning' : ''}">${windSpeedKmH !== null ? `${windSpeedKmH} km/h` : '–'}</span>
              <span class="stat-sub">${p.windDirectionValue ? `${Math.round(p.windDirectionValue)}°` : ''}</span>
            </div>
            <div class="stat-box">
              <span class="stat-label">Böe</span>
              <span class="stat-val text-warning">${windGustKmH !== null ? `${windGustKmH} km/h` : '–'}</span>
            </div>
            <div class="stat-box">
              <span class="stat-label">Temperatur</span>
              <span class="stat-val">${tempC !== null ? `${tempC}°C` : '–'}</span>
            </div>
            <div class="stat-box">
              <span class="stat-label">Taupunkt</span>
              <span class="stat-val">${dewC !== null ? `${dewC}°C` : '–'}</span>
            </div>
            <div class="stat-box">
              <span class="stat-label">Luftfeuchte</span>
              <span class="stat-val">${humidity !== null && humidity !== undefined ? `${Math.round(humidity)}%` : '–'}</span>
            </div>
            <div class="stat-box">
              <span class="stat-label">Luftdruck QNH</span>
              <span class="stat-val">${qnh !== null ? `${qnh} hPa` : '–'}</span>
            </div>
          </div>

          <!-- 24h Timeseries Chart -->
          <div class="modal-chart-section">
            <h4 class="modal-section-title">24h Verlauf (Wind & Temperatur)</h4>
            ${this.modalLoading ? `
              <div class="modal-spinner">
                <div class="spinner"></div>
                <span>Zeitreihe wird geladen...</span>
              </div>
            ` : `
              <div class="modal-canvas-box">
                <canvas id="station-timeseries-chart"></canvas>
              </div>
            `}
          </div>

          <!-- Actions -->
          <div class="modal-actions-row">
            <button id="btn-view-on-map" class="btn-primary" style="flex: 1;">Auf Live-Karte anzeigen</button>
          </div>
        </div>
      </div>
    `;
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

    if (this.chart) {
      this.chart.destroy();
    }

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

  initTimeseriesChart() {
    const canvas = this.container.querySelector('#station-timeseries-chart');
    if (!canvas || !this.modalTimeseries?.timeseries) return;

    const series = this.modalTimeseries.timeseries;
    const tempSerie = series.find(s => s.parameter === 'temperature');
    const windSerie = series.find(s => s.parameter === 'wind_speed');

    const measurements = (tempSerie || windSerie)?.measurements || [];
    const labels = measurements.map(m => {
      const d = new Date(m.time);
      return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    });

    const tempData = tempSerie
      ? tempSerie.measurements.map(m => (m.value > 200 ? Math.round((m.value - 273.15) * 10) / 10 : Math.round(m.value * 10) / 10))
      : [];

    const windData = windSerie
      ? windSerie.measurements.map(m => Math.round(m.value * 3.6))
      : [];

    const isDark = store.state.theme === 'dark';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)';
    const textColor = isDark ? '#94A3B8' : '#64748B';

    if (this.timeseriesChart) {
      this.timeseriesChart.destroy();
    }

    this.timeseriesChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Temperatur (°C)',
            data: tempData,
            borderColor: '#EF4444',
            backgroundColor: 'transparent',
            borderWidth: 2,
            tension: 0.3,
            yAxisID: 'yTemp',
            pointRadius: 1.5,
          },
          {
            label: 'Wind (km/h)',
            data: windData,
            borderColor: '#0089CF',
            backgroundColor: 'rgba(0, 137, 207, 0.1)',
            borderWidth: 2,
            tension: 0.3,
            fill: true,
            yAxisID: 'yWind',
            pointRadius: 1.5,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: {
            grid: { color: gridColor },
            ticks: { color: textColor, maxTicksLimit: 8 },
          },
          yTemp: {
            type: 'linear',
            position: 'left',
            grid: { color: gridColor },
            ticks: { color: textColor, callback: (v) => `${v}°C` },
          },
          yWind: {
            type: 'linear',
            position: 'right',
            grid: { drawOnChartArea: false },
            ticks: { color: '#0089CF', callback: (v) => `${v} km/h` },
          },
        },
      },
    });
  }

  attachEvents() {
    // Pair Switcher
    this.container.querySelectorAll('.pair-pill-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectedPairId = btn.getAttribute('data-pair-id');
        this.render();
      });
    });

    // Sub Tab Switcher (Stations vs Webcams)
    const btnTabStations = this.container.querySelector('#btn-tab-stations');
    const btnTabWebcams = this.container.querySelector('#btn-tab-webcams');
    if (btnTabStations) {
      btnTabStations.addEventListener('click', () => {
        this.activeTab = 'stations';
        this.render();
      });
    }
    if (btnTabWebcams) {
      btnTabWebcams.addEventListener('click', () => {
        this.activeTab = 'webcams';
        this.render();
      });
    }

    // Search filter
    const searchInput = this.container.querySelector('#weather-filter-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.stationSearch = e.target.value;
        this.render();
      });
    }

    // Provider filter
    this.container.querySelectorAll('.prov-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectedProvider = btn.getAttribute('data-provider');
        this.render();
      });
    });

    // Clicking station card opens Station Detail Modal with Timeseries
    this.container.querySelectorAll('.station-card-item').forEach(card => {
      card.addEventListener('click', async () => {
        const id = card.getAttribute('data-station-id');
        const st = (this.measurementsData?.features || []).find(f => f.id === id);
        if (st) {
          this.modalStation = st;
          this.modalTimeseries = null;
          this.modalLoading = true;
          this.render();

          // Fetch timeseries
          try {
            const ts = await ShvApi.getStationTimeseries(st.id);
            this.modalTimeseries = ts;
          } catch (e) {
            console.error('[WeatherView] Error fetching timeseries:', e);
          } finally {
            this.modalLoading = false;
            this.render();
          }
        }
      });
    });

    // Clicking webcam card opens BottomSheet on map
    this.container.querySelectorAll('.webcam-card-item').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.getAttribute('data-webcam-id');
        const wc = (this.webcamsData?.webcams || []).find(w => w.identifier === id);
        if (wc) {
          store.selectWebcam(wc);
          store.setTab('map');
        }
      });
    });

    // Close Station Modal
    const closeModal = this.container.querySelector('#btn-close-modal');
    const modalBackdrop = this.container.querySelector('#modal-backdrop');
    if (closeModal) {
      closeModal.addEventListener('click', () => {
        this.modalStation = null;
        this.modalTimeseries = null;
        this.render();
      });
    }
    if (modalBackdrop) {
      modalBackdrop.addEventListener('click', (e) => {
        if (e.target === modalBackdrop) {
          this.modalStation = null;
          this.modalTimeseries = null;
          this.render();
        }
      });
    }

    // View on map button
    const btnViewMap = this.container.querySelector('#btn-view-on-map');
    if (btnViewMap && this.modalStation) {
      btnViewMap.addEventListener('click', () => {
        const st = this.modalStation;
        this.modalStation = null;
        this.modalTimeseries = null;
        store.selectStation(st);
        store.setTab('map');
      });
    }
  }
}
