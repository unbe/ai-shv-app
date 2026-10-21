export class ShvApi {
  static async getFlyingSites() {
    try {
      const resp = await fetch('/data/flyingsites.geojson');
      if (resp.ok) return await resp.json();
    } catch (e) {
      console.warn('Local flying sites load failed, trying live endpoint', e);
    }
    // Fallback direct to live CDN
    const cdnResp = await fetch('https://shv-app-static-prod.ubmeteo.io/v1/flyingsites.geojson');
    return await cdnResp.json();
  }

  static async getAirspaces() {
    try {
      const resp = await fetch('/data/airspaces.geojson');
      if (resp.ok) return await resp.json();
    } catch (e) {}
    const cdnResp = await fetch('https://shv-app-static-prod.ubmeteo.io/v1/airspaces/shv.geojson');
    return await cdnResp.json();
  }

  static async getWildschutz() {
    try {
      const resp = await fetch('/data/wildschutz.geojson');
      if (resp.ok) return await resp.json();
    } catch (e) {}
    const cdnResp = await fetch('https://shv-app-static-prod.ubmeteo.io/v1/wildschutz/shv.geojson');
    return await cdnResp.json();
  }

  static async getMeasurements() {
    try {
      const resp = await fetch('/api/measurements');
      if (resp.ok) return await resp.json();
    } catch (e) {
      console.warn('API measurements failed', e);
    }
    return null;
  }

  static async getWebcams() {
    try {
      const resp = await fetch('/api/webcams');
      if (resp.ok) return await resp.json();
    } catch (e) {
      console.warn('API webcams failed', e);
    }
    return null;
  }

  static async getFoehn() {
    try {
      const resp = await fetch('/api/foehn');
      if (resp.ok) return await resp.json();
    } catch (e) {
      console.warn('API foehn failed', e);
    }
    return null;
  }

  static async getEmagramSounding() {
    try {
      const resp = await fetch('/api/emagram/sounding');
      if (resp.ok) return await resp.json();
    } catch (e) {
      console.warn('API emagram failed', e);
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
    } catch (e) {
      console.warn('Calculate emagram failed', e);
    }
    return null;
  }

  static async getDabs() {
    try {
      const resp = await fetch('/api/dabs');
      if (resp.ok) return await resp.json();
    } catch (e) {}
    return null;
  }
}
