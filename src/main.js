import 'leaflet/dist/leaflet.css';
import { store } from './state.js';
import { renderHeader } from './components/Header.js';
import { renderBottomNav } from './components/BottomNav.js';
import { renderBottomSheet } from './components/BottomSheet.js';
import { MapView } from './views/MapView.js';
import { WeatherView } from './views/WeatherView.js';
import { ForecastView } from './views/ForecastView.js';
import { SafetyView } from './views/SafetyView.js';
import { renderProfileView } from './views/ProfileView.js';
import { ShvApi } from './services/api.js';

export const storeInstance = store;
if (typeof window !== 'undefined') {
  window.appStore = store;
}

// Global error monitoring to prevent any errors from being swallowed
window.addEventListener('error', (event) => {
  console.error('[Global Error]', event.error || event.message, {
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
  });
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[Unhandled Promise Rejection]', event.reason);
});

class App {
  constructor() {
    this.headerContainer = document.getElementById('header-container');
    this.viewContainer = document.getElementById('view-container');
    this.bottomSheetContainer = document.getElementById('bottom-sheet-container');
    this.bottomNavContainer = document.getElementById('bottom-nav-container');

    this.currentViewInstance = null;
    this.activeTab = null;
    this.lang = null;
    this.theme = null;
  }

  async init() {
    // 1. Render UI immediately so app is instantly interactive
    this.renderShell();
    this.switchView(store.state.activeTab);

    // 2. Fetch background Foehn data for header pill asynchronously
    ShvApi.getFoehn()
      .then((foehnData) => {
        if (foehnData) {
          store.state.foehn = foehnData;
          renderHeader(this.headerContainer);
        }
      })
      .catch((e) => {
        console.error('[App.init] Failed to fetch background foehn data:', e);
      });

    // 3. Subscribe to state updates
    store.subscribe((state, meta) => {
      // Handle repeat clicks on active tab (e.g. clicking Live-Karte resets map)
      if (meta && meta.type === 'TAB_REPEAT') {
        if (meta.tab === 'map') {
          if (this.currentViewInstance && typeof this.currentViewInstance.resetView === 'function') {
            this.currentViewInstance.resetView();
          }
        }
        return;
      }

      // Re-render shell if language or theme changed
      if (state.lang !== this.lang || state.theme !== this.theme) {
        this.renderShell();
      }

      // Re-render header & bottom nav if active tab changed
      if (state.activeTab !== this.activeTab) {
        renderHeader(this.headerContainer);
        renderBottomNav(this.bottomNavContainer);
        this.switchView(state.activeTab);
      }

      // Re-render bottom sheet
      renderBottomSheet(this.bottomSheetContainer);
    });
  }

  renderShell() {
    this.lang = store.state.lang;
    this.theme = store.state.theme;

    // Apply document theme
    document.documentElement.setAttribute('data-theme', this.theme);
    document.documentElement.setAttribute('lang', this.lang);

    renderHeader(this.headerContainer);
    renderBottomNav(this.bottomNavContainer);
    renderBottomSheet(this.bottomSheetContainer);
  }

  switchView(tab) {
    try {
      if (this.currentViewInstance && typeof this.currentViewInstance.unmount === 'function') {
        this.currentViewInstance.unmount();
      }
      this.currentViewInstance = null;
      this.activeTab = tab;
      this.viewContainer.innerHTML = '';

      switch (tab) {
        case 'map':
          this.currentViewInstance = new MapView(this.viewContainer);
          this.currentViewInstance.mount();
          break;
        case 'weather':
          this.currentViewInstance = new WeatherView(this.viewContainer);
          this.currentViewInstance.mount();
          break;
        case 'forecast':
          this.currentViewInstance = new ForecastView(this.viewContainer);
          this.currentViewInstance.mount();
          break;
        case 'safety':
          this.currentViewInstance = new SafetyView(this.viewContainer);
          this.currentViewInstance.mount();
          break;
        case 'profile':
          renderProfileView(this.viewContainer);
          break;
        default:
          this.currentViewInstance = new MapView(this.viewContainer);
          this.currentViewInstance.mount();
          break;
      }
    } catch (err) {
      console.error(`[App.switchView] Error mounting view "${tab}":`, err);
    }
  }
}

// Bootstrap
window.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init();
});
