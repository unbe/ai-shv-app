// In-memory cache for static spatial datasets to prevent repeat download delays
let cachedFlyingSites = null;
let cachedAirspaces = null;
let cachedWildschutz = null;

export class ShvApi {
  static async getFlyingSites() {
    if (cachedFlyingSites) return cachedFlyingSites;
    try {
      const resp = await fetch('/data/flyingsites.geojson');
      if (resp.ok) {
        cachedFlyingSites = await resp.json();
        return cachedFlyingSites;
      }
      console.warn('[ShvApi.getFlyingSites] Local fetch returned status:', resp.status);
    } catch (e) {
      console.warn('[ShvApi.getFlyingSites] Local fetch failed, trying live CDN fallback:', e);
    }
    try {
      const cdnResp = await fetch('https://shv-app-static-prod.ubmeteo.io/v1/flyingsites.geojson');
      if (!cdnResp.ok) throw new Error(`CDN status ${cdnResp.status}`);
      cachedFlyingSites = await cdnResp.json();
      return cachedFlyingSites;
    } catch (err) {
      console.error('[ShvApi.getFlyingSites] Failed to load flying sites from both local and CDN:', err);
      throw err;
    }
  }

  static async getAirspaces() {
    if (cachedAirspaces) return cachedAirspaces;
    try {
      const resp = await fetch('/data/airspaces.geojson');
      if (resp.ok) {
        cachedAirspaces = await resp.json();
        return cachedAirspaces;
      }
      console.warn('[ShvApi.getAirspaces] Local fetch returned status:', resp.status);
    } catch (e) {
      console.warn('[ShvApi.getAirspaces] Local fetch failed, trying live CDN fallback:', e);
    }
    try {
      const cdnResp = await fetch('https://shv-app-static-prod.ubmeteo.io/v1/airspaces/shv.geojson');
      if (!cdnResp.ok) throw new Error(`CDN status ${cdnResp.status}`);
      cachedAirspaces = await cdnResp.json();
      return cachedAirspaces;
    } catch (err) {
      console.error('[ShvApi.getAirspaces] Failed to load airspaces from both local and CDN:', err);
      throw err;
    }
  }

  static async getWildschutz() {
    if (cachedWildschutz) return cachedWildschutz;
    try {
      const resp = await fetch('/data/wildschutz.geojson');
      if (resp.ok) {
        cachedWildschutz = await resp.json();
        return cachedWildschutz;
      }
      console.warn('[ShvApi.getWildschutz] Local fetch returned status:', resp.status);
    } catch (e) {
      console.warn('[ShvApi.getWildschutz] Local fetch failed, trying live CDN fallback:', e);
    }
    try {
      const cdnResp = await fetch('https://shv-app-static-prod.ubmeteo.io/v1/wildschutz/shv.geojson');
      if (!cdnResp.ok) throw new Error(`CDN status ${cdnResp.status}`);
      cachedWildschutz = await cdnResp.json();
      return cachedWildschutz;
    } catch (err) {
      console.error('[ShvApi.getWildschutz] Failed to load wildschutz from both local and CDN:', err);
      throw err;
    }
  }

  static async getMeasurements() {
    try {
      const resp = await fetch('/api/measurements');
      if (resp.ok) return await resp.json();
      console.error('[ShvApi.getMeasurements] HTTP error:', resp.status, resp.statusText);
    } catch (e) {
      console.error('[ShvApi.getMeasurements] Network error:', e);
    }
    return null;
  }

  static async getWebcams() {
    try {
      const resp = await fetch('/api/webcams');
      if (resp.ok) return await resp.json();
      console.error('[ShvApi.getWebcams] HTTP error:', resp.status, resp.statusText);
    } catch (e) {
      console.error('[ShvApi.getWebcams] Network error:', e);
    }
    return null;
  }

  static async getFoehn() {
    try {
      const resp = await fetch('/api/foehn');
      if (resp.ok) return await resp.json();
      console.error('[ShvApi.getFoehn] HTTP error:', resp.status, resp.statusText);
    } catch (e) {
      console.error('[ShvApi.getFoehn] Network error:', e);
    }
    return null;
  }

  static async getEmagramSounding() {
    try {
      const resp = await fetch('/api/emagram/sounding');
      if (resp.ok) return await resp.json();
      console.error('[ShvApi.getEmagramSounding] HTTP error:', resp.status, resp.statusText);
    } catch (e) {
      console.error('[ShvApi.getEmagramSounding] Network error:', e);
    }
    return null;
  }

  static async calculateEmagram(surfaceTempC, surfaceDewC) {
    try {
      const resp = await fetch('/api/emagram/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          surface_temp_c: surfaceTempC,
          surface_dew_c: surfaceDewC,
        }),
      });
      if (resp.ok) return await resp.json();
      console.error('[ShvApi.calculateEmagram] HTTP error:', resp.status, resp.statusText);
    } catch (e) {
      console.error('[ShvApi.calculateEmagram] Network error:', e);
    }
    return null;
  }

  static async getDabs() {
    try {
      const resp = await fetch('/api/dabs');
      if (resp.ok) return await resp.json();
      console.error('[ShvApi.getDabs] HTTP error:', resp.status, resp.statusText);
    } catch (e) {
      console.error('[ShvApi.getDabs] Network error:', e);
    }
    return null;
  }

  // --- SHV OIDC Member Authentication (Option A) ---

  static async authStart() {
    const resp = await fetch('/api/auth/start', { method: 'POST' });
    if (!resp.ok) {
      throw new Error(`Fehler beim Starten der Authentifizierung (${resp.status})`);
    }
    return await resp.json();
  }

  static async authExchange(callbackUrl) {
    const resp = await fetch('/api/auth/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callbackUrl }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      throw new Error(data.error || `Token-Austausch fehlgeschlagen (${resp.status})`);
    }
    return data;
  }

  static async getAuthProfile(sid) {
    if (!sid) return null;
    const resp = await fetch('/api/auth/profile', {
      headers: { 'X-Session-ID': sid },
    });
    if (!resp.ok) {
      if (resp.status === 401) return null;
      throw new Error(`Profilabruf fehlgeschlagen (${resp.status})`);
    }
    return await resp.json();
  }

  static async authLogout(sid) {
    if (!sid) return;
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'X-Session-ID': sid },
      });
    } catch (e) {
      console.warn('[ShvApi.authLogout] Error logging out on server:', e);
    }
  }
}
