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
    // Initial fetch of background Foehn data for header pill
    try {
      const foehnData = await ShvApi.getFoehn();
      store.state.foehn = foehnData;
    } catch (e) {}

    // Initial render
    this.renderShell();
    this.switchView(store.state.activeTab);

    // Subscribe to state updates
    store.subscribe((state) => {
      // Re-render shell if language or theme changed
      if (state.lang !== this.lang || state.theme !== this.theme) {
        this.renderShell();
      }

      // Re-render bottom nav if active tab changed
      if (state.activeTab !== this.activeTab) {
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
  }
}

// Bootstrap
window.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init();
});
