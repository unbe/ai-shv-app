import { store } from '../state.js';

export function renderHeader(container) {
  const { lang, theme, foehn } = store.state;
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
          <img src="/assets/ic_launcher.png" alt="SHV Logo" class="brand-logo" />
          <div class="brand-text">
            <span class="brand-title">${t.appName}</span>
            <span class="brand-sub">${t.appSub}</span>
          </div>
        </div>
      </div>

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
