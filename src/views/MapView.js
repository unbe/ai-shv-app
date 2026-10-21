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
    const { layers, baseMap, windFilter, searchQuery } = store.state;

    const windDirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

    this.container.innerHTML = `
      <div class="map-view-wrapper">
        <!-- 1. Top Search Bar & Active Filter Pills -->
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
          <!-- Layers & Basemap FAB -->
          <button id="btn-fab-layers" class="map-fab" title="Ebenen & Basiskarte">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
              <polyline points="2 17 12 22 22 17"></polyline>
              <polyline points="2 12 12 17 22 12"></polyline>
            </svg>
          </button>

          <!-- Wind Compass Filter FAB -->
          <button id="btn-fab-wind" class="map-fab ${windFilter.length > 0 ? 'fab-active' : ''}" title="Windfilter">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon>
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

        <!-- 3. Layers & Basemaps Flyout Drawer -->
        <div id="map-layers-drawer" class="map-drawer hidden">
          <div class="drawer-header">
            <h3>Ebenen & Basiskarte</h3>
            <button class="drawer-close" id="btn-close-layers">&times;</button>
          </div>
          <div class="drawer-body">
            <!-- Basemap Section -->
            <div class="drawer-section">
              <h4 class="drawer-subtitle">Basiskarte</h4>
              <div class="basemap-grid">
                <button data-base="topoColor" class="basemap-card ${baseMap === 'topoColor' ? 'active' : ''}">
                  <img src="/assets/ic_topo_raster.png" alt="Topo" class="basemap-card-img" />
                  <span>Pixelkarte</span>
                </button>
                <button data-base="topoSatellite" class="basemap-card ${baseMap === 'topoSatellite' ? 'active' : ''}">
                  <img src="/assets/ic_topo_imagery.png" alt="Luftbild" class="basemap-card-img" />
                  <span>Luftbild</span>
                </button>
                <button data-base="topoLight" class="basemap-card ${baseMap === 'topoLight' ? 'active' : ''}">
                  <img src="/assets/ic_topo_light.png" alt="Grau" class="basemap-card-img" />
                  <span>Grau</span>
                </button>
                <button data-base="topoOsm" class="basemap-card ${baseMap === 'topoOsm' ? 'active' : ''}">
                  <div class="basemap-osm-placeholder">OSM</div>
                  <span>OpenStreet</span>
                </button>
              </div>
            </div>

            <!-- Overlays Section -->
            <div class="drawer-section">
              <h4 class="drawer-subtitle">Kartenebenen</h4>
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
                    <span>Wildruhezonen (300m AGL)</span>
                  </div>
                  <input type="checkbox" data-layer="wildschutz" ${layers.wildschutz ? 'checked' : ''} />
                  <span class="switch-toggle"></span>
                </label>

                <label class="layer-switch-item">
                  <div class="layer-switch-label">
                    <span class="chip-dot dot-station"></span>
                    <span>Wetterstationen & Wind</span>
                  </div>
                  <input type="checkbox" data-layer="stations" ${layers.stations ? 'checked' : ''} />
                  <span class="switch-toggle"></span>
                </label>

                <label class="layer-switch-item">
                  <div class="layer-switch-label">
                    <span class="chip-dot" style="background: #EF4444;"></span>
                    <span>Föhn-Achse (Gotthard)</span>
                  </div>
                  <input type="checkbox" data-layer="foehnAxis" ${layers.foehnAxis ? 'checked' : ''} />
                  <span class="switch-toggle"></span>
                </label>

                <label class="layer-switch-item">
                  <div class="layer-switch-label">
                    <span class="chip-dot dot-webcam"></span>
                    <span>Webcams</span>
                  </div>
                  <input type="checkbox" data-layer="webcams" ${layers.webcams ? 'checked' : ''} />
                  <span class="switch-toggle"></span>
                </label>
              </div>
            </div>
          </div>
        </div>

        <!-- 4. Wind Compass Selector Drawer -->
        <div id="map-wind-drawer" class="map-drawer hidden">
          <div class="drawer-header">
            <h3>Startplatz Windfilter</h3>
            <button class="drawer-close" id="btn-close-wind">&times;</button>
          </div>
          <div class="drawer-body">
            <p class="drawer-hint">Wähle Windrichtungen aus, um nur passende Startplätze zu sehen:</p>
            <div class="compass-rose-grid">
              ${windDirs.map(d => `
                <button data-wind="${d}" class="compass-btn ${windFilter.includes(d) ? 'active' : ''}">
                  ${d}
                </button>
              `).join('')}
            </div>
            <div id="wind-drawer-reset-wrapper" style="display: ${windFilter.length > 0 ? 'block' : 'none'};" class="text-center mt-3">
              <button id="btn-reset-wind-filter" class="btn-secondary" style="width: 100%;">Filter zurücksetzen</button>
            </div>
          </div>
        </div>

        <!-- Leaflet Map Container -->
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
    const btnFabWind = this.container.querySelector('#btn-fab-wind');
    const btnFabCenter = this.container.querySelector('#btn-fab-center');
    const layersDrawer = this.container.querySelector('#map-layers-drawer');
    const windDrawer = this.container.querySelector('#map-wind-drawer');

    if (btnFabLayers && layersDrawer) {
      btnFabLayers.addEventListener('click', (e) => {
        e.stopPropagation();
        layersDrawer.classList.toggle('hidden');
        if (windDrawer) windDrawer.classList.add('hidden');
      });
    }

    if (btnFabWind && windDrawer) {
      btnFabWind.addEventListener('click', (e) => {
        e.stopPropagation();
        windDrawer.classList.toggle('hidden');
        if (layersDrawer) layersDrawer.classList.add('hidden');
      });
    }

    const closeLayers = this.container.querySelector('#btn-close-layers');
    if (closeLayers && layersDrawer) {
      closeLayers.addEventListener('click', () => layersDrawer.classList.add('hidden'));
    }

    const closeWind = this.container.querySelector('#btn-close-wind');
    if (closeWind && windDrawer) {
      closeWind.addEventListener('click', () => windDrawer.classList.add('hidden'));
    }

    // Prevent map click when interacting inside drawers
    if (layersDrawer) layersDrawer.addEventListener('click', (e) => e.stopPropagation());
    if (windDrawer) windDrawer.addEventListener('click', (e) => e.stopPropagation());

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
    if (layers.launches) this.launchesLayer.addTo(this.map);
    if (layers.landings) this.landingsLayer.addTo(this.map);
    if (layers.stations) this.stationsLayer.addTo(this.map);
    if (layers.webcams) this.webcamsLayer.addTo(this.map);
    if (layers.foehnAxis) this.foehnLayer.addTo(this.map);

    // Click outside deselects and closes flyout drawers
    this.map.on('click', (e) => {
      const layersDrawer = this.container.querySelector('#map-layers-drawer');
      const windDrawer = this.container.querySelector('#map-wind-drawer');
      if (layersDrawer) layersDrawer.classList.add('hidden');
      if (windDrawer) windDrawer.classList.add('hidden');

      // If clicked on empty space, deselect
      if (!e.originalEvent._shvHandled) {
        store.selectSite(null);
        store.selectStation(null);
        store.selectWebcam(null);
      }
    });
  }

  async loadData() {
    try {
      // 1. Flying sites
      this.rawFlyingSites = await ShvApi.getFlyingSites();
      this.renderFlyingSites();

      // 2. Airspaces
      this.rawAirspaces = await ShvApi.getAirspaces();
      if (this.rawAirspaces) {
        this.airspaceLayer.addData(this.rawAirspaces);
      }

      // 3. Wildlife zones
      this.rawWildschutz = await ShvApi.getWildschutz();
      if (this.rawWildschutz) {
        this.wildschutzLayer.addData(this.rawWildschutz);
      }

      // 4. Weather stations & measurements
      this.rawMeasurements = await ShvApi.getMeasurements();
      store.state.measurements = this.rawMeasurements;
      this.renderStations();

      // 5. Foehn pressure differences
      const foehnData = await ShvApi.getFoehn();
      store.state.foehn = foehnData;
      this.renderFoehnAxis(foehnData);

      // 6. Webcams
      this.rawWebcams = await ShvApi.getWebcams();
      store.state.webcams = this.rawWebcams;
      this.renderWebcams();
    } catch (err) {
      console.error('[MapView] Error loading spatial datasets:', err);
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

    const { searchQuery, windFilter } = store.state;
    const query = (searchQuery || '').trim().toLowerCase();

    for (const feature of this.rawFlyingSites.features) {
      const p = feature.properties || {};
      const type = (p.type || '').toLowerCase();
      const isLaunch = type === 'launch' || type === 'launcharea';
      const isLanding = type === 'landing' || type === 'landingarea' || type === 'landingpattern';

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

    for (const f of this.rawMeasurements.features) {
      const coords = f.geometry?.coordinates;
      const p = f.properties || {};
      if (!coords || !p.windSpeedValue) continue;
      if (typeof coords[0] !== 'number' || typeof coords[1] !== 'number' || isNaN(coords[0]) || isNaN(coords[1])) continue;

      const latLng = [coords[1], coords[0]];
      const speedKmH = Math.round(p.windSpeedValue * 3.6);
      const gustKmH = p.windGustValue ? Math.round(p.windGustValue * 3.6) : null;
      const dirDeg = p.windDirectionValue || 0;

      // Color code by wind speed
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

  renderFoehnAxis(foehnData) {
    this.foehnLayer.clearLayers();
    if (!foehnData || !foehnData.primaryPair) return;

    // Gotthard axis transect: Kloten (47.48, 8.536) to Lugano (46.0, 8.96)
    const p1 = [47.48, 8.536]; // Kloten
    const p2 = [46.0, 8.96];   // Lugano
    const mid = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];

    const diff = foehnData.primaryPair.diffHpa;
    const isDanger = foehnData.primaryPair.alertLevel === 'DANGER';
    const isMod = foehnData.primaryPair.alertLevel === 'MODERATE';
    const lineColor = isDanger ? '#EF4444' : isMod ? '#F59E0B' : '#10B981';

    // Polyline connecting North and South
    const polyline = L.polyline([p1, p2], {
      color: lineColor,
      weight: 3.5,
      dashArray: '6, 6',
      opacity: 0.85,
    });
    this.foehnLayer.addLayer(polyline);

    // Midpoint delta badge
    const badgeHtml = `
      <div class="foehn-map-badge ${isDanger ? 'badge-danger' : isMod ? 'badge-warning' : 'badge-safe'}">
        <span>Föhn: ${diff > 0 ? '+' : ''}${diff} hPa</span>
      </div>
    `;

    const badgeIcon = L.divIcon({
      className: 'foehn-badge-icon',
      html: badgeHtml,
      iconSize: [110, 26],
      iconAnchor: [55, 13],
    });

    const badgeMarker = L.marker(mid, { icon: badgeIcon });
    badgeMarker.on('click', () => {
      store.setTab('weather');
    });
    this.foehnLayer.addLayer(badgeMarker);
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
    updateVisibility(this.stationsLayer, state.layers.stations);
    updateVisibility(this.webcamsLayer, state.layers.webcams);
    updateVisibility(this.foehnLayer, state.layers.foehnAxis);

    // 3. Re-filter Flying Sites if search or windFilter changed
    this.renderFlyingSites();

    // 4. Update Filter UI Controls & Pills
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
  }
}
