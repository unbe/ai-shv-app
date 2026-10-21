import { getTranslation } from './i18n/index.js';

class AppState {
  constructor() {
    this.listeners = new Set();

    // Load persisted settings
    const savedLang = localStorage.getItem('shv_lang') || 'de';
    const savedTheme = localStorage.getItem('shv_theme') || 'dark';
    const savedLogs = this.loadSavedLogs();
    const savedSession = localStorage.getItem('shv_session_id') || null;
    const savedProfile = this.loadSavedProfile();

    this.state = {
      activeTab: 'map', // 'map' | 'weather' | 'forecast' | 'safety' | 'profile'
      lang: savedLang,
      theme: savedTheme,
      sid: savedSession,
      
      // Map configuration
      baseMap: 'topoColor', // 'topoColor' | 'topoSatellite' | 'topoLight' | 'topoOsm'
      meteoMode: 'WIND', // 'WIND' | 'TEMPERATURE' | 'PRESSURE_DIFFERENCE' | 'WEBCAM' | 'NONE'
      layers: {
        launches: true,
        landings: true,
        airspace: true,
        wildschutz: true,
        stations: true,
        webcams: false,
        foehnAxis: false,
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
    } catch (e) {
      console.error('[AppState.loadSavedLogs] Failed to parse saved flights from localStorage:', e);
    }
    return [];
  }

  loadSavedProfile() {
    try {
      const raw = localStorage.getItem('shv_profile');
      if (!raw) return null;
      const data = JSON.parse(raw);
      // Purge any previously synthesized dummy/rubbish profile data
      if (!data || data.firstName === 'Pilot' || !data.firstName) {
        localStorage.removeItem('shv_profile');
        return null;
      }
      return data;
    } catch (e) {
      console.error('[AppState.loadSavedProfile] Failed to parse saved profile from localStorage:', e);
      localStorage.removeItem('shv_profile');
      return null;
    }
  }

  setSession(sid, profile) {
    this.state.sid = sid;
    this.state.profile = profile;
    if (sid) {
      localStorage.setItem('shv_session_id', sid);
    } else {
      localStorage.removeItem('shv_session_id');
    }
    if (profile) {
      localStorage.setItem('shv_profile', JSON.stringify(profile));
    } else {
      localStorage.removeItem('shv_profile');
    }
    this.notify();
  }

  setProfile(profile) {
    this.state.profile = profile;
    if (profile) {
      localStorage.setItem('shv_profile', JSON.stringify(profile));
    } else {
      localStorage.removeItem('shv_profile');
    }
    this.notify();
  }

  logout() {
    this.setSession(null, null);
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    const listenersCopy = Array.from(this.listeners);
    for (const listener of listenersCopy) {
      try {
        listener(this.state);
      } catch (err) {
        console.error('[AppState.notify] Listener threw error:', err);
      }
    }
  }

  notifyTabRepeat(tab) {
    const listenersCopy = Array.from(this.listeners);
    for (const listener of listenersCopy) {
      try {
        listener(this.state, { type: 'TAB_REPEAT', tab });
      } catch (err) {
        console.error('[AppState.notifyTabRepeat] Listener threw error:', err);
      }
    }
  }

  get t() {
    return getTranslation(this.state.lang);
  }

  setTab(tab) {
    if (this.state.activeTab === tab) {
      if (tab === 'map') {
        this.resetMapState();
      }
      this.notifyTabRepeat(tab);
      return;
    }
    this.state.activeTab = tab;
    this.notify();
  }

  resetMapState() {
    this.state.searchQuery = '';
    this.state.windFilter = [];
    this.state.selectedSite = null;
    this.state.selectedStation = null;
    this.state.selectedWebcam = null;
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

  setMeteoMode(mode) {
    this.state.meteoMode = mode;
    if (mode === 'WIND' || mode === 'TEMPERATURE') {
      this.state.layers.stations = true;
      this.state.layers.webcams = false;
      this.state.layers.foehnAxis = false;
    } else if (mode === 'PRESSURE_DIFFERENCE') {
      this.state.layers.stations = false;
      this.state.layers.webcams = false;
      this.state.layers.foehnAxis = true;
    } else if (mode === 'WEBCAM') {
      this.state.layers.stations = false;
      this.state.layers.webcams = true;
      this.state.layers.foehnAxis = false;
    } else if (mode === 'NONE') {
      this.state.layers.stations = false;
      this.state.layers.webcams = false;
      this.state.layers.foehnAxis = false;
    }
    this.notify();
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
