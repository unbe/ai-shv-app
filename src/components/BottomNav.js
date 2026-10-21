import { store } from '../state.js';

export function renderBottomNav(container) {
  const { activeTab } = store.state;
  const t = store.t;

  const tabs = [
    {
      id: 'map',
      label: t.tabs.map,
      icon: `
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"></polygon>
          <line x1="8" y1="2" x2="8" y2="18"></line>
          <line x1="16" y1="6" x2="16" y2="22"></line>
        </svg>
      `,
    },
    {
      id: 'weather',
      label: t.tabs.weather,
      icon: `
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"></path>
          <line x1="17.7" y1="7.7" x2="21" y2="7.7"></line>
          <line x1="17.7" y1="11.7" x2="23" y2="11.7"></line>
        </svg>
      `,
    },
    {
      id: 'forecast',
      label: t.tabs.forecast,
      icon: `
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2v2"></path>
          <path d="m4.93 4.93 1.41 1.41"></path>
          <path d="M20 12h2"></path>
          <path d="m19.07 4.93-1.41 1.41"></path>
          <path d="M15.95 11.05a4 4 0 0 0-5.9 0 4 4 0 0 0-2.4 3.75A4.5 4.5 0 0 0 12 19.3a4.5 4.5 0 0 0 4.35-4.5 4 4 0 0 0-.4-3.75z"></path>
        </svg>
      `,
    },
    {
      id: 'safety',
      label: t.tabs.safety,
      icon: `
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
          <path d="m9 12 2 2 4-4"></path>
        </svg>
      `,
    },
    {
      id: 'profile',
      label: t.tabs.profile,
      icon: `
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect width="20" height="14" x="2" y="5" rx="2"></rect>
          <circle cx="8" cy="12" r="2"></circle>
          <path d="M14 10h4"></path>
          <path d="M14 14h2"></path>
        </svg>
      `,
    },
  ];

  container.innerHTML = `
    <nav class="bottom-nav">
      ${tabs.map(tab => `
        <button class="nav-item ${activeTab === tab.id ? 'active' : ''}" data-tab="${tab.id}">
          <span class="nav-icon">${tab.icon}</span>
          <span class="nav-label">${tab.label}</span>
        </button>
      `).join('')}
    </nav>
  `;

  container.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      store.setTab(tabId);
    });
  });
}
