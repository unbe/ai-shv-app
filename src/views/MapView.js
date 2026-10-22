import L from 'leaflet';
import { store } from '../state.js';
import { ShvApi } from '../services/api.js';

export class MapView {
  constructor(container) {
    this.container = container;
    this.map = null;
    this.baseLayers = {};
    this.currentBaseLayer = null;

    // GeoJSON layer groups
    this.launchesLayer = L.layerGroup();
    this.landingsLayer = L.layerGroup();
    this.airspaceLayer = L.geoJSON(null, {
      style: (feature) => this.getAirspaceStyle(feature),
      onEachFeature: (feature, layer) => this.bindAirspaceEvents(feature, layer),
    });
    this.wildschutzLayer = L.geoJSON(null, {
      style: {
        color: '#10B981',
        weight: 1.5,
        dashArray: '4, 4',
        fillColor: '#10B981',
        fillOpacity: 0.12,
      },
      onEachFeature: (feature, layer) => this.bindWildschutzEvents(feature, layer),
    });
    this.obstaclesLayer = L.geoJSON(null, {
      pointToLayer: (feature, latlng) => this.renderObstaclePoint(feature, latlng),
      style: (feature) => this.getObstacleStyle(feature),
      onEachFeature: (feature, layer) => this.bindObstacleEvents(feature, layer),
    });
    this.obstacleDebounce = null;
    this.stationsLayer = L.layerGroup();
    this.webcamsLayer = L.layerGroup();
    this.foehnLayer = L.layerGroup();
    this.pilotMarker = null;

    // Cached raw data
    this.rawFlyingSites = null;
    this.rawAirspaces = null;
    this.rawWildschutz = null;
    this.rawMeasurements = null;
    this.rawWebcams = null;

    this.unsubscribe = null;
  }

  mount() {
    this.renderLayout();
    this.initMap();
    this.loadData();

    // Subscribe to state changes (theme, wind filter, search, layer toggles)
    this.unsubscribe = store.subscribe((state) => {
      this.syncState(state);
    });
  }

  unmount() {
    if (this.unsubscribe) this.unsubscribe();
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  }

  renderLayout() {
    const t = store.t;
    const { layers, baseMap, windFilter, searchQuery, meteoMode, mapCategory = 'AIRSPACE' } = store.state;

    const windDirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

    this.container.innerHTML = `
      <div class="map-view-wrapper">
        <!-- 1. Top Search Bar & Active Filters -->
        <div class="map-top-container">
          <div class="map-search-wrapper">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="search-icon">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input type="text" id="map-search-input" placeholder="${t.map.searchPlaceholder}" value="${searchQuery}" autocomplete="off" />
            ${searchQuery ? `<button id="btn-clear-search" class="clear-btn" title="Suche löschen">&times;</button>` : ''}
          </div>

          <!-- Active Filter Indicator Pills -->
          <div class="active-filter-pills ${windFilter.length > 0 || searchQuery ? '' : 'hidden'}">
            ${windFilter.length > 0 ? `
              <div class="active-pill pill-wind">
                <span>🍃 Wind: ${windFilter.join(', ')}</span>
                <button id="pill-clear-wind" title="Windfilter entfernen">&times;</button>
              </div>
            ` : ''}
            ${searchQuery ? `
              <div class="active-pill pill-search">
                <span>🔍 "${searchQuery}"</span>
                <button id="pill-clear-search" title="Suche entfernen">&times;</button>
              </div>
            ` : ''}
          </div>
        </div>

        <!-- 2. Right Floating Action Button (FAB) Stack -->
        <div class="map-fab-column">
          <!-- Single Unified Map Controls FAB -->
          <button id="btn-fab-layers" class="map-fab" title="Karten-Optionen & Ebenen ein-/ausblenden">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
              <polyline points="2 17 12 22 22 17"></polyline>
              <polyline points="2 12 12 17 22 12"></polyline>
            </svg>
            ${windFilter.length > 0 ? `<span class="fab-badge">${windFilter.length}</span>` : ''}
          </button>

          <!-- Center Switzerland FAB -->
          <button id="btn-fab-center" class="map-fab" title="Schweiz zentrieren">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M3 12h3m12 0h3M12 3v3m0 12v3"></path>
            </svg>
          </button>
        </div>

        <!-- 3. Bottom Controls Stack (Directly matching Screenshot_20261022-164845.png) -->
        <div class="map-bottom-stack">
          <div class="map-bottom-floating-row">
            <button id="btn-floating-info" class="map-floating-info" title="Information, Legende & Quellen">
              <span>i</span>
            </button>
            <a id="btn-floating-dabs" href="https://www.skybriefing.com/de/dabs" target="_blank" rel="noopener" class="map-floating-dabs ${mapCategory === 'AIRSPACE' ? '' : 'hidden'}" title="Skybriefing DABS Daily Airspace Bulletin">
              <span>DABS</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
            </a>
          </div>

          <div id="map-layers-drawer" class="map-drawer map-bottom-drawer">
            <div class="drawer-drag-handle"></div>

            <!-- Segmented Category Tabs -->
            <div class="drawer-category-bar">
              <button data-map-category="METEO" class="drawer-cat-pill ${mapCategory === 'METEO' ? 'active' : ''}">Weather</button>
              <button data-map-category="AIRSPACE" class="drawer-cat-pill ${mapCategory === 'AIRSPACE' ? 'active' : ''}">Airspace</button>
              <button data-map-category="FLYING_AREAS" class="drawer-cat-pill ${mapCategory === 'FLYING_AREAS' ? 'active' : ''}">Flying sites</button>
            </div>

          <div class="drawer-body">
            <!-- 3.1 Airspace & Obstacles Tab -->
            <div class="drawer-tab-pane ${mapCategory === 'AIRSPACE' ? 'active' : 'hidden'}" data-pane="AIRSPACE">
              <!-- Base map selection -->
              <div class="drawer-section">
                <h4 class="drawer-subtitle">Base map</h4>
                <div class="basemap-grid">
                  <button data-base="topoLight" class="basemap-card ${baseMap === 'topoLight' ? 'active' : ''}">
                    <img src="/assets/ic_topo_light.png" alt="Light" class="basemap-card-img" />
                    <span>Light Base Map</span>
                  </button>
                  <button data-base="topoColor" class="basemap-card ${baseMap === 'topoColor' ? 'active' : ''}">
                    <img src="/assets/ic_topo_raster.png" alt="Pixelkarte" class="basemap-card-img" />
                    <span>Pixelkarte</span>
                  </button>
                  <button data-base="topoSatellite" class="basemap-card ${baseMap === 'topoSatellite' ? 'active' : ''}">
                    <img src="/assets/ic_topo_imagery.png" alt="Luftbild" class="basemap-card-img" />
                    <span>Luftbild</span>
                  </button>
                  <button data-base="topoOsm" class="basemap-card ${baseMap === 'topoOsm' ? 'active' : ''}">
                    <div class="basemap-osm-placeholder">OSM</div>
                    <span>OpenStreet</span>
                  </button>
                </div>
              </div>

              <!-- Airspace & Obstacle toggles -->
              <div class="drawer-section">
                <h4 class="drawer-subtitle">Luftraum & Hindernisse</h4>
                <div class="layer-switch-list">
                  <label class="layer-switch-item">
                    <div class="layer-switch-label">
                      <span class="chip-dot dot-obstacle"></span>
                      <span>Luftfahrthindernisse BAZL</span>
                    </div>
                    <input type="checkbox" data-layer="obstacles" ${layers.obstacles ? 'checked' : ''} />
                    <span class="switch-toggle"></span>
                  </label>

                  <label class="layer-switch-item">
                    <div class="layer-switch-label">
                      <span class="chip-dot dot-airspace"></span>
                      <span>Luftraum (CTR, TMA, Segelflug)</span>
                    </div>
                    <input type="checkbox" data-layer="airspace" ${layers.airspace ? 'checked' : ''} />
                    <span class="switch-toggle"></span>
                  </label>

                  <label class="layer-switch-item">
                    <div class="layer-switch-label">
                      <span class="chip-dot dot-wild"></span>
                      <span>Wildruhezonen & Schutzgebiete</span>
                    </div>
                    <input type="checkbox" data-layer="wildschutz" ${layers.wildschutz ? 'checked' : ''} />
                    <span class="switch-toggle"></span>
                  </label>
                </div>
              </div>
            </div>

            <!-- 3.2 Weather Tab -->
            <div class="drawer-tab-pane ${mapCategory === 'METEO' ? 'active' : 'hidden'}" data-pane="METEO">
              <div class="drawer-section">
                <h4 class="drawer-subtitle">Live-Wetter (Meteo-Overlays)</h4>
                <div class="drawer-meteo-pills-row">
                  <button data-meteo-mode="WIND" class="meteo-pill ${meteoMode === 'WIND' ? 'active' : ''}" title="Windwerte & Böen an Stationen">
                    <span class="pill-icon">🍃</span>
                    <span>Wind & Böen</span>
                  </button>
                  <button data-meteo-mode="TEMPERATURE" class="meteo-pill ${meteoMode === 'TEMPERATURE' ? 'active' : ''}" title="Temperatur-Overlay an Stationen">
                    <span class="pill-icon">🌡️</span>
                    <span>Temperatur</span>
                  </button>
                  <button data-meteo-mode="PRESSURE_DIFFERENCE" class="meteo-pill ${meteoMode === 'PRESSURE_DIFFERENCE' ? 'active' : ''}" title="Offizielle Transekte (Gotthard, Genf-Güttingen, Pilatus-Matro, Jura)">
                    <span class="pill-icon">⚡</span>
                    <span>Föhn / Δp</span>
                  </button>
                  <button data-meteo-mode="WEBCAM" class="meteo-pill ${meteoMode === 'WEBCAM' ? 'active' : ''}" title="Alpine Webcams mit Live-Vorschau">
                    <span class="pill-icon">📷</span>
                    <span>Webcams</span>
                  </button>
                  <button data-meteo-mode="NONE" class="meteo-pill pill-none ${meteoMode === 'NONE' ? 'active' : ''}" title="Meteo-Ebenen ausblenden">
                    <span>✕ Keine Wetter-Ebene</span>
                  </button>
                </div>
              </div>
            </div>

            <!-- 3.3 Flying Sites Tab -->
            <div class="drawer-tab-pane ${mapCategory === 'FLYING_AREAS' ? 'active' : 'hidden'}" data-pane="FLYING_AREAS">
              <div class="drawer-section">
                <h4 class="drawer-subtitle">Fluggebiete</h4>
                <div class="layer-switch-list">
                  <label class="layer-switch-item">
                    <div class="layer-switch-label">
                      <span class="chip-dot dot-launch"></span>
                      <span>Startplätze (Take-offs)</span>
                    </div>
                    <input type="checkbox" data-layer="launches" ${layers.launches ? 'checked' : ''} />
                    <span class="switch-toggle"></span>
                  </label>

                  <label class="layer-switch-item">
                    <div class="layer-switch-label">
                      <span class="chip-dot dot-landing"></span>
                      <span>Landeplätze (Landings)</span>
                    </div>
                    <input type="checkbox" data-layer="landings" ${layers.landings ? 'checked' : ''} />
                    <span class="switch-toggle"></span>
                  </label>
                </div>
              </div>

              <!-- Startplatz Windfilter (Kompass) -->
              <div class="drawer-section">
                <h4 class="drawer-subtitle">Startplatz-Ausrichtung (Windfilter)</h4>
                <p class="drawer-hint">Filtert Startplätze nach passender Windrichtung:</p>
                <div class="compass-rose-grid">
                  ${windDirs.map(d => `
                    <button data-wind="${d}" class="compass-btn ${windFilter.includes(d) ? 'active' : ''}">
                      ${d}
                    </button>
                  `).join('')}
                </div>
                <div id="wind-drawer-reset-wrapper" style="display: ${windFilter.length > 0 ? 'block' : 'none'}; margin-top: 8px;">
                  <button id="btn-reset-wind-filter" class="btn-secondary" style="width: 100%; font-size: 0.8rem; padding: 6px;">Filter zurücksetzen (${windFilter.join(', ')})</button>
                </div>
              </div>
            </div>
          </div>
        </div>
        </div>

        <!-- 4. Leaflet Map Container -->
        <div id="shv-leaflet-map" class="leaflet-map-element"></div>
      </div>
    `;

    this.attachDomEvents();
  }

  attachDomEvents() {
    const searchInput = this.container.querySelector('#map-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        store.setSearchQuery(e.target.value);
      });
    }

    const clearSearch = this.container.querySelector('#btn-clear-search');
    if (clearSearch) {
      clearSearch.addEventListener('click', () => {
        store.setSearchQuery('');
        if (searchInput) searchInput.value = '';
      });
    }

    // Active filter pills delegation
    const pillsContainer = this.container.querySelector('.active-filter-pills');
    if (pillsContainer) {
      pillsContainer.addEventListener('click', (e) => {
        if (e.target.closest('#pill-clear-wind')) {
          store.clearWindFilter();
        } else if (e.target.closest('#pill-clear-search')) {
          store.setSearchQuery('');
          if (searchInput) searchInput.value = '';
        }
      });
    }

    // Floating Action Buttons (FABs)
    const btnFabLayers = this.container.querySelector('#btn-fab-layers');
    const btnFabCenter = this.container.querySelector('#btn-fab-center');
    const layersDrawer = this.container.querySelector('#map-layers-drawer');

    if (btnFabLayers && layersDrawer) {
      btnFabLayers.addEventListener('click', (e) => {
        e.stopPropagation();
        layersDrawer.classList.toggle('hidden');
      });
    }

    // Segmented Category Tabs
    this.container.querySelectorAll('.drawer-cat-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = btn.getAttribute('data-map-category');
        store.setMapCategory(cat);
      });
    });

    const btnFloatingInfo = this.container.querySelector('#btn-floating-info');
    if (btnFloatingInfo) {
      btnFloatingInfo.addEventListener('click', () => {
        alert("SHV Live-Karte: Swisstopo Basiskarte, BAZL Luftfahrthindernisse, MeteoSchweiz Messwerte & Skybriefing DABS.");
      });
    }

    const closeLayers = this.container.querySelector('#btn-close-layers');
    if (closeLayers && layersDrawer) {
      closeLayers.addEventListener('click', () => layersDrawer.classList.add('hidden'));
    }

    // Prevent map click when interacting inside drawer
    if (layersDrawer) layersDrawer.addEventListener('click', (e) => e.stopPropagation());

    if (btnFabCenter) {
      btnFabCenter.addEventListener('click', () => {
        if (this.map) {
          this.map.setView([46.8182, 8.2275], 9);
        }
      });
    }

    // Basemap selector items
    this.container.querySelectorAll('.basemap-card').forEach(btn => {
      btn.addEventListener('click', () => {
        const baseKey = btn.getAttribute('data-base');
        store.setBaseMap(baseKey);
        this.container.querySelectorAll('.basemap-card').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Layer toggle switches
    this.container.querySelectorAll('input[data-layer]').forEach(input => {
      input.addEventListener('change', () => {
        const layerKey = input.getAttribute('data-layer');
        store.toggleLayer(layerKey);
      });
    });

    // Wind filter buttons
    this.container.querySelectorAll('.compass-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const dir = btn.getAttribute('data-wind');
        store.toggleWindFilter(dir);
      });
    });

    // Meteo mode selector pills
    this.container.querySelectorAll('.meteo-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-meteo-mode');
        store.setMeteoMode(mode);
      });
    });

    const resetWindBtn = this.container.querySelector('#btn-reset-wind-filter');
    if (resetWindBtn) {
      resetWindBtn.addEventListener('click', () => {
        store.clearWindFilter();
      });
    }
  }

  initMap() {
    const mapEl = this.container.querySelector('#shv-leaflet-map');
    if (!mapEl) return;

    // Swiss center coordinates: Flüeli-Ranft / Älggialp
    this.map = L.map(mapEl, {
      center: [46.8182, 8.2275],
      zoom: 9,
      minZoom: 7,
      maxZoom: 18,
      zoomControl: false,
    });

    // Zoom control at bottom right to avoid header collision
    L.control.zoom({ position: 'bottomright' }).addTo(this.map);

    // Swisstopo WMTS Tile Layers (EPSG:3857)
    this.baseLayers = {
      topoColor: L.tileLayer('https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg', {
        attribution: '&copy; <a href="https://www.swisstopo.admin.ch">swisstopo</a>',
        maxZoom: 18,
      }),
      topoSatellite: L.tileLayer('https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/{z}/{x}/{y}.jpeg', {
        attribution: '&copy; <a href="https://www.swisstopo.admin.ch">swisstopo SWISSIMAGE</a>',
        maxZoom: 19,
      }),
      topoLight: L.tileLayer('https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-grau/default/current/3857/{z}/{x}/{y}.jpeg', {
        attribution: '&copy; <a href="https://www.swisstopo.admin.ch">swisstopo</a>',
        maxZoom: 18,
      }),
      topoOsm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }),
    };

    // Apply default base layer
    const baseKey = store.state.baseMap || 'topoColor';
    this.currentBaseLayer = this.baseLayers[baseKey] || this.baseLayers.topoColor;
    this.currentBaseLayer.addTo(this.map);

    // Add layer groups according to initial state
    const { layers } = store.state;
    if (layers.airspace) this.airspaceLayer.addTo(this.map);
    if (layers.wildschutz) this.wildschutzLayer.addTo(this.map);
    if (layers.obstacles) this.obstaclesLayer.addTo(this.map);
    if (layers.launches) this.launchesLayer.addTo(this.map);
    if (layers.landings) this.landingsLayer.addTo(this.map);
    if (layers.stations) this.stationsLayer.addTo(this.map);
    if (layers.webcams) this.webcamsLayer.addTo(this.map);
    if (layers.foehnAxis) this.foehnLayer.addTo(this.map);

    // Dynamic viewport obstacle loading
    this.map.on('moveend zoomend', () => {
      clearTimeout(this.obstacleDebounce);
      this.obstacleDebounce = setTimeout(() => {
        this.updateObstacles();
      }, 150);
    });

    // Click outside deselects and closes flyout drawer
    this.map.on('click', (e) => {
      // If clicked on empty space, deselect
      if (!e.originalEvent._shvHandled) {
        store.selectSite(null);
        store.selectStation(null);
        store.selectWebcam(null);
        store.selectObstacle(null);
      }
    });

    // Ensure map tiles recalculate properly
    requestAnimationFrame(() => {
      if (this.map) {
        this.map.invalidateSize();
      }
    });
    setTimeout(() => {
      if (this.map) {
        this.map.invalidateSize();
      }
    }, 200);
  }

  resetView() {
    if (this.map) {
      this.map.setView([46.8182, 8.2275], 9);
      this.map.invalidateSize();
    }
    const layersDrawer = this.container.querySelector('#map-layers-drawer');
    const windDrawer = this.container.querySelector('#map-wind-drawer');
    if (layersDrawer) layersDrawer.classList.add('hidden');
    if (windDrawer) windDrawer.classList.add('hidden');

    const searchInput = this.container.querySelector('#map-search-input');
    if (searchInput) searchInput.value = '';
  }

  async loadData() {
    // 1. Flying sites
    try {
      this.rawFlyingSites = await ShvApi.getFlyingSites();
      this.renderFlyingSites();
    } catch (err) {
      console.error('[MapView] Error loading flying sites:', err);
    }

    // 2. Airspaces
    try {
      this.rawAirspaces = await ShvApi.getAirspaces();
      if (this.rawAirspaces && this.airspaceLayer) {
        this.airspaceLayer.addData(this.rawAirspaces);
      }
    } catch (err) {
      console.error('[MapView] Error loading airspaces:', err);
    }

    // 3. Wildlife zones
    try {
      this.rawWildschutz = await ShvApi.getWildschutz();
      if (this.rawWildschutz && this.wildschutzLayer) {
        this.wildschutzLayer.addData(this.rawWildschutz);
      }
    } catch (err) {
      console.error('[MapView] Error loading wildschutz:', err);
    }

    // 4. Weather stations & measurements
    try {
      this.rawMeasurements = await ShvApi.getMeasurements();
      store.state.measurements = this.rawMeasurements;
      this.renderStations();
    } catch (err) {
      console.error('[MapView] Error loading measurements:', err);
    }

    // 5. Foehn pressure differences
    try {
      const foehnData = await ShvApi.getFoehn();
      store.state.foehn = foehnData;
      this.renderFoehnAxis(foehnData);
    } catch (err) {
      console.error('[MapView] Error loading foehn axis:', err);
    }

    // 6. Webcams
    try {
      this.rawWebcams = await ShvApi.getWebcams();
      store.state.webcams = this.rawWebcams;
      this.renderWebcams();
    } catch (err) {
      console.error('[MapView] Error loading webcams:', err);
    }

    // 7. BAZL Aviation Obstacles
    try {
      await this.updateObstacles();
    } catch (err) {
      console.error('[MapView] Error loading obstacles:', err);
    }
  }

  getFeatureLatLng(feature) {
    const geom = feature?.geometry;
    if (!geom || !geom.coordinates) return null;
    const t = geom.type;
    const coords = geom.coordinates;

    if (t === 'Point') {
      if (Array.isArray(coords) && coords.length >= 2 && typeof coords[0] === 'number' && typeof coords[1] === 'number') {
        if (!isNaN(coords[0]) && !isNaN(coords[1])) {
          return [coords[1], coords[0]];
        }
      }
    } else if (t === 'Polygon') {
      const ring = coords[0];
      if (Array.isArray(ring) && ring.length > 0) {
        let sumLat = 0, sumLng = 0, count = 0;
        for (const pt of ring) {
          if (Array.isArray(pt) && pt.length >= 2 && typeof pt[0] === 'number' && typeof pt[1] === 'number') {
            sumLng += pt[0];
            sumLat += pt[1];
            count++;
          }
        }
        if (count > 0) return [sumLat / count, sumLng / count];
      }
    } else if (t === 'LineString') {
      if (Array.isArray(coords) && coords.length > 0) {
        let sumLat = 0, sumLng = 0, count = 0;
        for (const pt of coords) {
          if (Array.isArray(pt) && pt.length >= 2 && typeof pt[0] === 'number' && typeof pt[1] === 'number') {
            sumLng += pt[0];
            sumLat += pt[1];
            count++;
          }
        }
        if (count > 0) return [sumLat / count, sumLng / count];
      }
    } else if (t === 'MultiPolygon') {
      const firstPoly = coords[0];
      if (Array.isArray(firstPoly) && Array.isArray(firstPoly[0]) && firstPoly[0].length > 0) {
        const pt = firstPoly[0][0];
        if (Array.isArray(pt) && pt.length >= 2 && typeof pt[0] === 'number' && typeof pt[1] === 'number') {
          return [pt[1], pt[0]];
        }
      }
    }
    return null;
  }

  renderFlyingSites() {
    this.launchesLayer.clearLayers();
    this.landingsLayer.clearLayers();

    if (!this.rawFlyingSites || !this.rawFlyingSites.features) return;

    // Index primary sites by siteId to resolve names/metadata for any auxiliary features
    const sitesById = {};
    for (const f of this.rawFlyingSites.features) {
      if (f.properties?.siteId && f.properties?.siteName) {
        sitesById[f.properties.siteId] = f.properties;
      }
    }
    store.state.flyingSitesById = sitesById;

    const { searchQuery, windFilter } = store.state;
    const query = (searchQuery || '').trim().toLowerCase();

    for (const feature of this.rawFlyingSites.features) {
      const p = feature.properties || {};
      const type = (p.type || '').toLowerCase();
      // Primary map markers are launch and landing points only (matching native SHV app)
      const isLaunch = type === 'launch';
      const isLanding = type === 'landing';

      if (!isLaunch && !isLanding) continue;

      const latLng = this.getFeatureLatLng(feature);
      if (!latLng) continue;

      // Filter by Search Query
      if (query) {
        const nameMatch = (p.siteName || '').toLowerCase().includes(query);
        const descMatch = (p.siteDescription || '').toLowerCase().includes(query);
        const clubMatch = (p.responsible || '').toLowerCase().includes(query);
        if (!nameMatch && !descMatch && !clubMatch) continue;
      }

      // Filter by Wind Suitability (for launches)
      if (isLaunch && windFilter.length > 0) {
        const launchDirs = p.launchDirections || [];
        const hasMatch = windFilter.some(d => launchDirs.includes(d));
        if (!hasMatch) continue;
      }

      // Create Custom Paragliding Marker
      const marker = this.createFlyingSiteMarker(feature, latLng, isLaunch);
      if (marker) {
        if (isLaunch) {
          this.launchesLayer.addLayer(marker);
        } else {
          this.landingsLayer.addLayer(marker);
        }
      }
    }
  }

  createFlyingSiteMarker(feature, latLng, isLaunch) {
    const p = feature.properties || {};
    const primaryDir = (p.launchDirections && p.launchDirections[0]) || '';

    // HTML Icon for launch / landing
    const iconHtml = isLaunch ? `
      <div class="shv-map-marker marker-launch" title="${p.siteName || ''}">
        <div class="marker-pin pin-launch">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/>
          </svg>
        </div>
        ${primaryDir ? `<span class="marker-dir">${primaryDir}</span>` : ''}
      </div>
    ` : `
      <div class="shv-map-marker marker-landing" title="${p.siteName || ''}">
        <div class="marker-pin pin-landing">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"></path>
          </svg>
        </div>
      </div>
    `;

    const icon = L.divIcon({
      className: 'shv-div-icon',
      html: iconHtml,
      iconSize: [32, 32],
      iconAnchor: [16, 28],
      popupAnchor: [0, -28],
    });

    const marker = L.marker(latLng, { icon });
    marker.on('click', (e) => {
      e.originalEvent._shvHandled = true;
      store.selectSite(feature);
    });

    return marker;
  }

  renderObstaclePoint(feature, latlng) {
    const p = feature.properties || {};
    const isEndpoint = ['TRANSMISSION_LINE', 'CABLE_CAR', 'CATENARY', 'BRIDGE'].includes(p.obstacleType);

    let iconUrl = '/assets/obstacles/red_circle.svg';
    let iconSize = [10, 10];
    let iconAnchor = [5, 5];

    if (isEndpoint) {
      if (p.marking === 'MARKED' || p.obstacleType === 'CATENARY') {
        iconUrl = '/assets/obstacles/triangle.svg';
        iconSize = [12, 12];
        iconAnchor = [6, 6];
      } else if (p.obstacleType === 'TRANSMISSION_LINE') {
        iconUrl = '/assets/obstacles/red_circle.svg';
        iconSize = [9, 9];
        iconAnchor = [4.5, 4.5];
      } else {
        iconUrl = '/assets/obstacles/blue_circle.svg';
        iconSize = [9, 9];
        iconAnchor = [4.5, 4.5];
      }
    } else {
      const styleId = p.styleId || 'ms_pole';
      iconUrl = `/assets/obstacles/${styleId}.svg`;
      if (styleId.includes('tree')) {
        iconSize = [32, 28];
        iconAnchor = [16, 26];
      } else if (styleId.includes('crane')) {
        iconSize = [28, 28];
        iconAnchor = [14, 26];
      } else if (styleId.includes('building')) {
        iconSize = [24, 24];
        iconAnchor = [12, 22];
      } else if (styleId.includes('windmill')) {
        iconSize = [24, 28];
        iconAnchor = [12, 26];
      } else {
        iconSize = [22, 34];
        iconAnchor = [11, 32];
      }
    }

    const icon = L.icon({
      iconUrl,
      iconSize,
      iconAnchor,
      className: 'obstacle-marker-icon'
    });

    const marker = L.marker(latlng, { icon });
    marker.on('click', (e) => {
      e.originalEvent._shvHandled = true;
      store.selectObstacle(feature);
    });
    return marker;
  }

  getObstacleStyle(feature) {
    const p = feature.properties || {};
    const geomType = feature.geometry?.type;
    if (geomType === 'LineString' || geomType === 'MultiLineString') {
      const isMarked = p.marking === 'MARKED';
      const isTransmission = p.obstacleType === 'TRANSMISSION_LINE';
      return {
        color: isMarked ? '#CC0000' : (isTransmission ? '#0054FF' : '#0054FF'),
        weight: isTransmission ? 2.5 : 2,
        opacity: 0.95,
        lineJoin: 'round',
        lineCap: 'round',
      };
    } else if (geomType === 'Polygon' || geomType === 'MultiPolygon') {
      const isAirport = Boolean(p.airport);
      return {
        color: isAirport ? '#FF841B' : '#CC0000',
        weight: 1.5,
        fillColor: isAirport ? '#FF841B' : '#CC0000',
        fillOpacity: 0.06,
      };
    }
    return {};
  }

  bindObstacleEvents(feature, layer) {
    if (feature.geometry?.type !== 'Point') {
      layer.on('click', (e) => {
        e.originalEvent._shvHandled = true;
        store.selectObstacle(feature);
      });
      layer.on('mouseover', () => {
        if (layer.setStyle) layer.setStyle({ weight: 4 });
      });
      layer.on('mouseout', () => {
        if (layer.setStyle) {
          const p = feature.properties || {};
          layer.setStyle({ weight: p.obstacleType === 'TRANSMISSION_LINE' ? 2.5 : 2 });
        }
      });
    }
  }

  async updateObstacles() {
    if (!this.map || !store.state.layers.obstacles) {
      if (this.obstaclesLayer && this.map?.hasLayer(this.obstaclesLayer)) {
        this.obstaclesLayer.clearLayers();
        this.map.removeLayer(this.obstaclesLayer);
      }
      return;
    }

    if (!this.map.hasLayer(this.obstaclesLayer)) {
      this.obstaclesLayer.addTo(this.map);
    }

    const bounds = this.map.getBounds();
    const zoom = this.map.getZoom();

    const minLon = bounds.getWest() - 0.02;
    const maxLon = bounds.getEast() + 0.02;
    const minLat = bounds.getSouth() - 0.01;
    const maxLat = bounds.getNorth() + 0.01;

    try {
      const data = await ShvApi.getObstacles({ minLon, minLat, maxLon, maxLat, zoom });
      if (!data || !Array.isArray(data.features)) return;

      this.obstaclesLayer.clearLayers();
      this.obstaclesLayer.addData(data);
    } catch (err) {
      console.warn('[MapView.updateObstacles] Error fetching obstacles:', err);
    }
  }

  getAirspaceStyle(feature) {
    const type = feature.properties?.type;
    const inactive = feature.properties?.inactiveByAgreement;

    // Matching style.json rules from SHV APK
    switch (type) {
      case 'CTR':
        return {
          color: '#006092',
          weight: 2,
          dashArray: '6, 3',
          fillColor: '#006092',
          fillOpacity: 0.12,
        };
      case 'TMA':
      case 'AWY':
      case 'CTA':
        return {
          color: '#006092',
          weight: 1.5,
          fillColor: '#006092',
          fillOpacity: 0.05,
        };
      case 'Airfield':
      case 'Heliport':
        return {
          color: inactive ? '#4B5563' : '#6B4099',
          weight: 1.5,
          dashArray: inactive ? '4, 4' : null,
          fillColor: '#6B4099',
          fillOpacity: inactive ? 0.04 : 0.12,
        };
      case 'RMZ':
        return {
          color: '#6B4099',
          weight: 3,
          dashArray: '4, 2',
          fillColor: '#6B4099',
          fillOpacity: 0.08,
        };
      case 'FIZ':
        return {
          color: '#006092',
          weight: 2,
          dashArray: '2, 2',
          fillColor: '#006092',
          fillOpacity: 0.05,
        };
      case 'W': // Glider sector
        return {
          color: '#00A551',
          weight: 2,
          fillColor: '#00A551',
          fillOpacity: 0.1,
        };
      case 'Q': // Danger area (LS-D)
        return {
          color: '#E58E3D',
          weight: 2,
          fillColor: '#E58E3D',
          fillOpacity: 0.15,
        };
      case 'R': // Restricted area (LS-R)
        return {
          color: '#E3000B',
          weight: 2,
          fillColor: '#E3000B',
          fillOpacity: 0.18,
        };
      default:
        return {
          color: '#3B82F6',
          weight: 1.5,
          fillOpacity: 0.08,
        };
    }
  }

  bindAirspaceEvents(feature, layer) {
    const p = feature.properties || {};
    const t = store.t;

    const lowerStr = p.lowerMetricAltitude !== null && p.lowerMetricAltitude !== undefined
      ? `${p.lowerMetricAltitude}m ${p.lowerMetricReference || 'AGL'}`
      : 'GND';
    const upperStr = p.upperMetricAltitude !== null && p.upperMetricAltitude !== undefined
      ? `${p.upperMetricAltitude}m ${p.upperMetricReference || 'AMSL'}`
      : (p.upperImperialAltitude ? `${p.upperImperialAltitude}ft` : 'n/a');

    const popupHtml = `
      <div class="airspace-popup">
        <span class="popup-badge">${p.type || 'Luftraum'}</span>
        <h4 class="popup-title">${p.name || 'Airspace Zone'}</h4>
        <div class="popup-info-grid">
          <div><strong>Untergrenze:</strong> ${lowerStr}</div>
          <div><strong>Obergrenze:</strong> ${upperStr}</div>
          ${p.frequency ? `<div><strong>Frequenz:</strong> ${p.frequency} MHz</div>` : ''}
          ${p.callsign ? `<div><strong>Rufzeichen:</strong> ${p.callsign}</div>` : ''}
        </div>
        ${p.additionalInfo ? `<p class="popup-desc">${p.additionalInfo}</p>` : ''}
        ${p.inactiveByAgreement ? `<div class="popup-notice">Durch Vereinbarung mit SHV für Hängegleiter nutzbar.</div>` : ''}
      </div>
    `;

    layer.bindPopup(popupHtml, { maxWidth: 300 });
  }

  bindWildschutzEvents(feature, layer) {
    const p = feature.properties || {};
    const popupHtml = `
      <div class="airspace-popup wild-popup">
        <span class="popup-badge badge-wild">Wildruhezone</span>
        <h4 class="popup-title">${p.name || 'Wildschutzgebiet'}</h4>
        <div class="popup-info-grid">
          <div><strong>Mindestflughöhe:</strong> ${p.upperAltitude ? `${p.upperAltitude}m ${p.upperReference || 'QNH'}` : 'Min. 300m AGL'}</div>
        </div>
        ${p.additionalInfo ? `<p class="popup-desc">${p.additionalInfo}</p>` : ''}
      </div>
    `;
    layer.bindPopup(popupHtml, { maxWidth: 280 });
  }

  renderStations() {
    this.stationsLayer.clearLayers();
    if (!this.rawMeasurements || !this.rawMeasurements.features) return;

    const isTempMode = store.state.meteoMode === 'TEMPERATURE';

    for (const f of this.rawMeasurements.features) {
      const coords = f.geometry?.coordinates;
      const p = f.properties || {};
      if (!coords || typeof coords[0] !== 'number' || typeof coords[1] !== 'number' || isNaN(coords[0]) || isNaN(coords[1])) continue;

      const latLng = [coords[1], coords[0]];

      if (isTempMode) {
        // Temperature Mode (from WeatherStationProduct / temperature2mValue)
        const rawT = p.temperature2mValue ?? p.temperatureValue;
        if (rawT === null || rawT === undefined || isNaN(rawT)) continue;
        const tempC = rawT > 200 ? Math.round((rawT - 273.15) * 10) / 10 : Math.round(rawT * 10) / 10;

        let tempColor = '#3B82F6';
        if (tempC >= 22) tempColor = '#EF4444';
        else if (tempC >= 15) tempColor = '#F59E0B';
        else if (tempC >= 8) tempColor = '#10B981';
        else if (tempC >= 0) tempColor = '#06B6D4';

        const iconHtml = `
          <div class="station-temp-pin" style="background-color: ${tempColor};" title="${p.name || ''}: ${tempC}°C">
            <span>${tempC > 0 ? '+' : ''}${tempC}°</span>
          </div>
        `;

        const icon = L.divIcon({
          className: 'station-temp-div-icon',
          html: iconHtml,
          iconSize: [36, 22],
          iconAnchor: [18, 11],
        });

        const marker = L.marker(latLng, { icon });
        marker.on('click', (e) => {
          e.originalEvent._shvHandled = true;
          store.selectStation(f);
        });
        this.stationsLayer.addLayer(marker);

      } else {
        // Wind Mode (Wind speed & direction arrows)
        if (p.windSpeedValue === undefined || p.windSpeedValue === null) continue;
        const speedKmH = Math.round(p.windSpeedValue);
        const dirDeg = p.windDirectionValue || 0;

        let speedClass = 'speed-calm';
        if (speedKmH >= 35) speedClass = 'speed-storm';
        else if (speedKmH >= 25) speedClass = 'speed-high';
        else if (speedKmH >= 15) speedClass = 'speed-mod';

        const iconHtml = `
          <div class="station-map-pin ${speedClass}" title="${p.name || ''}: ${speedKmH} km/h">
            <div class="station-arrow" style="transform: rotate(${dirDeg}deg)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L4 20l8-4 8 4z"/>
              </svg>
            </div>
            <span class="station-speed">${speedKmH}</span>
          </div>
        `;

        const icon = L.divIcon({
          className: 'station-div-icon',
          html: iconHtml,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });

        const marker = L.marker(latLng, { icon });
        marker.on('click', (e) => {
          e.originalEvent._shvHandled = true;
          store.selectStation(f);
        });
        this.stationsLayer.addLayer(marker);
      }
    }
  }

  renderFoehnAxis(foehnData) {
    this.foehnLayer.clearLayers();
    if (!foehnData) return;

    // Support all 4 official station pairs (PressureDifferenceGeoJsonTransformer)
    const pairs = foehnData.pairs || (foehnData.primaryPair ? [foehnData.primaryPair] : []);
    if (!pairs.length) return;

    for (const pair of pairs) {
      const c1 = pair.station1?.coordinates;
      const c2 = pair.station2?.coordinates;
      if (!c1 || !c2) continue;

      const p1 = [c1[1], c1[0]];
      const p2 = [c2[1], c2[0]];
      const midPos = pair.midpointPosition ?? 0.5;
      const mid = [
        p1[0] + (p2[0] - p1[0]) * midPos,
        p1[1] + (p2[1] - p1[1]) * midPos,
      ];

      const isDanger = pair.alertLevel === 'DANGER';
      const isMod = pair.alertLevel === 'MODERATE';
      const lineColor = isDanger ? '#EF4444' : isMod ? '#F59E0B' : '#0089CF';

      // Transect polyline
      const polyline = L.polyline([p1, p2], {
        color: lineColor,
        weight: 3.5,
        dashArray: '6, 6',
        opacity: 0.85,
      });
      this.foehnLayer.addLayer(polyline);

      // Station 1 marker dot
      const dotHtml1 = `
        <div class="transect-endpoint-dot" title="${pair.station1.name}: ${pair.isPressure ? `${pair.station1.pressureHpa} hPa` : `${pair.station1.temperatureC}°C`}">
          <span>${pair.station1.name.split(' ')[0]}</span>
        </div>
      `;
      const dot1 = L.marker(p1, {
        icon: L.divIcon({ className: 'transect-dot-icon', html: dotHtml1, iconSize: [60, 20], iconAnchor: [30, 10] })
      });
      this.foehnLayer.addLayer(dot1);

      // Station 2 marker dot
      const dotHtml2 = `
        <div class="transect-endpoint-dot" title="${pair.station2.name}: ${pair.isPressure ? `${pair.station2.pressureHpa} hPa` : `${pair.station2.temperatureC}°C`}">
          <span>${pair.station2.name.split(' ')[0]}</span>
        </div>
      `;
      const dot2 = L.marker(p2, {
        icon: L.divIcon({ className: 'transect-dot-icon', html: dotHtml2, iconSize: [60, 20], iconAnchor: [30, 10] })
      });
      this.foehnLayer.addLayer(dot2);

      // Midpoint badge
      const deltaVal = pair.delta ?? pair.diffHpa;
      const deltaStr = deltaVal !== null && deltaVal !== undefined ? `${deltaVal > 0 ? '+' : ''}${deltaVal} ${pair.unit || 'hPa'}` : 'n/a';
      const badgeClass = isDanger ? 'badge-danger' : isMod ? 'badge-warning' : 'badge-safe';

      const badgeHtml = `
        <div class="foehn-map-badge ${badgeClass}" title="${pair.nameDe || pair.name}">
          <span class="foehn-badge-id">${(pair.id || '').replace('_', ' – ')}</span>
          <span class="foehn-badge-val">Δ: ${deltaStr}</span>
        </div>
      `;

      const badgeIcon = L.divIcon({
        className: 'foehn-badge-icon',
        html: badgeHtml,
        iconSize: [120, 36],
        iconAnchor: [60, 18],
      });

      const badgeMarker = L.marker(mid, { icon: badgeIcon });
      badgeMarker.on('click', () => {
        store.setTab('weather');
      });
      this.foehnLayer.addLayer(badgeMarker);
    }
  }

  renderWebcams() {
    this.webcamsLayer.clearLayers();
    if (!this.rawWebcams || !this.rawWebcams.webcams) return;

    for (const wc of this.rawWebcams.webcams) {
      if (typeof wc.latitude !== 'number' || typeof wc.longitude !== 'number' || isNaN(wc.latitude) || isNaN(wc.longitude)) continue;
      const latLng = [wc.latitude, wc.longitude];

      const iconHtml = `
        <div class="webcam-map-marker" title="${wc.name}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
            <circle cx="12" cy="13" r="4"/>
          </svg>
        </div>
      `;

      const icon = L.divIcon({
        className: 'webcam-div-icon',
        html: iconHtml,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });

      const marker = L.marker(latLng, { icon });
      marker.on('click', (e) => {
        e.originalEvent._shvHandled = true;
        store.selectWebcam(wc);
      });

      this.webcamsLayer.addLayer(marker);
    }
  }

  syncState(state) {
    if (!this.map) return;

    // 1. Base Map Switcher
    if (this.currentBaseLayer !== this.baseLayers[state.baseMap]) {
      if (this.currentBaseLayer) this.map.removeLayer(this.currentBaseLayer);
      this.currentBaseLayer = this.baseLayers[state.baseMap] || this.baseLayers.topoColor;
      this.currentBaseLayer.addTo(this.map);
    }

    // 2. Layer Visibility Toggles
    const updateVisibility = (layer, isVisible) => {
      if (isVisible && !this.map.hasLayer(layer)) {
        this.map.addLayer(layer);
      } else if (!isVisible && this.map.hasLayer(layer)) {
        this.map.removeLayer(layer);
      }
    };

    updateVisibility(this.launchesLayer, state.layers.launches);
    updateVisibility(this.landingsLayer, state.layers.landings);
    updateVisibility(this.airspaceLayer, state.layers.airspace);
    updateVisibility(this.wildschutzLayer, state.layers.wildschutz);
    updateVisibility(this.obstaclesLayer, state.layers.obstacles);
    updateVisibility(this.stationsLayer, state.layers.stations);
    updateVisibility(this.webcamsLayer, state.layers.webcams);
    updateVisibility(this.foehnLayer, state.layers.foehnAxis);

    if (state.layers.obstacles) {
      this.updateObstacles();
    }

    // 3. Re-render Stations according to meteoMode
    if (state.layers.stations) {
      this.renderStations();
    }

    // 4. Re-filter Flying Sites if search or windFilter changed
    this.renderFlyingSites();

    // 5. Update Filter UI Controls & Pills
    this.updateFilterUi(state);

    // 5. Pilot Geolocation Marker
    if (state.pilotLocation) {
      const pos = [state.pilotLocation.lat, state.pilotLocation.lng];
      if (!this.pilotMarker) {
        const pilotIcon = L.divIcon({
          className: 'pilot-loc-icon',
          html: `<div class="pilot-pulse"><div class="pilot-center"></div></div>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });
        this.pilotMarker = L.marker(pos, { icon: pilotIcon }).addTo(this.map);
        this.map.setView(pos, 12);
      } else {
        this.pilotMarker.setLatLng(pos);
      }
    }
  }

  updateFilterUi(state) {
    const { searchQuery, windFilter, layers, baseMap } = state;
    const searchInput = this.container.querySelector('#map-search-input');
    if (searchInput && searchInput.value !== (searchQuery || '')) {
      searchInput.value = searchQuery || '';
    }

    // Active filter indicator pills
    const pillsContainer = this.container.querySelector('.active-filter-pills');
    if (pillsContainer) {
      const hasPills = (windFilter && windFilter.length > 0) || Boolean(searchQuery);
      if (!hasPills) {
        pillsContainer.classList.add('hidden');
        pillsContainer.innerHTML = '';
      } else {
        pillsContainer.classList.remove('hidden');
        pillsContainer.innerHTML = `
          ${windFilter && windFilter.length > 0 ? `
            <div class="active-pill pill-wind">
              <span>🍃 Wind: ${windFilter.join(', ')}</span>
              <button id="pill-clear-wind" title="Windfilter entfernen">&times;</button>
            </div>
          ` : ''}
          ${searchQuery ? `
            <div class="active-pill pill-search">
              <span>🔍 "${searchQuery}"</span>
              <button id="pill-clear-search" title="Suche entfernen">&times;</button>
            </div>
          ` : ''}
        `;
      }
    }

    // Wind FAB badge & active state
    const btnFabWind = this.container.querySelector('#btn-fab-wind');
    if (btnFabWind) {
      if (windFilter && windFilter.length > 0) {
        btnFabWind.classList.add('fab-active');
        let badge = btnFabWind.querySelector('.fab-badge');
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'fab-badge';
          btnFabWind.appendChild(badge);
        }
        badge.textContent = windFilter.length;
      } else {
        btnFabWind.classList.remove('fab-active');
        const badge = btnFabWind.querySelector('.fab-badge');
        if (badge) badge.remove();
      }
    }

    // Compass buttons in wind drawer
    this.container.querySelectorAll('.compass-btn').forEach(btn => {
      const d = btn.getAttribute('data-wind');
      if (windFilter && windFilter.includes(d)) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Reset button in wind drawer
    const resetWindWrapper = this.container.querySelector('#wind-drawer-reset-wrapper');
    if (resetWindWrapper) {
      resetWindWrapper.style.display = (windFilter && windFilter.length > 0) ? 'block' : 'none';
    }

    // Layer checkboxes sync
    if (layers) {
      this.container.querySelectorAll('input[data-layer]').forEach(input => {
        const key = input.getAttribute('data-layer');
        if (typeof layers[key] === 'boolean') {
          input.checked = layers[key];
        }
      });
    }

    // Meteo mode pills sync
    if (state.meteoMode) {
      this.container.querySelectorAll('.meteo-pill').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-meteo-mode') === state.meteoMode);
      });
    }

    // Basemap cards sync
    if (baseMap) {
      this.container.querySelectorAll('.basemap-card').forEach(card => {
        const key = card.getAttribute('data-base');
        if (key === baseMap) {
          card.classList.add('active');
        } else {
          card.classList.remove('active');
        }
      });
    }

    // Map Category tabs & panes sync
    if (state.mapCategory) {
      this.container.querySelectorAll('.drawer-cat-pill').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-map-category') === state.mapCategory);
      });
      this.container.querySelectorAll('.drawer-tab-pane').forEach(pane => {
        const matches = pane.getAttribute('data-pane') === state.mapCategory;
        pane.classList.toggle('active', matches);
        pane.classList.toggle('hidden', !matches);
      });
      const dabsBtn = this.container.querySelector('#btn-floating-dabs');
      if (dabsBtn) {
        dabsBtn.classList.toggle('hidden', state.mapCategory !== 'AIRSPACE');
      }
    }
  }
}
