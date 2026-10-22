/**
 * Emagram & Previtemps Sounding Forecast Provider
 * Connects directly to Ubique Fluid Meteo Services and MeteoSwiss ICON-CH1.
 * Fetches vertical soundings (temperature, dew point, pressure, wind) across hourly time steps.
 */

const tileCache = new Map();
let runsCache = { run: null, timestamp: 0 };
const soundingCache = new Map();

/**
 * Resolves the EPSG:4326 grid point for a given coordinate at zoom level 10
 */
async function getGridPoint(lat, lon) {
  // Tile index formula reversed from xh7.java (zoom 10 EPSG:4326)
  const i = Math.floor((180.0 + lon) / 0.3515625);
  const i2 = Math.floor((90.0 - lat) / 0.17578125);
  const tileKey = `${i}_${i2}`;

  let tile = tileCache.get(tileKey);
  if (!tile) {
    const tileUrl = `https://static-prod.ubmeteo.io/v1/products/grid/10/${i}/${i2}.json`;
    const res = await fetch(tileUrl);
    if (!res.ok) throw new Error(`Failed to fetch tile ${tileUrl}: ${res.status}`);
    tile = await res.json();
    tileCache.set(tileKey, tile);
  }

  // Look for ICON-CH1 first, fallback to ICON-CH2
  const def = tile.definitions?.find(d => d.products?.some(p => p.identifier === 'meteo_swiss:icon_ch1'))
           || tile.definitions?.find(d => d.products?.some(p => p.identifier === 'meteo_swiss:icon_ch2'));

  if (!def || !def.gridPoints || def.gridPoints.length === 0) {
    throw new Error('No MeteoSwiss ICON grid found for coordinates');
  }

  // Find nearest grid point
  let nearest = def.gridPoints[0];
  let minDist = Infinity;
  for (const pt of def.gridPoints) {
    const d = Math.hypot(pt.coordinate.latitude - lat, pt.coordinate.longitude - lon);
    if (d < minDist) {
      minDist = d;
      nearest = pt;
    }
  }

  return {
    pointIndex: nearest.pointIndex,
    elevation: nearest.coordinate?.elevation || 0,
    latitude: nearest.coordinate?.latitude || lat,
    longitude: nearest.coordinate?.longitude || lon,
    model: def.products[0].identifier.includes('icon_ch1') ? 'ICON-CH1' : 'ICON-CH2',
    modelKey: def.products[0].identifier.includes('icon_ch1') ? 'meteo_swiss:icon_ch1' : 'meteo_swiss:icon_ch2',
  };
}

/**
 * Returns latest model run timestamp
 */
async function getLatestRun(modelKey = 'meteo_swiss:icon_ch1') {
  const now = Date.now();
  if (runsCache.run && (now - runsCache.timestamp < 10 * 60 * 1000)) {
    return runsCache.run;
  }
  const url = `https://weather-ws-prod.ubmeteo.io/v1/point-data/${modelKey}/runs`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch model runs: ${res.status}`);
  const data = await res.json();
  const run = data.runs[data.runs.length - 1];
  runsCache = { run, timestamp: now };
  return run;
}

/**
 * Computes dew point from specific humidity q (kg/kg) and pressure (hPa)
 * Using Magnus-Tetens approximation.
 */
function computeDewPointC(qKg, pressHpa) {
  if (qKg <= 0 || pressHpa <= 0) return -50.0;
  // Partial vapor pressure e (hPa)
  const eHpa = (qKg * pressHpa) / (0.622 + 0.378 * qKg);
  const clampedE = Math.max(1e-4, Math.min(eHpa, pressHpa * 0.99));
  const logE = Math.log(clampedE / 6.112);
  const dewC = (243.5 * logE) / (17.67 - logE);
  return Math.max(-60, Math.min(45, dewC));
}

/**
 * Retrieves full emagram forecast for a station with all time steps
 */
async function getEmagramForecast(stationName, lat, lon) {
  const cacheKey = `${stationName}_${lat.toFixed(3)}_${lon.toFixed(3)}`;
  const cached = soundingCache.get(cacheKey);
  const now = Date.now();
  if (cached && (now - cached.timestamp < 20 * 60 * 1000)) {
    return cached.data;
  }

  const grid = await getGridPoint(lat, lon);
  const run = await getLatestRun(grid.modelKey);
  const base = `https://weather-ws-prod.ubmeteo.io/v1/point-data/${grid.modelKey}/${run}/`;

  const [tRes, pRes, qRes, hRes, uRes, vRes] = await Promise.all([
    fetch(`${base}temperature/${grid.pointIndex}`).then(r => r.json()),
    fetch(`${base}pressure/${grid.pointIndex}`).then(r => r.json()),
    fetch(`${base}specific_humidity/${grid.pointIndex}`).then(r => r.json()),
    fetch(`${base}height_half_level/${grid.pointIndex}`).then(r => r.json()),
    fetch(`${base}wind_u/${grid.pointIndex}`).then(r => r.json()),
    fetch(`${base}wind_v/${grid.pointIndex}`).then(r => r.json()),
  ]);

  const validTimes = tRes.validTimes || [];
  const numLevels = (tRes.data?.levels || []).length;

  const timeSteps = [];

  for (let t = 0; t < validTimes.length; t++) {
    const timestamp = validTimes[t];
    const levels = [];

    // Model levels are indexed from top of atmosphere (0) down to ground (79)
    // We reverse or inspect from surface up to ~550 hPa (approx 5000m AMSL)
    for (let l = numLevels - 1; l >= 0; l--) {
      const tempK = tRes.data?.levels[l]?.ensembleMembers?.[0]?.timeSeries?.[t];
      const pressPa = pRes.data?.levels[l]?.ensembleMembers?.[0]?.timeSeries?.[t];
      const qKg = qRes.data?.levels[l]?.ensembleMembers?.[0]?.timeSeries?.[t];
      const heightM = hRes.data?.levels[l]?.ensembleMembers?.[0]?.timeSeries?.[t];
      const uMs = uRes.data?.levels[l]?.ensembleMembers?.[0]?.timeSeries?.[t];
      const vMs = vRes.data?.levels[l]?.ensembleMembers?.[0]?.timeSeries?.[t];

      if (tempK === undefined || pressPa === undefined) continue;

      const pressHpa = pressPa / 100;
      // Stop once we go higher than 550 hPa (~5000m AMSL) to match paragliding sounding charts
      if (pressHpa < 550) break;

      const tempC = tempK - 273.15;
      const dewC = computeDewPointC(qKg, pressHpa);

      const speedMs = Math.hypot(uMs || 0, vMs || 0);
      const speedKmH = speedMs * 3.6;
      const dirDeg = (Math.atan2(-(uMs || 0), -(vMs || 0)) * (180 / Math.PI) + 360) % 360;

      levels.push({
        levelIndex: l,
        heightM: Math.round(heightM || 0),
        pressHpa: Math.round(pressHpa * 10) / 10,
        tempC: Math.round(tempC * 10) / 10,
        dewC: Math.round(dewC * 10) / 10,
        speedKmH: Math.round(speedKmH * 10) / 10,
        dirDeg: Math.round(dirDeg),
        lapseRate: 0, // will compute below
      });
    }

    // Sort levels by height ascending (ground to aloft)
    levels.sort((a, b) => a.heightM - b.heightM);

    // Compute lapse rate (dT/dz * 100 in °C / 100m)
    for (let i = 0; i < levels.length; i++) {
      if (i === 0) {
        levels[i].lapseRate = 0;
      } else {
        const dz = (levels[i].heightM - levels[i - 1].heightM);
        const dt = (levels[i].tempC - levels[i - 1].tempC);
        // Lapse rate Gamma = -dT/dz in °C / 100m
        // Normal troposphere has dt < 0, so Gamma is negative/positive depending on sign convention
        // In Swiss aviation: temperature drop rate: -0.65 °C / 100m is normal standard lapse.
        // If dT = -0.65 over 100m, lapseRate = -0.65 °C/100m.
        levels[i].lapseRate = dz > 10 ? Math.round((dt / (dz / 100)) * 10) / 10 : 0;
      }
    }

    timeSteps.push({
      timestamp,
      timeIso: new Date(timestamp).toISOString(),
      levels,
    });
  }

  const payload = {
    stationName,
    model: grid.model,
    run,
    elevation: Math.round(grid.elevation),
    latitude: grid.latitude,
    longitude: grid.longitude,
    validTimes,
    timeSteps,
  };

  soundingCache.set(cacheKey, { data: payload, timestamp: now });
  return payload;
}

export {
  getGridPoint,
  getLatestRun,
  getEmagramForecast,
};
