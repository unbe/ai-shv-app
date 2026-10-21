import { getTranslation } from './i18n/index.js';

class AppState {
  constructor() {
    this.listeners = new Set();

    // Load persisted settings
    const savedLang = localStorage.getItem('shv_lang') || 'de';
    const savedTheme = localStorage.getItem('shv_theme') || 'dark';
    const savedLogs = this.loadSavedLogs();
    const savedProfile = this.loadSavedProfile();

    this.state = {
      activeTab: 'map', // 'map' | 'weather' | 'forecast' | 'safety' | 'profile'
      lang: savedLang,
      theme: savedTheme,
      
      // Map configuration
      baseMap: 'topoColor', // 'topoColor' | 'topoSatellite' | 'topoLight' | 'topoOsm'
      layers: {
        launches: true,
        landings: true,
        airspace: true,
        wildschutz: true,
        stations: false,
        webcams: false,
        foehnAxis: true,
      },
      searchQuery: '',
      windFilter: [], // e.g. ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
      selectedSite: null,
      selectedStation: null,
      selectedWebcam: null,
      pilotLocation: null,

      // Live data
      measurements: null,
      webcams: null,
      foehn: null,
      emagram: null,

      // Pilot profile
      profile: savedProfile,

      // Safety & Checklist
      checklist: {
        p1: false,
        p2: false,
        p3: false,
        p4: false,
        p5: false,
      },

      // Flight Logbook
      flights: savedLogs,

      // Audio Vario
      varioRate: 1.2, // m/s
      varioMuted: true,
    };
  }

  loadSavedLogs() {
    try {
      const data = localStorage.getItem('shv_flights');
      if (data) return JSON.parse(data);
    } catch (e) {}

    // Default sample flights in Switzerland
    return [
      {
        id: 'f-1',
        date: '2026-10-18',
        site: 'Interlaken - Amisbühl (Beatenberg)',
        landing: 'Höhematte Interlaken',
        glider: 'Advance Iota DLS',
        duration: 85,
        maxAlt: 2150,
        distance: 28.4,
        type: 'Thermik / Soaring',
        notes: 'Herrlicher Herbstflug mit Blick auf Eiger, Mönch und Jungfrau. Traumhafte Basis bei 2150m.',
      },
      {
        id: 'f-2',
        date: '2026-10-12',
        site: 'Fiesch - Fiescheralp',
        landing: 'Fiesch Landeplatz',
        glider: 'Advance Iota DLS',
        duration: 145,
        maxAlt: 3420,
        distance: 64.2,
        type: 'Streckenflug (XC)',
        notes: 'Aletschgletscher Querung Richtung Grimselpass. Wunderbares Steigen im Bellwald Kessel.',
      },
      {
        id: 'f-3',
        date: '2026-09-28',
        site: 'Engelberg - Brunni Brunnihütte',
        landing: 'Sportplatz Engelberg',
        glider: 'Advance Iota DLS',
        duration: 55,
        maxAlt: 2300,
        distance: 14.5,
        type: 'Lokale Thermik',
        notes: 'Ruhige Abendthermik am Rigidalstock.',
      },
    ];
  }

  loadSavedProfile() {
    try {
      const data = localStorage.getItem('shv_profile');
      if (data) return JSON.parse(data);
    } catch (e) {}

    return {
      shvNumber: '58412',
      firstName: 'Marco',
      lastName: 'Odermatt',
      birthDate: '12.05.1992',
      canton: 'BE',
      memberCategory: 'Aktivmitglied Pilot',
      ratings: ['Brevet Gleitschirm', 'IPPI Card Stage 5', 'Passagierberechtigung BAX'],
      validUntil: '31.12.2027',
      club: 'Gleitschirmclub Jungfrau',
      insuranceCompany: 'Generali Versicherungen / SHV Kollektiv',
      insuranceCoverage: 'CHF 10\'000\'000.-',
      token: 'SHV-CH-58412-V27-991A',
    };
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  get t() {
    return getTranslation(this.state.lang);
  }

  setTab(tab) {
    this.state.activeTab = tab;
    this.notify();
  }

  setLang(lang) {
    this.state.lang = lang;
    localStorage.setItem('shv_lang', lang);
    this.notify();
  }

  setTheme(theme) {
    this.state.theme = theme;
    localStorage.setItem('shv_theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    this.notify();
  }

  setBaseMap(baseMap) {
    this.state.baseMap = baseMap;
    this.notify();
  }

  toggleLayer(layerKey) {
    if (this.state.layers.hasOwnProperty(layerKey)) {
      this.state.layers[layerKey] = !this.state.layers[layerKey];
      this.notify();
    }
  }

  setSearchQuery(q) {
    this.state.searchQuery = q;
    this.notify();
  }

  toggleWindFilter(dir) {
    const idx = this.state.windFilter.indexOf(dir);
    if (idx >= 0) {
      this.state.windFilter.splice(idx, 1);
    } else {
      this.state.windFilter.push(dir);
    }
    this.notify();
  }

  clearWindFilter() {
    this.state.windFilter = [];
    this.notify();
  }

  selectSite(site) {
    this.state.selectedSite = site;
    this.notify();
  }

  selectStation(st) {
    this.state.selectedStation = st;
    this.notify();
  }

  selectWebcam(wc) {
    this.state.selectedWebcam = wc;
    this.notify();
  }

  setPilotLocation(latLng) {
    this.state.pilotLocation = latLng;
    this.notify();
  }

  setChecklistPoint(key, value) {
    this.state.checklist[key] = value;
    this.notify();
  }

  checkAllChecklist() {
    Object.keys(this.state.checklist).forEach(k => {
      this.state.checklist[k] = true;
    });
    this.notify();
  }

  resetChecklist() {
    Object.keys(this.state.checklist).forEach(k => {
      this.state.checklist[k] = false;
    });
    this.notify();
  }

  addFlight(flight) {
    this.state.flights.unshift(flight);
    localStorage.setItem('shv_flights', JSON.stringify(this.state.flights));
    this.notify();
  }

  updateProfile(profile) {
    this.state.profile = { ...this.state.profile, ...profile };
    localStorage.setItem('shv_profile', JSON.stringify(this.state.profile));
    this.notify();
  }

  setProfilePreset(presetName) {
    if (presetName === 'tandem') {
      this.updateProfile({
        shvNumber: '42199',
        firstName: 'Christian',
        lastName: 'Maurer',
        birthDate: '27.07.1982',
        ratings: ['Brevet Gleitschirm', 'Passagierberechtigung BIX', 'Fluglehrer SHV', 'IPPI Card Stage 5'],
        club: 'Gleitschirmclub Frutigen',
      });
    } else if (presetName === 'student') {
      this.updateProfile({
        shvNumber: '79201',
        firstName: 'Laura',
        lastName: 'Zenger',
        birthDate: '15.09.2003',
        ratings: ['Aspirant Gleitschirm (Schülerkontrollheft)'],
        club: 'Fluggruppe Aletsch',
      });
    } else {
      this.updateProfile({
        shvNumber: '58412',
        firstName: 'Marco',
        lastName: 'Odermatt',
        birthDate: '12.05.1992',
        ratings: ['Brevet Gleitschirm', 'IPPI Card Stage 5', 'Passagierberechtigung BAX'],
        club: 'Gleitschirmclub Jungfrau',
      });
    }
  }

  setVarioRate(rate) {
    this.state.varioRate = Math.round(rate * 10) / 10;
    this.notify();
  }

  setVarioMuted(muted) {
    this.state.varioMuted = muted;
    this.notify();
  }
}

export const store = new AppState();
