import L from 'leaflet';
import { store } from '../state.js';
import { ShvApi } from '../services/api.js';

export class ForecastView {
  constructor(container) {
    this.container = container;
    
    // Top-level Navigation: 'text' | 'outlooks' | 'emagram' | 'isobaren'
    this.activeSection = 'text';

    // 1. Text Forecast State
    this.textForecastData = null;
    this.activeTextCategory = 'regional'; // 'regional' | 'gleitschirm' | 'segelflug' | 'general'
    this.activeRegion = '0'; // '0': Deutschschweiz & Graubünden, '1': Alpensüdseite & Engadin, '2': Westschweiz & Wallis

    // 2. Outlooks ("Aussichten") State
    this.outlooksData = null;
    this.activeOutlookType = 'RELATIVE_SUNSHINE'; // 'RELATIVE_SUNSHINE' | 'PRECIPITATION_PROBABILITY_WEAK' | 'PRECIPITATION_PROBABILITY_STRONG'
    this.activeOutlookIndex = 0;
    this.isPlayingOutlooks = false;
    this.outlookPlayTimer = null;

    // 3. Emagram & Previtemps Soundings State
    this.stations = [];
    this.selectedStation = null;
    this.emagramForecastData = null;
    this.activeEmagramTimeIndex = 0;
    this.isPlayingEmagram = false;
    this.emagramPlayTimer = null;
    this.searchQuery = '';
    this.emagramMap = null;
    this.stationMarkersLayer = null;

    // Loading & Error states
    this.loading = false;
    this.soundingLoading = false;
    this.error = null;
  }

  async mount() {
    this.loading = true;
    this.error = null;
    this.render();

    try {
      const lang = store.state.lang || 'de';
      
      // Load Text Forecast, Outlooks, and Previtemps stations in parallel
      const [textData, outlooksData, stations] = await Promise.all([
        ShvApi.getTextForecast(lang),
        ShvApi.getOutlooks(),
        ShvApi.getPrevitempsStations(),
      ]);

      this.textForecastData = textData;
      this.outlooksData = outlooksData;
      this.stations = stations || [];

      // Default selected sounding station: Interlaken (matching Android screenshot)
      if (this.stations.length > 0) {
        this.selectedStation = this.stations.find(s => s.name === 'Interlaken')
                            || this.stations.find(s => s.name === 'Engelberg')
                            || this.stations[0];
      }

      // Prefetch genuine ICON-CH1 forecast for default station
      if (this.selectedStation) {
        await this.loadEmagramForecast(this.selectedStation);
      }
    } catch (err) {
      console.error('[ForecastView] Error loading forecast data:', err);
      this.error = 'Flugwetter-Daten konnten nicht vollständig geladen werden.';
    } finally {
      this.loading = false;
      this.render();
      if (this.activeSection === 'emagram') {
        this.initEmagramMap();
      }
    }
  }

  unmount() {
    this.stopOutlookPlayer();
    this.stopEmagramPlayer();
    if (this.emagramMap) {
      this.emagramMap.remove();
      this.emagramMap = null;
    }
  }

  async loadEmagramForecast(station) {
    if (!station) return;
    this.soundingLoading = true;
    this.updateEmagramDetailDOM();

    try {
      const data = await ShvApi.getEmagramForecast(station.name, station.lat, station.lon);
      if (data && !data.error) {
        this.emagramForecastData = data;
        
        // Pick the timestep closest to current time if possible
        if (data.validTimes && data.validTimes.length > 0) {
          const now = Date.now();
          let closestIdx = 0;
          let minDiff = Infinity;
          for (let i = 0; i < data.validTimes.length; i++) {
            const diff = Math.abs(data.validTimes[i] - now);
            if (diff < minDiff) {
              minDiff = diff;
              closestIdx = i;
            }
          }
          this.activeEmagramTimeIndex = closestIdx;
        } else {
          this.activeEmagramTimeIndex = 0;
        }
      }
    } catch (err) {
      console.error('[ForecastView] Error fetching emagram forecast for', station.name, err);
    } finally {
      this.soundingLoading = false;
      this.updateEmagramDetailDOM();
    }
  }

  render() {
    const lang = store.state.lang || 'de';
    const isobarenUrl = ShvApi.getIsobarenSvgUrl(lang);

    this.container.innerHTML = `
      <div class="forecast-view-wrapper">
        <!-- Top Navigation Segmented Bar (4 Core Sections) -->
        <div class="forecast-top-bar">
          <div class="forecast-section-switcher">
            <button data-section="text" class="forecast-tab-btn ${this.activeSection === 'text' ? 'active' : ''}">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
              </svg>
              <span>Textprognosen</span>
            </button>
            <button data-section="outlooks" class="forecast-tab-btn ${this.activeSection === 'outlooks' ? 'active' : ''}">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="5"></circle>
                <line x1="12" y1="1" x2="12" y2="3"></line>
                <line x1="12" y1="21" x2="12" y2="23"></line>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                <line x1="1" y1="12" x2="3" y2="12"></line>
                <line x1="21" y1="12" x2="23" y2="12"></line>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
              </svg>
              <span>Aussichten</span>
            </button>
            <button data-section="emagram" class="forecast-tab-btn ${this.activeSection === 'emagram' ? 'active' : ''}">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 3v18h18"></path>
                <path d="m19 9-5 5-4-4-3 3"></path>
              </svg>
              <span>Emagramm & Previtemps</span>
            </button>
            <button data-section="isobaren" class="forecast-tab-btn ${this.activeSection === 'isobaren' ? 'active' : ''}">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
              </svg>
              <span>Isobarenkarte</span>
            </button>
          </div>
        </div>

        ${this.loading ? `
          <div class="loading-spinner" style="padding: 60px 0;">
            <div class="spinner"></div>
            <span>Wetterdaten werden geladen...</span>
          </div>
        ` : this.error ? `
          <div class="error-notice">${this.error}</div>
        ` : `
          <!-- Section 1: Official Text Forecasts -->
          ${this.activeSection === 'text' ? this.renderTextSection(lang) : ''}

          <!-- Section 2: Days Overview / Outlooks ("Aussichten") -->
          ${this.activeSection === 'outlooks' ? this.renderOutlooksSection(lang) : ''}

          <!-- Section 3: Emagram & Previtemps Map -->
          ${this.activeSection === 'emagram' ? this.renderEmagramSection(lang) : ''}

          <!-- Section 4: Synoptic Isobar Chart -->
          ${this.activeSection === 'isobaren' ? this.renderIsobarenSection(isobarenUrl) : ''}
        `}
      </div>
    `;

    this.attachEvents();

    if (this.activeSection === 'emagram' && !this.loading) {
      setTimeout(() => this.initEmagramMap(), 50);
    }
  }

  // =========================================================================
  // 1. TEXT FORECAST SECTION
  // =========================================================================

  renderTextSection(lang) {
    const allRegionLabels = {
      de: {
        '0': 'Deutschschweiz & Graubünden',
        '1': 'Alpensüdseite & Engadin',
        '2': 'Westschweiz & Wallis',
      },
      fr: {
        '0': 'Suisse alémanique & Grisons',
        '1': 'Sud des Alpes & Engadine',
        '2': 'Suisse romande & Valais',
      },
      it: {
        '0': 'Svizzera tedesca & Grigioni',
        '1': 'Sud delle Alpi & Engadina',
        '2': 'Svizzera romanda & Vallese',
      },
    };
    const regionLabels = allRegionLabels[lang] || allRegionLabels.de;

    const tf = this.textForecastData || {};

    let contentHtml = '';
    let categoryTitle = '';
    let issueTimeStr = '';

    if (this.activeTextCategory === 'regional') {
      categoryTitle = 'Regionalprognose (MeteoSchweiz / SHV)';
      const regionalObj = tf.forecast && tf.forecast[this.activeRegion];
      if (regionalObj) {
        issueTimeStr = regionalObj.issueTime ? new Date(regionalObj.issueTime).toLocaleString('de-CH') : '';
        const days = regionalObj.days || [];
        contentHtml = days.map(day => `
          <div class="text-forecast-day-card">
            <h4 class="forecast-day-heading">${day.title || day.day || 'Tagesabschnitt'}</h4>
            <div class="forecast-day-body">${this.sanitizeHtml(day.forecast || day.text || '')}</div>
          </div>
        `).join('');
      } else {
        contentHtml = '<p class="text-muted">Keine Regionalprognose für diesen Sektor vorhanden.</p>';
      }
    } else if (this.activeTextCategory === 'gleitschirm') {
      categoryTitle = 'Gleitschirmprognose & Thermikbriefing';
      const g = tf.gleitschirmForecast || tf.flugwetterForecast;
      if (g) {
        issueTimeStr = g.issueTime ? new Date(g.issueTime).toLocaleString('de-CH') : '';
        contentHtml = `
          <div class="text-forecast-day-card">
            <div class="forecast-day-body">${this.sanitizeHtml(g.text || g.html || '<p>Keine Daten</p>')}</div>
          </div>
        `;
      } else {
        contentHtml = '<p class="text-muted">Gleitschirmprognose ist für heute noch nicht freigegeben.</p>';
      }
    } else if (this.activeTextCategory === 'segelflug') {
      categoryTitle = 'Segelflug- & Flugwetterprognose';
      const s = tf.segelflugForecast;
      if (s) {
        issueTimeStr = s.issueTime ? new Date(s.issueTime).toLocaleString('de-CH') : '';
        contentHtml = `
          <div class="text-forecast-day-card">
            <div class="forecast-day-body">${this.sanitizeHtml(s.text || s.html || '<p>Keine Daten</p>')}</div>
          </div>
        `;
      } else {
        contentHtml = '<p class="text-muted">Segelflugprognose wird um 08:30 Uhr aktualisiert.</p>';
      }
    } else if (this.activeTextCategory === 'general') {
      categoryTitle = 'Allgemeine Wetterlage (Synoptik)';
      const gen = tf.generalForecast;
      if (gen) {
        issueTimeStr = gen.issueTime ? new Date(gen.issueTime).toLocaleString('de-CH') : '';
        contentHtml = `
          <div class="text-forecast-day-card">
            <div class="forecast-day-body">${this.sanitizeHtml(gen.text || gen.html || '<p>Keine Daten</p>')}</div>
          </div>
        `;
      } else {
        contentHtml = '<p class="text-muted">Synoptische Übersicht derzeit nicht verfügbar.</p>';
      }
    }

    return `
      <div class="forecast-content-card">
        <!-- Sub-Navigation for Forecast Types -->
        <div class="text-category-switcher-row">
          <button data-cat="regional" class="category-pill ${this.activeTextCategory === 'regional' ? 'active' : ''}">
            🏔️ Regional
          </button>
          <button data-cat="gleitschirm" class="category-pill ${this.activeTextCategory === 'gleitschirm' ? 'active' : ''}">
            🪂 Gleitschirm
          </button>
          <button data-cat="segelflug" class="category-pill ${this.activeTextCategory === 'segelflug' ? 'active' : ''}">
            ✈️ Segelflug
          </button>
          <button data-cat="general" class="category-pill ${this.activeTextCategory === 'general' ? 'active' : ''}">
            🌐 Allgemeine Lage
          </button>
        </div>

        <div class="section-header-row" style="margin-top: 14px;">
          <div>
            <span class="badge-tag">MeteoSchweiz & SHV</span>
            <h2 class="section-heading">${categoryTitle}</h2>
            ${issueTimeStr ? `<p class="section-sub">Ausgabe: ${issueTimeStr}</p>` : ''}
          </div>
        </div>

        ${this.activeTextCategory === 'regional' ? `
          <div class="region-pills-row">
            <button data-region="0" class="region-pill ${this.activeRegion === '0' ? 'active' : ''}">${regionLabels['0']}</button>
            <button data-region="1" class="region-pill ${this.activeRegion === '1' ? 'active' : ''}">${regionLabels['1']}</button>
            <button data-region="2" class="region-pill ${this.activeRegion === '2' ? 'active' : ''}">${regionLabels['2']}</button>
          </div>
        ` : ''}

        <div class="forecast-prognosis-container">
          <div class="prognosis-text-body">
            ${contentHtml || '<p>Textprognose wird vorbereitet...</p>'}
          </div>
        </div>
      </div>
    `;
  }

  // =========================================================================
  // 2. OUTLOOKS SECTION ("Aussichten" - Days Overview Animation Maps)
  // =========================================================================

  getOutlookFiles() {
    if (!this.outlooksData || !this.outlooksData.data) return [];
    // Prioritize 6h datasets for highest resolution animations
    const matching = this.outlooksData.data.filter(d => d.type === this.activeOutlookType);
    if (!matching.length) return [];
    const bestSet = matching.find(d => d.files && d.files.length >= 20) || matching[0];
    return bestSet.files || [];
  }

  renderOutlooksSection(lang) {
    const files = this.getOutlookFiles();
    const totalFiles = files.length;
    
    if (this.activeOutlookIndex >= totalFiles) {
      this.activeOutlookIndex = Math.max(0, totalFiles - 1);
    }
    const currentFileObj = files[this.activeOutlookIndex];

    let intervalLabel = 'Lade Zeitspanne...';
    if (currentFileObj) {
      const dStart = new Date(currentFileObj.start);
      const dEnd = new Date(currentFileObj.end);
      const optionsDay = { weekday: 'short', day: '2-digit', month: '2-digit' };
      const optionsTime = { hour: '2-digit', minute: '2-digit' };
      intervalLabel = `${dStart.toLocaleDateString('de-CH', optionsDay)} ${dStart.toLocaleTimeString('de-CH', optionsTime)} – ${dEnd.toLocaleTimeString('de-CH', optionsTime)}`;
    }

    const imageUrl = currentFileObj
      ? `https://static-prod.ubmeteo.io/${currentFileObj.file}`
      : '';

    const legendConfig = {
      RELATIVE_SUNSHINE: {
        title: 'Relative Sonnenscheindauer (6h)',
        gradient: 'linear-gradient(to right, #4A5568 0%, #ECC94B 50%, #FFD700 100%)',
        labels: ['0%', '25%', '50%', '75%', '100%'],
      },
      PRECIPITATION_PROBABILITY_WEAK: {
        title: 'Niederschlagswahrscheinlichkeit leicht (> 0.1 mm / 12h)',
        gradient: 'linear-gradient(to right, rgba(230,245,255,0.2) 0%, #60A5FA 40%, #1D4ED8 80%, #1E3A8A 100%)',
        labels: ['0%', '20%', '40%', '60%', '80%', '100%'],
      },
      PRECIPITATION_PROBABILITY_STRONG: {
        title: 'Niederschlagswahrscheinlichkeit stark (> 1.0 mm / 12h)',
        gradient: 'linear-gradient(to right, rgba(230,245,255,0.2) 0%, #93C5FD 30%, #3B82F6 60%, #1E3A8A 90%, #7C3AED 100%)',
        labels: ['0%', '20%', '40%', '60%', '80%', '100%'],
      },
    }[this.activeOutlookType];

    return `
      <div class="forecast-content-card">
        <div class="section-header-row">
          <div>
            <span class="badge-tag">MeteoSchweiz & Ubique ICON-CH2</span>
            <h2 class="section-heading">Meteo-Aussichten (Outlooks)</h2>
            <p class="section-sub">Flugwetter-Tagesübersicht für die gesamte Schweiz (bis zu 5 Tage im Voraus)</p>
          </div>
        </div>

        <!-- 3-Way Product Toggle -->
        <div class="text-category-switcher-row" style="margin-top: 14px;">
          <button data-type="RELATIVE_SUNSHINE" class="category-pill ${this.activeOutlookType === 'RELATIVE_SUNSHINE' ? 'active' : ''}">
            ☀️ Sonnenschein
          </button>
          <button data-type="PRECIPITATION_PROBABILITY_WEAK" class="category-pill ${this.activeOutlookType === 'PRECIPITATION_PROBABILITY_WEAK' ? 'active' : ''}">
            🌧️ Niederschlag leicht
          </button>
          <button data-type="PRECIPITATION_PROBABILITY_STRONG" class="category-pill ${this.activeOutlookType === 'PRECIPITATION_PROBABILITY_STRONG' ? 'active' : ''}">
            ⛈️ Niederschlag stark
          </button>
        </div>

        <!-- Interactive Map Preview Box -->
        <div class="outlook-player-container">
          <div class="outlook-time-banner">
            <div class="outlook-time-title">
              <span class="calendar-icon">📅</span>
              <strong class="outlook-time-text">${intervalLabel}</strong>
            </div>
            <div class="outlook-step-indicator">
              Intervall ${this.activeOutlookIndex + 1} von ${totalFiles || 1}
            </div>
          </div>

          <div class="outlook-image-wrapper">
            ${imageUrl ? `
              <img id="outlook-map-img" src="${imageUrl}" alt="Aussichten Karte" class="outlook-map-img" loading="eager" />
            ` : `
              <div class="outlook-empty-box">Kartendaten werden geladen...</div>
            `}
          </div>

          <!-- Player Controls Bar -->
          <div class="outlook-controls-bar">
            <button id="outlook-prev-btn" class="player-btn" title="Vorheriges Intervall">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="19 20 9 12 19 4 19 20"></polygon>
                <line x1="5" y1="19" x2="5" y2="5"></line>
              </svg>
            </button>
            <button id="outlook-play-btn" class="player-btn primary ${this.isPlayingOutlooks ? 'playing' : ''}" title="Animation abspielen / pausieren">
              ${this.isPlayingOutlooks ? `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16"></rect>
                  <rect x="14" y="4" width="4" height="16"></rect>
                </svg>
              ` : `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
              `}
            </button>
            <button id="outlook-next-btn" class="player-btn" title="Nächstes Intervall">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="5 4 15 12 5 20 5 4"></polygon>
                <line x1="19" y1="5" x2="19" y2="19"></line>
              </svg>
            </button>

            <!-- Timeline range slider -->
            <input 
              type="range" 
              id="outlook-slider" 
              class="outlook-timeline-slider" 
              min="0" 
              max="${Math.max(0, totalFiles - 1)}" 
              value="${this.activeOutlookIndex}" 
              step="1" 
            />
          </div>

          <!-- Color Legend Bar -->
          <div class="outlook-legend-container">
            <span class="legend-title">${legendConfig.title}</span>
            <div class="legend-color-bar" style="background: ${legendConfig.gradient};"></div>
            <div class="legend-ticks">
              ${legendConfig.labels.map(l => `<span>${l}</span>`).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  updateOutlookDOM() {
    const files = this.getOutlookFiles();
    const totalFiles = files.length;
    if (this.activeOutlookIndex >= totalFiles) {
      this.activeOutlookIndex = Math.max(0, totalFiles - 1);
    }
    const currentFileObj = files[this.activeOutlookIndex];
    if (!currentFileObj) return;

    // 1. Update image in-place
    const imgEl = this.container.querySelector('#outlook-map-img');
    if (imgEl) {
      imgEl.src = `https://static-prod.ubmeteo.io/${currentFileObj.file}`;
    }

    // 2. Update time label
    const timeEl = this.container.querySelector('.outlook-time-text');
    if (timeEl) {
      const dStart = new Date(currentFileObj.start);
      const dEnd = new Date(currentFileObj.end);
      const optionsDay = { weekday: 'short', day: '2-digit', month: '2-digit' };
      const optionsTime = { hour: '2-digit', minute: '2-digit' };
      timeEl.textContent = `${dStart.toLocaleDateString('de-CH', optionsDay)} ${dStart.toLocaleTimeString('de-CH', optionsTime)} – ${dEnd.toLocaleTimeString('de-CH', optionsTime)}`;
    }

    // 3. Update step indicator
    const stepEl = this.container.querySelector('.outlook-step-indicator');
    if (stepEl) {
      stepEl.textContent = `Intervall ${this.activeOutlookIndex + 1} von ${totalFiles}`;
    }

    // 4. Update slider value
    const slider = this.container.querySelector('#outlook-slider');
    if (slider) {
      slider.value = this.activeOutlookIndex;
    }

    // 5. Update play button icon
    const playBtn = this.container.querySelector('#outlook-play-btn');
    if (playBtn) {
      if (this.isPlayingOutlooks) {
        playBtn.classList.add('playing');
        playBtn.innerHTML = `
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="4" width="4" height="16"></rect>
            <rect x="14" y="4" width="4" height="16"></rect>
          </svg>
        `;
      } else {
        playBtn.classList.remove('playing');
        playBtn.innerHTML = `
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
        `;
      }
    }

    // 6. Prefetch next 2 frames
    const nextIdx = (this.activeOutlookIndex + 1) % totalFiles;
    if (files[nextIdx]) {
      new Image().src = `https://static-prod.ubmeteo.io/${files[nextIdx].file}`;
    }
  }

  stepOutlook(delta) {
    const files = this.getOutlookFiles();
    const totalFiles = files.length || 1;
    this.activeOutlookIndex = (this.activeOutlookIndex + delta + totalFiles) % totalFiles;
    this.updateOutlookDOM();
  }

  toggleOutlookPlay() {
    if (this.isPlayingOutlooks) {
      this.stopOutlookPlayer();
    } else {
      this.startOutlookPlayer();
    }
    this.updateOutlookDOM();
  }

  startOutlookPlayer() {
    this.isPlayingOutlooks = true;
    this.outlookPlayTimer = setInterval(() => {
      this.stepOutlook(1);
    }, 1200);
  }

  stopOutlookPlayer() {
    this.isPlayingOutlooks = false;
    if (this.outlookPlayTimer) {
      clearInterval(this.outlookPlayTimer);
      this.outlookPlayTimer = null;
    }
  }

  // =========================================================================
  // 3. EMAGRAM & PREVITEMPS SECTION (Android-style Sounding Diagram & Timeline)
  // =========================================================================

  renderEmagramSection(lang) {
    const popularStations = [
      'Interlaken', 'Engelberg', 'Payerne', 'Fiesch', 'Zermatt', 'Scuol', 'Davos', 'Chur', 'Zürich', 'Sion'
    ];

    return `
      <div class="forecast-content-card">
        <div class="section-header-row">
          <div>
            <span class="badge-tag">Previtemps & Soundings (MeteoSchweiz ICON-CH1)</span>
            <h2 class="section-heading">Thermodynamische Emagramme & Previtemps</h2>
            <p class="section-sub">107 alpine Radiosondierungs- & Thermikstationen mit hochauflösenden Stunden-Soundings</p>
          </div>
        </div>

        <!-- Sounding Location Map and Search Bar -->
        <div class="emagram-map-container-box">
          <div class="emagram-search-bar-row">
            <div class="emagram-search-field">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input 
                type="text" 
                id="emagram-station-search" 
                placeholder="Station suchen (z.B. Interlaken, Engelberg, Fiesch, Payerne)..." 
                value="${this.searchQuery}"
              />
            </div>
          </div>

          <!-- Quick Select Station Pills -->
          <div class="popular-stations-pills-row">
            <span class="popular-lbl">Beliebt:</span>
            ${popularStations.map(name => {
              const st = this.stations.find(s => s.name === name);
              const isActive = this.selectedStation && this.selectedStation.name === name;
              return st ? `
                <button data-station="${st.name}" class="popular-station-pill ${isActive ? 'active' : ''}">
                  ${st.name} (${st.elevation}m)
                </button>
              ` : '';
            }).join('')}
          </div>

          <!-- Leaflet Sounding Stations Map Container (Swisstopo Pixelkarte, Keyless) -->
          <div id="emagram-map" class="emagram-leaflet-map"></div>
          <div class="map-hint-text">💡 Klicke auf eine Station auf der Schweizer Karte, um das vertikale Sounding zu öffnen.</div>
        </div>

        <!-- Android Native Emagram Frame -->
        <div id="emagram-detail-container" class="emagram-detail-box" style="border:none; padding:0; margin-top:16px;">
          ${this.renderEmagramAndroidCard()}
        </div>
      </div>
    `;
  }

  renderEmagramAndroidCard() {
    if (!this.selectedStation) {
      return `<div class="info-notice">Bitte wähle eine Station auf der Karte aus.</div>`;
    }

    if (this.soundingLoading && !this.emagramForecastData) {
      return `
        <div class="loading-spinner" style="padding: 40px 0;">
          <div class="spinner"></div>
          <span>Emagramm für ${this.selectedStation.name} wird geladen...</span>
        </div>
      `;
    }

    const data = this.emagramForecastData;
    const timeSteps = data?.timeSteps || [];
    const totalSteps = timeSteps.length;
    
    if (this.activeEmagramTimeIndex >= totalSteps) {
      this.activeEmagramTimeIndex = Math.max(0, totalSteps - 1);
    }
    const currentStep = timeSteps[this.activeEmagramTimeIndex];

    // Format header timestamp matching screenshot (e.g. "Thu, 22. Oct, 19:00")
    let headerTimeStr = 'Lade Zeitpunkt...';
    let dateLabel = 'Heute';
    if (currentStep) {
      const d = new Date(currentStep.timestamp);
      const optionsHeader = { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' };
      headerTimeStr = d.toLocaleDateString('en-GB', optionsHeader);
      
      const optionsDate = { weekday: 'short', day: '2-digit', month: '2-digit' };
      dateLabel = d.toLocaleDateString('de-CH', optionsDate);
    }

    const levels = currentStep?.levels || [];

    // SVG Drawing Setup
    // Width 520, Height 640
    const svgW = 520;
    const svgH = 620;
    const padL = 46;
    const padR = 18;
    const padT = 32;
    const padB = 60;

    const plotW = 340;
    const windW = 100;
    const plotH = svgH - padT - padB;

    // Pressure coordinates (600 hPa to 1000 hPa)
    const pMin = 600;
    const pMax = 1000;
    const pToY = (p) => {
      const clampedP = Math.max(pMin, Math.min(pMax, p));
      return (padT + plotH) - (Math.log(pMax / clampedP) / Math.log(pMax / pMin)) * plotH;
    };

    // Temperature coordinates (-15°C to +35°C with 40° skew)
    const tMin = -15;
    const tMax = 35;
    const skewFactor = 0.32;
    const tToX = (t, y) => {
      const baseX = padL + ((t - tMin) / (tMax - tMin)) * plotW;
      const skewX = ((padT + plotH) - y) * skewFactor;
      return baseX + skewX;
    };

    // Pressure grid levels
    const pressureTicks = [1000, 900, 800, 700, 600];
    const isobarsSvg = pressureTicks.map(p => {
      const y = pToY(p);
      return `
        <line x1="${padL}" y1="${y}" x2="${padL + plotW}" y2="${y}" stroke="var(--border-color, #E2E8F0)" stroke-width="1" stroke-dasharray="3,3" />
        <text x="${padL - 6}" y="${y + 4}" fill="#94A3B8" font-size="11" font-weight="600" text-anchor="end">${p}</text>
      `;
    }).join('');

    // Skewed isotherms (-10, 0, 10, 20, 30 °C)
    const tempTicks = [-10, 0, 10, 20, 30];
    const isothermsSvg = tempTicks.map(t => {
      const y1 = padT + plotH;
      const x1 = tToX(t, y1);
      const y2 = padT;
      const x2 = tToX(t, y2);
      return `
        <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--border-color, #E2E8F0)" stroke-width="1" opacity="0.75" />
        <text x="${x1}" y="${y1 + 18}" fill="#94A3B8" font-size="11" font-weight="600" text-anchor="middle">${t}</text>
      `;
    }).join('');

    // Altitude lines & labels on right column (1000m, 2000m, 3000m, 4000m)
    const altGridLines = [1000, 2000, 3000, 4000].map(alt => {
      // Find approximate Y coordinate from levels matching altitude
      let targetY = padT + plotH - (alt / 5000) * plotH;
      const closestLvl = levels.find(l => Math.abs(l.heightM - alt) < 150);
      if (closestLvl) {
        targetY = pToY(closestLvl.pressHpa);
      }
      return `
        <line x1="${padL + plotW}" y1="${targetY}" x2="${svgW - padR}" y2="${targetY}" stroke="var(--border-color, #E2E8F0)" stroke-width="1" stroke-dasharray="3,3" />
        <text x="${padL + plotW + 6}" y="${targetY - 4}" fill="#94A3B8" font-size="11" font-weight="600">${alt} m</text>
      `;
    }).join('');

    // Sounding curves: Temperature colored by lapse rate & Dew Point dashed line
    let tempSegmentsSvg = '';
    let dewPathPoints = [];
    let windPoints = [];
    let windBarbsSvg = '';

    for (let i = 0; i < levels.length; i++) {
      const lvl = levels[i];
      const y = pToY(lvl.pressHpa);
      const xT = tToX(lvl.tempC, y);
      const xTd = tToX(lvl.dewC, y);

      dewPathPoints.push(`${xTd.toFixed(1)},${y.toFixed(1)}`);

      // Temperature curve segments
      if (i > 0) {
        const prevLvl = levels[i - 1];
        const prevY = pToY(prevLvl.pressHpa);
        const prevXT = tToX(prevLvl.tempC, prevY);

        // Lapse rate color coding matching Android screenshot scale:
        // Yellow (>= 0.0) | Light Green (-0.3 to 0.0) | Green (-0.6 to -0.3) | Cyan/Blue (-0.8 to -0.6) | Red (-1.0 to -0.8) | Purple (< -1.0)
        let strokeColor = '#22C55E';
        const gamma = lvl.lapseRate;
        if (gamma >= 0.0) {
          strokeColor = '#EAB308'; // Inversion (Yellow)
        } else if (gamma >= -0.3) {
          strokeColor = '#84CC16'; // Weak lapse (Light green)
        } else if (gamma >= -0.6) {
          strokeColor = '#22C55E'; // Normal lapse / good thermals (Green)
        } else if (gamma >= -0.8) {
          strokeColor = '#0EA5E9'; // Moderate instability (Blue)
        } else if (gamma >= -1.0) {
          strokeColor = '#EF4444'; // Strong thermals (Red)
        } else {
          strokeColor = '#A855F7'; // Superadiabatic (Purple)
        }

        tempSegmentsSvg += `
          <line 
            x1="${prevXT.toFixed(1)}" y1="${prevY.toFixed(1)}" 
            x2="${xT.toFixed(1)}" y2="${y.toFixed(1)}" 
            stroke="${strokeColor}" 
            stroke-width="3.6" 
            stroke-linecap="round" 
          />
        `;
      }

      // Wind curve points: speed range 0 to 45 km/h
      const windX = (padL + plotW + 20) + Math.min(1, Math.max(0, lvl.speedKmH / 45)) * 75;
      windPoints.push(`${windX.toFixed(1)},${y.toFixed(1)}`);

      // Draw wind barbs every ~3rd level or ~400m
      if (i % 3 === 0 || i === levels.length - 1) {
        const barbX = padL + plotW + 12;
        const barbY = y;
        const speed = lvl.speedKmH;
        const dir = lvl.dirDeg;
        
        // Aviation wind barb line with arrow head
        const len = 16;
        const rad = (dir - 90) * (Math.PI / 180);
        const bx2 = barbX + Math.cos(rad) * len;
        const by2 = barbY + Math.sin(rad) * len;

        windBarbsSvg += `
          <g transform="translate(${barbX}, ${barbY})" title="${speed} km/h aus ${dir}°">
            <circle cx="0" cy="0" r="2.5" fill="#0284C7" />
            <line x1="0" y1="0" x2="${(Math.cos(rad) * len).toFixed(1)}" y2="${(Math.sin(rad) * len).toFixed(1)}" stroke="#0284C7" stroke-width="1.8" />
          </g>
        `;
      }
    }

    const dewPolyline = dewPathPoints.join(' ');
    const windPolyline = windPoints.join(' ');

    return `
      <div class="emagram-android-frame">
        <!-- Top App Navigation Bar -->
        <div class="emagram-top-nav">
          <button id="btn-emagram-back" class="emagram-nav-btn" title="Zurück zur Karte">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
          </button>

          <div class="emagram-title-center">
            <h3 id="emagram-station-title">${this.selectedStation.name}</h3>
            <span>Emagram forecast</span>
          </div>

          <button id="btn-emagram-info" class="emagram-nav-btn" title="Emagramm-Erklärung">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
          </button>
        </div>

        <!-- Meta Subheader Row -->
        <div class="emagram-header-meta">
          <div>
            <div id="emagram-header-time" class="emagram-timestamp-badge">${headerTimeStr}</div>
            <div class="emagram-model-badge">ICON-CH1 · MeteoSchweiz</div>
          </div>
          <button class="emagram-expand-btn" title="Vollbild">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <polyline points="15 3 21 3 21 9"></polyline>
              <polyline points="9 21 3 21 3 15"></polyline>
              <line x1="21" y1="3" x2="14" y2="10"></line>
              <line x1="3" y1="21" x2="10" y2="14"></line>
            </svg>
          </button>
        </div>

        <!-- SVG Emagram Canvas -->
        <div class="emagram-chart-container">
          <svg viewBox="0 0 ${svgW} ${svgH}" class="emagram-svg">
            <!-- Background Isobars & Grid -->
            <g class="grid-layer">
              ${isobarsSvg}
              ${isothermsSvg}
              ${altGridLines}
            </g>

            <!-- Column Divider between Emagram and Wind -->
            <line x1="${padL + plotW}" y1="${padT}" x2="${padL + plotW}" y2="${padT + plotH}" stroke="var(--border-color, #CBD5E1)" stroke-width="1.5" />

            <!-- Dewpoint Curve (Dashed Blue) -->
            ${dewPolyline ? `
              <polyline 
                points="${dewPolyline}" 
                fill="none" 
                stroke="#0284C7" 
                stroke-width="2.2" 
                stroke-dasharray="4,4" 
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            ` : ''}

            <!-- Temperature Curve (Lapse-Rate Colored Segments) -->
            <g class="temp-curve-layer">
              ${tempSegmentsSvg}
            </g>

            <!-- Wind Speed Profile Curve (Solid Blue) -->
            ${windPolyline ? `
              <polyline 
                points="${windPolyline}" 
                fill="none" 
                stroke="#0284C7" 
                stroke-width="2.2" 
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            ` : ''}

            <!-- Wind Barbs -->
            <g class="wind-barbs-layer">
              ${windBarbsSvg}
            </g>

            <!-- Axis Units & Labels -->
            <text x="${padL - 10}" y="${padT + plotH + 20}" fill="#64748B" font-size="12" font-weight="700">hPa</text>
            <rect x="${padL + 70}" y="${padT + plotH + 8}" width="140" height="22" rx="11" fill="var(--bg-secondary, #F1F5F9)" />
            <text x="${padL + 140}" y="${padT + plotH + 23}" fill="#64748B" font-size="11" font-weight="700" text-anchor="middle">Temperature (°C)</text>

            <rect x="${padL + plotW + 10}" y="${padT + plotH + 8}" width="105" height="22" rx="11" fill="var(--bg-secondary, #F1F5F9)" />
            <text x="${padL + plotW + 62}" y="${padT + plotH + 23}" fill="#64748B" font-size="11" font-weight="700" text-anchor="middle">Wind (km/h)</text>
            
            <text x="${padL + plotW + 35}" y="${padT + plotH + 42}" fill="#94A3B8" font-size="10" font-weight="600" text-anchor="middle">15</text>
            <text x="${padL + plotW + 62}" y="${padT + plotH + 42}" fill="#94A3B8" font-size="10" font-weight="600" text-anchor="middle">30</text>
            <text x="${padL + plotW + 90}" y="${padT + plotH + 42}" fill="#94A3B8" font-size="10" font-weight="600" text-anchor="middle">45</text>
          </svg>
        </div>

        <!-- Lapse Rate Scale Legend (Matching Android Screenshot) -->
        <div class="emagram-lapse-legend">
          <div class="emagram-lapse-bar"></div>
          <div class="emagram-lapse-ticks">
            <span>-1.0</span>
            <span>-0.8</span>
            <span>-0.6</span>
            <span>-0.3</span>
            <span>0.0</span>
          </div>
          <div class="emagram-lapse-unit">°C / 100 m</div>
        </div>

        <!-- Bottom Timeline Slider Panel -->
        <div class="emagram-timeline-panel">
          <div class="emagram-timeline-controls">
            <button id="emagram-prev-btn" class="emagram-stepper-btn" title="Vorherige Stunde">
              &lt;&lt;
            </button>
            <button id="emagram-play-btn" class="player-btn primary ${this.isPlayingEmagram ? 'playing' : ''}" style="width:34px; height:34px;" title="Abspielen">
              ${this.isPlayingEmagram ? `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16"></rect>
                  <rect x="14" y="4" width="4" height="16"></rect>
                </svg>
              ` : `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
              `}
            </button>
            <button id="emagram-next-btn" class="emagram-stepper-btn" title="Nächste Stunde">
              &gt;&gt;
            </button>
            
            <input 
              type="range" 
              id="emagram-time-slider" 
              class="emagram-time-slider" 
              min="0" 
              max="${Math.max(0, totalSteps - 1)}" 
              value="${this.activeEmagramTimeIndex}" 
              step="1" 
            />
          </div>

          <div class="emagram-timeline-bottom-row">
            <span class="emagram-date-label">${dateLabel}</span>
            <span style="font-size:0.8rem; font-weight:700; color:var(--shv-blue);">
              Prognoseschritt ${this.activeEmagramTimeIndex + 1} / ${totalSteps}
            </span>
          </div>
        </div>
      </div>
    `;
  }

  updateEmagramDetailDOM() {
    const container = this.container.querySelector('#emagram-detail-container');
    if (!container) return;
    container.innerHTML = this.renderEmagramAndroidCard();
    this.attachEmagramCardEvents();
  }

  attachEmagramCardEvents() {
    const slider = this.container.querySelector('#emagram-time-slider');
    const prevBtn = this.container.querySelector('#emagram-prev-btn');
    const nextBtn = this.container.querySelector('#emagram-next-btn');
    const playBtn = this.container.querySelector('#emagram-play-btn');
    const backBtn = this.container.querySelector('#btn-emagram-back');

    if (slider) {
      slider.addEventListener('input', (e) => {
        this.activeEmagramTimeIndex = parseInt(e.target.value, 10);
        this.updateEmagramDetailDOM();
      });
    }

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        this.stepEmagramTime(-1);
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        this.stepEmagramTime(1);
      });
    }

    if (playBtn) {
      playBtn.addEventListener('click', () => {
        this.toggleEmagramPlay();
      });
    }

    if (backBtn) {
      backBtn.addEventListener('click', () => {
        const mapEl = document.getElementById('emagram-map');
        if (mapEl) {
          mapEl.scrollIntoView({ behavior: 'smooth' });
        }
      });
    }
  }

  stepEmagramTime(delta) {
    const totalSteps = (this.emagramForecastData?.timeSteps || []).length || 1;
    this.activeEmagramTimeIndex = (this.activeEmagramTimeIndex + delta + totalSteps) % totalSteps;
    this.updateEmagramDetailDOM();
  }

  toggleEmagramPlay() {
    if (this.isPlayingEmagram) {
      this.stopEmagramPlayer();
    } else {
      this.startEmagramPlayer();
    }
    this.updateEmagramDetailDOM();
  }

  startEmagramPlayer() {
    this.isPlayingEmagram = true;
    this.emagramPlayTimer = setInterval(() => {
      this.stepEmagramTime(1);
    }, 800);
  }

  stopEmagramPlayer() {
    this.isPlayingEmagram = false;
    if (this.emagramPlayTimer) {
      clearInterval(this.emagramPlayTimer);
      this.emagramPlayTimer = null;
    }
  }

  // =========================================================================
  // 4. ISOBAREN SECTION
  // =========================================================================

  renderIsobarenSection(isobarenUrl) {
    return `
      <div class="forecast-content-card">
        <div class="section-header-row">
          <div>
            <span class="badge-tag">MeteoSchweiz / DWD</span>
            <h2 class="section-heading">Bodendruck & Frontensynoptik (Isobaren)</h2>
            <p class="section-sub">Offizielle mitteleuropäische Frontenanalyse mit Hoch- und Tiefdruckzentren</p>
          </div>
        </div>

        <div class="isobaren-map-container">
          <img src="${isobarenUrl}" alt="Isobarenkarte Schweiz & Europa" class="isobaren-img" loading="eager" />
        </div>
      </div>
    `;
  }

  // =========================================================================
  // LEAFLET MAP LOGIC (Free & Keyless Swisstopo Pixelkarte)
  // =========================================================================

  initEmagramMap() {
    const mapEl = document.getElementById('emagram-map');
    if (!mapEl) return;

    if (this.emagramMap) {
      this.emagramMap.remove();
      this.emagramMap = null;
    }

    // Centered on Switzerland
    this.emagramMap = L.map(mapEl, {
      center: [46.8182, 8.2275],
      zoom: 8,
      zoomControl: true,
      attributionControl: false,
    });

    // Basemap: Swisstopo Pixelkarte (Keyless, High Resolution) with OSM fallback
    L.tileLayer('https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg', {
      maxZoom: 18,
      attribution: '© swisstopo',
    }).addTo(this.emagramMap);

    this.stationMarkersLayer = L.layerGroup().addTo(this.emagramMap);
    this.renderEmagramMarkers();

    setTimeout(() => {
      if (this.emagramMap) this.emagramMap.invalidateSize();
    }, 200);
  }

  renderEmagramMarkers() {
    if (!this.stationMarkersLayer) return;
    this.stationMarkersLayer.clearLayers();

    const query = this.searchQuery;
    const filtered = this.stations.filter(st => {
      if (!query) return true;
      return st.name.toLowerCase().includes(query);
    });

    filtered.forEach(st => {
      const isSelected = this.selectedStation && this.selectedStation.name === st.name;
      const markerHtml = `
        <div class="emagram-map-pin ${isSelected ? 'selected' : ''}">
          <span class="pin-symbol">📈</span>
          <span class="pin-label">${st.name}</span>
        </div>
      `;

      const icon = L.divIcon({
        className: 'custom-emagram-div-icon',
        html: markerHtml,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const marker = L.marker([st.lat, st.lon], { icon });
      marker.on('click', () => {
        this.selectStation(st);
      });

      this.stationMarkersLayer.addLayer(marker);
    });
  }

  filterEmagramMarkers() {
    this.renderEmagramMarkers();
    if (this.searchQuery && this.emagramMap) {
      const firstMatch = this.stations.find(s => s.name.toLowerCase().includes(this.searchQuery));
      if (firstMatch) {
        this.emagramMap.setView([firstMatch.lat, firstMatch.lon], 9, { animate: true });
      }
    }
  }

  selectStation(st) {
    this.selectedStation = st;
    this.loadEmagramForecast(st);
    this.renderEmagramMarkers();

    if (this.emagramMap) {
      this.emagramMap.setView([st.lat, st.lon], 9, { animate: true });
    }

    // Update active state in pills
    this.container.querySelectorAll('.popular-station-pill').forEach(btn => {
      if (btn.getAttribute('data-station') === st.name) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Scroll smoothly to detail frame
    const detailEl = document.getElementById('emagram-detail-container');
    if (detailEl) {
      detailEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  // =========================================================================
  // EVENT ATTACHMENT
  // =========================================================================

  attachEvents() {
    // 1. Top Section Switcher Tabs
    this.container.querySelectorAll('.forecast-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const section = btn.getAttribute('data-section');
        if (section !== this.activeSection) {
          this.activeSection = section;
          this.render();
        }
      });
    });

    // 2. Text Category Switcher
    this.container.querySelectorAll('.text-category-switcher-row .category-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = btn.getAttribute('data-cat');
        const outlookType = btn.getAttribute('data-type');
        if (cat) {
          this.activeTextCategory = cat;
          this.render();
        } else if (outlookType) {
          this.activeOutlookType = outlookType;
          this.activeOutlookIndex = 0;
          this.render();
        }
      });
    });

    // 3. Regional Sub-Pills
    this.container.querySelectorAll('.region-pills-row .region-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        this.activeRegion = btn.getAttribute('data-region');
        this.render();
      });
    });

    // 4. Outlooks Player Events
    if (this.activeSection === 'outlooks') {
      const slider = this.container.querySelector('#outlook-slider');
      const prevBtn = this.container.querySelector('#outlook-prev-btn');
      const nextBtn = this.container.querySelector('#outlook-next-btn');
      const playBtn = this.container.querySelector('#outlook-play-btn');

      if (slider) {
        slider.addEventListener('input', (e) => {
          this.activeOutlookIndex = parseInt(e.target.value, 10);
          this.updateOutlookDOM();
        });
      }

      if (prevBtn) {
        prevBtn.addEventListener('click', () => {
          this.stepOutlook(-1);
        });
      }

      if (nextBtn) {
        nextBtn.addEventListener('click', () => {
          this.stepOutlook(1);
        });
      }

      if (playBtn) {
        playBtn.addEventListener('click', () => {
          this.toggleOutlookPlay();
        });
      }
    }

    // 5. Emagram Search & Quick Station Selection
    if (this.activeSection === 'emagram') {
      const searchInput = this.container.querySelector('#emagram-station-search');
      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          this.searchQuery = e.target.value.toLowerCase().trim();
          this.filterEmagramMarkers();
        });
      }

      this.container.querySelectorAll('.popular-station-pill').forEach(btn => {
        btn.addEventListener('click', () => {
          const stName = btn.getAttribute('data-station');
          const st = this.stations.find(s => s.name === stName);
          if (st) {
            this.selectStation(st);
          }
        });
      });

      this.attachEmagramCardEvents();
    }
  }

  sanitizeHtml(rawHtml) {
    if (!rawHtml) return '';
    const bodyMatch = rawHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    return bodyMatch ? bodyMatch[1] : rawHtml;
  }
}
