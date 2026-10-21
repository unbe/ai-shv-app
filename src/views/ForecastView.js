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
    this.soundingData = null;
    this.simulatedSurfaceTemp = null;
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
      
      // Load Text Forecast and Outlooks in parallel
      const [textData, outlooksData, stations] = await Promise.all([
        ShvApi.getTextForecast(lang),
        ShvApi.getOutlooks(),
        ShvApi.getPrevitempsStations(),
      ]);

      this.textForecastData = textData;
      this.outlooksData = outlooksData;
      this.stations = stations || [];

      // Default selected sounding station: Engelberg or Payerne
      if (this.stations.length > 0) {
        this.selectedStation = this.stations.find(s => s.name === 'Engelberg') || this.stations[0];
      }

      // If stations available, prefetch sounding for default station
      if (this.selectedStation) {
        this.loadSounding(this.selectedStation);
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
    if (this.emagramMap) {
      this.emagramMap.remove();
      this.emagramMap = null;
    }
  }

  async loadSounding(station, surfaceTemp = null) {
    if (!station) return;
    this.soundingLoading = true;
    this.updateSoundingCard();

    try {
      const data = await ShvApi.getPrevitempsSounding(station.name, surfaceTemp, null);
      if (data && !data.error) {
        this.soundingData = data;
        if (surfaceTemp !== null) {
          this.simulatedSurfaceTemp = surfaceTemp;
        } else if (data.surface) {
          this.simulatedSurfaceTemp = data.surface.temp;
        }
      }
    } catch (err) {
      console.error('[ForecastView] Error fetching sounding for', station.name, err);
    } finally {
      this.soundingLoading = false;
      this.updateSoundingCard();
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
  // 1. TEXT FORECAST SECTION (Regional, Gleitschirm, Segelflug, Allgemein)
  // =========================================================================

  renderTextSection(lang) {
    const regionLabels = {
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
    }[lang] || {
      '0': 'Deutschschweiz & Graubünden',
      '1': 'Alpensüdseite & Engadin',
      '2': 'Westschweiz & Wallis',
    };

    let activeIssueTime = null;
    let contentHtml = '';
    let categoryBadge = 'MeteoSchweiz & SHV';
    let categoryTitle = 'Alpines Flugwetter';

    if (this.activeTextCategory === 'regional') {
      categoryBadge = 'Regionalprognose';
      categoryTitle = 'Regionale Flugwetter-Textprognose';
      const regObj = this.textForecastData?.forecast;
      activeIssueTime = regObj?.issueTime;
      if (regObj?.text && regObj.text[this.activeRegion]) {
        contentHtml = this.sanitizeHtml(regObj.text[this.activeRegion]);
      }
    } else if (this.activeTextCategory === 'gleitschirm') {
      categoryBadge = 'Hängegleiter & Paragliding';
      categoryTitle = 'Offizielle Gleitschirmprognose';
      const gleitObj = this.textForecastData?.gleitschirmForecast;
      activeIssueTime = gleitObj?.issueTime;
      contentHtml = gleitObj?.text ? this.sanitizeHtml(gleitObj.text) : '<p>Keine Gleitschirmprognose verfügbar.</p>';
    } else if (this.activeTextCategory === 'segelflug') {
      categoryBadge = 'Segelflug & Thermik';
      categoryTitle = 'Offizielle Segelflugprognose';
      const segelObj = this.textForecastData?.segelflugForecast;
      activeIssueTime = segelObj?.issueTime;
      contentHtml = segelObj?.text ? this.sanitizeHtml(segelObj.text) : '<p>Keine Segelflugprognose verfügbar.</p>';
    } else if (this.activeTextCategory === 'general') {
      categoryBadge = 'Synoptik Schweiz';
      categoryTitle = 'Allgemeine Wetterlage';
      const genObj = this.textForecastData?.generalForecast;
      activeIssueTime = genObj?.issueTime;
      contentHtml = genObj?.text ? this.sanitizeHtml(genObj.text) : '<p>Keine allgemeine Lage verfügbar.</p>';
    }

    const issueTimeStr = activeIssueTime
      ? new Date(activeIssueTime).toLocaleString(lang === 'de' ? 'de-CH' : 'fr-CH', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : null;

    return `
      <div class="forecast-content-card">
        <!-- Text Category Switcher Pills -->
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
            <span class="badge-tag">${categoryBadge}</span>
            <h2 class="section-heading">${categoryTitle}</h2>
            ${issueTimeStr ? `<p class="section-sub">Ausgabe: ${issueTimeStr}</p>` : ''}
          </div>
        </div>

        <!-- Sub-Pills for Regions (only shown when category === 'regional') -->
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

  renderOutlooksSection(lang) {
    if (!this.outlooksData || !this.outlooksData.data) {
      return `
        <div class="forecast-content-card">
          <div class="error-notice">Keine Aussichtsdaten verfügbar.</div>
        </div>
      `;
    }

    const currentDataSet = this.outlooksData.data.find(d => d.type === this.activeOutlookType);
    const files = (currentDataSet && currentDataSet.files) || [];
    const totalFiles = files.length;
    
    // Clamp active index
    if (this.activeOutlookIndex >= totalFiles) {
      this.activeOutlookIndex = Math.max(0, totalFiles - 1);
    }
    const currentFileObj = files[this.activeOutlookIndex];

    // Format current interval date/time
    let intervalLabel = 'Keine Zeitspanne';
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

    // Legend configuration based on active type
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
              Intervall ${this.activeOutlookIndex + 1} von ${totalFiles}
            </div>
          </div>

          <div class="outlook-image-wrapper">
            ${imageUrl ? `
              <img src="${imageUrl}" alt="Aussichten Karte" class="outlook-map-img" loading="eager" />
            ` : `
              <div class="outlook-empty-box">Keine Kartendaten für diese Auswahl</div>
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

  // =========================================================================
  // 3. EMAGRAM & PREVITEMPS SECTION (Sounding Map + Skew-T Diagram + Metrics)
  // =========================================================================

  renderEmagramSection(lang) {
    const popularStations = [
      'Payerne', 'Engelberg', 'Interlaken', 'Fiesch', 'Zermatt', 'Scuol', 'Davos', 'Chur', 'Zürich', 'Sion'
    ];

    return `
      <div class="forecast-content-card">
        <div class="section-header-row">
          <div>
            <span class="badge-tag">Previtemps & Soundings</span>
            <h2 class="section-heading">Thermodynamische Emagramme & Previtemps</h2>
            <p class="section-sub">107 alpine Radiosondierungs- & Thermikstationen in der Schweiz und Alpenregion</p>
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
                placeholder="Station suchen (z.B. Engelberg, Fiesch, Payerne, Interlaken)..." 
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

          <!-- Leaflet Sounding Stations Map Container -->
          <div id="emagram-map" class="emagram-leaflet-map"></div>
          <div class="map-hint-text">💡 Klicke auf eine Station auf der Karte, um das vertikale Sounding und die Thermikwerte anzuzeigen.</div>
        </div>

        <!-- Selected Station Sounding Card -->
        <div id="emagram-detail-container" class="emagram-detail-box">
          ${this.renderSoundingDetailContent()}
        </div>
      </div>
    `;
  }

  renderSoundingDetailContent() {
    if (!this.selectedStation) {
      return `<div class="info-notice">Bitte wähle eine Station auf der Karte aus.</div>`;
    }

    if (this.soundingLoading && !this.soundingData) {
      return `
        <div class="loading-spinner" style="padding: 40px 0;">
          <div class="spinner"></div>
          <span>Emagramm für ${this.selectedStation.name} wird berechnet...</span>
        </div>
      `;
    }

    const d = this.soundingData;
    const st = this.selectedStation;
    const surfaceT = this.simulatedSurfaceTemp !== null ? this.simulatedSurfaceTemp : (d?.surface?.temp || 15);
    const lclAlt = d?.cloud_base_lcl?.alt_asl || (st.elevation + 900);
    const lclAgl = d?.cloud_base_lcl?.height_agl || 900;
    const trigT = d?.trigger_temperature_c || (surfaceT + 2.0);
    const thermalCeil = d?.thermal_ceiling_asl || lclAlt;
    const climbRate = d?.climb_rate_avg_ms || 1.8;
    const rating = d?.thermal_rating || 'Mässig';
    const inversions = d?.inversions || [];
    const levels = d?.sounding_levels || [];

    // SVG Diagram dimensions
    const svgWidth = 480;
    const svgHeight = 260;
    const padX = 40;
    const padY = 24;
    const plotW = svgWidth - padX - 20;
    const plotH = svgHeight - padY - 24;

    // Altitude mapping (elevation to 5000m)
    const minAlt = Math.max(0, st.elevation);
    const maxAlt = 5000;
    const altToY = (a) => padY + plotH - ((a - minAlt) / (maxAlt - minAlt)) * plotH;

    // Temperature mapping (-25°C to +35°C)
    const minT = -25;
    const maxT = 35;
    const tempToX = (t) => padX + ((t - minT) / (maxT - minT)) * plotW;

    // Generate Path for Environment Temp T(z)
    const tPoints = levels.map(l => `${tempToX(l.t)},${altToY(l.alt)}`).join(' ');
    // Generate Path for Dewpoint Td(z)
    const tdPoints = levels.map(l => `${tempToX(l.td)},${altToY(l.alt)}`).join(' ');
    // Generate Path for Parcel Ascent
    const parcelPoints = (d?.parcel_curve || []).map(p => `${tempToX(p.parcel_t)},${altToY(p.alt)}`).join(' ');

    const lclY = altToY(lclAlt);

    return `
      <div class="sounding-station-header">
        <div class="station-meta-block">
          <div class="station-title-row">
            <h3 class="station-name">${st.name}</h3>
            <span class="station-elev-badge">${st.elevation} m ü.M.</span>
            <span class="station-coord-badge">${st.lat.toFixed(4)}°N, ${st.lon.toFixed(4)}°E</span>
          </div>
          <p class="station-sub-text">MeteoSchweiz / Ubique Fluid Previtemps Sounding Profile</p>
        </div>

        <!-- Surface Temperature Simulator Slider -->
        <div class="surface-slider-box">
          <div class="surface-slider-header">
            <span class="slider-title">🌡️ Bodentemperatur simulieren:</span>
            <span id="surface-temp-val" class="slider-val">${surfaceT.toFixed(1)} °C</span>
          </div>
          <input 
            type="range" 
            id="emagram-temp-slider" 
            class="temp-slider-input" 
            min="5" 
            max="35" 
            step="0.5" 
            value="${surfaceT}" 
          />
          <div class="slider-ticks">
            <span>5°C (Morgen)</span>
            <span>20°C (Mittag)</span>
            <span>35°C (Hochsommer)</span>
          </div>
        </div>
      </div>

      <!-- Core Aerological Metrics KPI Grid -->
      <div class="sounding-metrics-grid">
        <div class="sounding-kpi-card">
          <span class="kpi-icon">☁️</span>
          <div class="kpi-info">
            <span class="kpi-label">Wolkenbasis (LCL)</span>
            <span class="kpi-value highlight-cyan">${lclAlt} m</span>
            <span class="kpi-sub">${lclAgl} m über Grund</span>
          </div>
        </div>

        <div class="sounding-kpi-card">
          <span class="kpi-icon">🔥</span>
          <div class="kpi-info">
            <span class="kpi-label">Auslösetemperatur</span>
            <span class="kpi-value highlight-orange">${trigT} °C</span>
            <span class="kpi-sub">${surfaceT >= trigT ? '✅ Ausgelöst (Aktiv)' : '⏳ Noch nicht erreicht'}</span>
          </div>
        </div>

        <div class="sounding-kpi-card">
          <span class="kpi-icon">🦅</span>
          <div class="kpi-info">
            <span class="kpi-label">Thermik-Qualität</span>
            <span class="kpi-value highlight-green">${climbRate} m/s</span>
            <span class="kpi-sub">${rating}</span>
          </div>
        </div>

        <div class="sounding-kpi-card">
          <span class="kpi-icon">🏔️</span>
          <div class="kpi-info">
            <span class="kpi-label">Thermikobergrenze</span>
            <span class="kpi-value highlight-purple">${thermalCeil} m</span>
            <span class="kpi-sub">Thermik-Nutzhöhe: ${Math.max(0, thermalCeil - st.elevation)} m</span>
          </div>
        </div>
      </div>

      <!-- SVG Emagram / Skew-T Thermodynamic Chart -->
      <div class="emagram-diagram-wrapper">
        <div class="diagram-header-row">
          <strong class="diagram-title">Emagramm / Vertikales Profil (Stüve/Skew-T)</strong>
          <div class="diagram-legend-row">
            <span class="chart-legend-item"><span class="legend-dot dot-red"></span>Temperatur T</span>
            <span class="chart-legend-item"><span class="legend-dot dot-blue"></span>Taupunkt Td</span>
            <span class="chart-legend-item"><span class="legend-dot dot-orange"></span>Aufstiegskurve</span>
            <span class="chart-legend-item"><span class="legend-dot dot-cyan"></span>Wolkenbasis LCL</span>
          </div>
        </div>

        <div class="svg-chart-container">
          <svg viewBox="0 0 ${svgWidth} ${svgHeight}" class="emagram-svg" preserveAspectRatio="none">
            <!-- Grid Lines: Altitudes -->
            ${[1000, 2000, 3000, 4000, 5000].map(alt => {
              if (alt < minAlt) return '';
              const y = altToY(alt);
              return `
                <line x1="${padX}" y1="${y}" x2="${svgWidth - 20}" y2="${y}" stroke="rgba(255,255,255,0.08)" stroke-dasharray="3,3" />
                <text x="${padX - 6}" y="${y + 4}" fill="var(--text-muted)" font-size="9" text-anchor="end">${alt}m</text>
              `;
            }).join('')}

            <!-- Grid Lines: Temperatures -->
            ${[-20, -10, 0, 10, 20, 30].map(t => {
              const x = tempToX(t);
              return `
                <line x1="${x}" y1="${padY}" x2="${x}" y2="${svgHeight - 24}" stroke="rgba(255,255,255,0.08)" stroke-dasharray="3,3" />
                <text x="${x}" y="${svgHeight - 10}" fill="var(--text-muted)" font-size="9" text-anchor="middle">${t}°C</text>
              `;
            }).join('')}

            <!-- 0°C Isotherm Highlight -->
            <line 
              x1="${tempToX(0)}" 
              y1="${padY}" 
              x2="${tempToX(0)}" 
              y2="${svgHeight - 24}" 
              stroke="#60A5FA" 
              stroke-width="1.2" 
              stroke-dasharray="4,4" 
            />

            <!-- Inversion Bands Shading -->
            ${inversions.map(inv => {
              const y1 = altToY(inv.top_alt);
              const y2 = altToY(inv.bottom_alt);
              const h = Math.max(4, y2 - y1);
              return `
                <rect x="${padX}" y="${y1}" width="${plotW}" height="${h}" fill="rgba(168, 85, 247, 0.18)" />
                <text x="${svgWidth - 24}" y="${y1 + h / 2 + 3}" fill="#C084FC" font-size="8.5" text-anchor="end">Inversion +${inv.strength_k}K</text>
              `;
            }).join('')}

            <!-- LCL Cloud Base Dashed Cyan Line -->
            ${lclAlt <= maxAlt ? `
              <line x1="${padX}" y1="${lclY}" x2="${svgWidth - 20}" y2="${lclY}" stroke="#22D3EE" stroke-width="1.8" stroke-dasharray="5,3" />
              <text x="${padX + 8}" y="${lclY - 4}" fill="#22D3EE" font-size="9" font-weight="700">Kumulusbasis ${lclAlt}m</text>
            ` : ''}

            <!-- Plot Dewpoint Curve Td(z) -->
            ${tdPoints ? `<polyline fill="none" stroke="#3B82F6" stroke-width="2.2" stroke-linecap="round" points="${tdPoints}" />` : ''}

            <!-- Plot Temperature Curve T(z) -->
            ${tPoints ? `<polyline fill="none" stroke="#EF4444" stroke-width="2.5" stroke-linecap="round" points="${tPoints}" />` : ''}

            <!-- Plot Parcel Ascent Curve -->
            ${parcelPoints ? `<polyline fill="none" stroke="#F59E0B" stroke-width="2" stroke-dasharray="4,2" points="${parcelPoints}" />` : ''}
          </svg>
        </div>
      </div>

      <!-- Winds Aloft Table (Höhenwinde) -->
      <div class="winds-aloft-box">
        <h4 class="winds-title">💨 Höhenwindprofil (Winds Aloft)</h4>
        <div class="winds-aloft-pills">
          ${levels.filter(l => [1000, 1500, 2000, 2500, 3000, 4000].includes(l.alt) || l.alt === st.elevation).map(l => `
            <div class="wind-level-badge">
              <span class="wind-alt">${l.alt}m</span>
              <span class="wind-val">${l.wind_speed} km/h</span>
              <span class="wind-dir" style="transform: rotate(${l.wind_dir}deg);">↓</span>
              <span class="wind-deg">${l.wind_dir}°</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  updateSoundingCard() {
    const cardContainer = this.container.querySelector('#emagram-detail-container');
    if (cardContainer) {
      cardContainer.innerHTML = this.renderSoundingDetailContent();
      this.attachSoundingCardEvents();
    }
  }

  // =========================================================================
  // 4. ISOBARENKARTE SECTION
  // =========================================================================

  renderIsobarenSection(isobarenUrl) {
    return `
      <div class="forecast-content-card">
        <div class="section-header-row">
          <div>
            <span class="badge-tag">Synoptik</span>
            <h2 class="section-heading">Offizielle Isobarenkarte</h2>
            <p class="section-sub">Bodennahres Druckfeld & Frontenverlauf über Mitteleuropa (MeteoSchweiz & DWD)</p>
          </div>
          <a href="${isobarenUrl}" target="_blank" rel="noopener" class="btn-secondary" style="font-size: 0.8rem; padding: 6px 12px; text-decoration: none;">
            Vollbild ↗
          </a>
        </div>

        <div class="isobaren-container">
          <img src="${isobarenUrl}" alt="Offizielle Isobarenkarte" class="isobaren-svg" loading="lazy" />
        </div>
      </div>
    `;
  }

  // =========================================================================
  // EVENT LISTENERS & INTERACTION LOGIC
  // =========================================================================

  attachEvents() {
    // 1. Top Section Switcher
    this.container.querySelectorAll('.forecast-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.stopOutlookPlayer();
        this.activeSection = btn.getAttribute('data-section');
        this.render();
      });
    });

    // 2. Text Category Switcher
    this.container.querySelectorAll('.text-category-switcher-row .category-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = btn.getAttribute('data-cat');
        const type = btn.getAttribute('data-type');
        if (cat) {
          this.activeTextCategory = cat;
          this.render();
        } else if (type) {
          this.activeOutlookType = type;
          this.activeOutlookIndex = 0;
          this.render();
        }
      });
    });

    // 3. Text Region Switcher
    this.container.querySelectorAll('.region-pill').forEach(btn => {
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
          this.render();
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

      this.attachSoundingCardEvents();
    }
  }

  attachSoundingCardEvents() {
    const tempSlider = this.container.querySelector('#emagram-temp-slider');
    if (tempSlider) {
      tempSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        const valLabel = this.container.querySelector('#surface-temp-val');
        if (valLabel) valLabel.textContent = `${val.toFixed(1)} °C`;
      });

      tempSlider.addEventListener('change', (e) => {
        const val = parseFloat(e.target.value);
        this.loadSounding(this.selectedStation, val);
      });
    }
  }

  // =========================================================================
  // LEAFLET EMAGRAM MAP LOGIC
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

    // Basemap (Clean CartoDB Positron style)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 18,
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
    this.simulatedSurfaceTemp = null;
    this.loadSounding(st);
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
  }

  // =========================================================================
  // OUTLOOKS ANIMATION LOGIC
  // =========================================================================

  stepOutlook(delta) {
    const currentDataSet = this.outlooksData?.data?.find(d => d.type === this.activeOutlookType);
    const totalFiles = (currentDataSet && currentDataSet.files && currentDataSet.files.length) || 1;
    this.activeOutlookIndex = (this.activeOutlookIndex + delta + totalFiles) % totalFiles;
    this.render();
  }

  toggleOutlookPlay() {
    if (this.isPlayingOutlooks) {
      this.stopOutlookPlayer();
    } else {
      this.startOutlookPlayer();
    }
    this.render();
  }

  startOutlookPlayer() {
    this.isPlayingOutlooks = true;
    this.outlookPlayTimer = setInterval(() => {
      this.stepOutlook(1);
    }, 1500);
  }

  stopOutlookPlayer() {
    this.isPlayingOutlooks = false;
    if (this.outlookPlayTimer) {
      clearInterval(this.outlookPlayTimer);
      this.outlookPlayTimer = null;
    }
  }

  // =========================================================================
  // UTILS
  // =========================================================================

  sanitizeHtml(rawHtml) {
    if (!rawHtml) return '';
    const bodyMatch = rawHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    return bodyMatch ? bodyMatch[1] : rawHtml;
  }
}
