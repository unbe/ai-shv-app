import { store } from '../state.js';

export function renderHeader(container) {
  const { lang, theme, foehn, activeTab } = store.state;
  const t = store.t;

  // Foehn pill badge
  let foehnBadge = '';
  if (foehn && foehn.primaryPair) {
    const diff = foehn.primaryPair.diffHpa;
    const isDanger = foehn.primaryPair.alertLevel === 'DANGER';
    const isMod = foehn.primaryPair.alertLevel === 'MODERATE';
    const badgeClass = isDanger ? 'badge-danger' : isMod ? 'badge-warning' : 'badge-safe';
    const label = `${diff > 0 ? '+' : ''}${diff} hPa`;
    foehnBadge = `
      <button id="header-foehn-pill" class="foehn-pill ${badgeClass}" title="${foehn.primaryPair.name}">
        <span class="foehn-dot"></span>
        <span>Föhn: ${label}</span>
      </button>
    `;
  }

  container.innerHTML = `
    <header class="app-header">
      <div class="header-left">
        <div class="brand" id="brand-home-btn">
          <img src="/assets/logo.svg" alt="Swiss Free Flight Logo" class="brand-logo" />
          <div class="brand-text">
            <span class="brand-title">${t.appName}</span>
            <span class="brand-sub">${t.appSub}</span>
          </div>
        </div>
      </div>

      <!-- Desktop Web Navigation Bar -->
      <nav class="header-nav-desktop" aria-label="Hauptnavigation">
        <button data-tab="map" class="header-nav-link ${activeTab === 'map' ? 'active' : ''}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"></polygon>
            <line x1="8" y1="2" x2="8" y2="18"></line>
            <line x1="16" y1="6" x2="16" y2="22"></line>
          </svg>
          <span>${t.tabs.map}</span>
        </button>
        <button data-tab="weather" class="header-nav-link ${activeTab === 'weather' ? 'active' : ''}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"></path>
            <line x1="17.7" y1="7.7" x2="21" y2="7.7"></line>
            <line x1="17.7" y1="11.7" x2="23" y2="11.7"></line>
          </svg>
          <span>${t.tabs.weather}</span>
        </button>
        <button data-tab="forecast" class="header-nav-link ${activeTab === 'forecast' ? 'active' : ''}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2v2"></path>
            <path d="m4.93 4.93 1.41 1.41"></path>
            <path d="M20 12h2"></path>
            <path d="m19.07 4.93-1.41 1.41"></path>
            <path d="M15.95 11.05a4 4 0 0 0-5.9 0 4 4 0 0 0-2.4 3.75A4.5 4.5 0 0 0 12 19.3a4.5 4.5 0 0 0 4.35-4.5 4 4 0 0 0-.4-3.75z"></path>
          </svg>
          <span>${t.tabs.forecast}</span>
        </button>
        <button data-tab="safety" class="header-nav-link ${activeTab === 'safety' ? 'active' : ''}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
            <path d="m9 12 2 2 4-4"></path>
          </svg>
          <span>${t.tabs.safety}</span>
        </button>
        <button data-tab="profile" class="header-nav-link ${activeTab === 'profile' ? 'active' : ''}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect width="20" height="14" x="2" y="5" rx="2"></rect>
            <circle cx="8" cy="12" r="2"></circle>
            <path d="M14 10h4"></path>
          </svg>
          <span>${t.tabs.profile}</span>
        </button>
      </nav>

      <div class="header-center">
        ${foehnBadge}
      </div>

      <div class="header-right">
        <!-- GPS Geolocation Button -->
        <button id="btn-gps" class="icon-btn" title="Mein Standort">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="8"></circle>
            <line x1="12" y1="2" x2="12" y2="4"></line>
            <line x1="12" y1="20" x2="12" y2="22"></line>
            <line x1="2" y1="12" x2="4" y2="12"></line>
            <line x1="20" y1="12" x2="22" y2="12"></line>
          </svg>
        </button>

        <!-- Theme Toggle -->
        <button id="btn-theme" class="icon-btn" title="Farbschema">
          ${theme === 'light' ? `
            <!-- Sun icon -->
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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
          ` : `
            <!-- Moon icon -->
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
            </svg>
          `}
        </button>

        <!-- Language Selector -->
        <div class="lang-dropdown">
          <button id="btn-lang" class="lang-btn">
            <span>${lang.toUpperCase()}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
          <div id="lang-menu" class="lang-menu hidden">
            <button data-lang="de" class="${lang === 'de' ? 'active' : ''}">Deutsch (DE)</button>
            <button data-lang="fr" class="${lang === 'fr' ? 'active' : ''}">Français (FR)</button>
            <button data-lang="it" class="${lang === 'it' ? 'active' : ''}">Italiano (IT)</button>
            <button data-lang="en" class="${lang === 'en' ? 'active' : ''}">English (EN)</button>
          </div>
        </div>
      </div>
    </header>
  `;

  // Attach event handlers
  container.querySelectorAll('.header-nav-link').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      if (tab) store.setTab(tab);
    });
  });

  const brandHome = container.querySelector('#brand-home-btn');
  if (brandHome) {
    brandHome.addEventListener('click', () => store.setTab('map'));
  }

  const foehnPill = container.querySelector('#header-foehn-pill');
  if (foehnPill) {
    foehnPill.addEventListener('click', () => store.setTab('weather'));
  }

  const btnTheme = container.querySelector('#btn-theme');
  if (btnTheme) {
    btnTheme.addEventListener('click', () => {
      const nextTheme = theme === 'dark' ? 'light' : 'dark';
      store.setTheme(nextTheme);
    });
  }

  const btnGps = container.querySelector('#btn-gps');
  if (btnGps) {
    btnGps.addEventListener('click', () => {
      if ('geolocation' in navigator) {
        btnGps.classList.add('spinning');
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            btnGps.classList.remove('spinning');
            store.setPilotLocation({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
            });
            if (store.state.activeTab !== 'map') {
              store.setTab('map');
            }
          },
          (err) => {
            btnGps.classList.remove('spinning');
            console.warn('Geolocation error:', err);
            // Default center of Switzerland (Flüeli-Ranft / Älggialp)
            store.setPilotLocation({ lat: 46.8012, lng: 8.2267 });
          },
          { enableHighAccuracy: true, timeout: 6000 }
        );
      }
    });
  }

  const btnLang = container.querySelector('#btn-lang');
  const langMenu = container.querySelector('#lang-menu');
  if (btnLang && langMenu) {
    btnLang.addEventListener('click', (e) => {
      e.stopPropagation();
      langMenu.classList.toggle('hidden');
    });

    langMenu.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    langMenu.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        const selectedLang = btn.getAttribute('data-lang');
        store.setLang(selectedLang);
        langMenu.classList.add('hidden');
      });
    });

    // Close when clicking anywhere outside the language dropdown
    document.addEventListener('click', (e) => {
      if (!btnLang.contains(e.target) && !langMenu.contains(e.target)) {
        langMenu.classList.add('hidden');
      }
    });
  }
}
