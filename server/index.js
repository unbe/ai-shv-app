import express from 'express';
import cors from 'cors';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { startAuth, exchangeCode, getSession, logoutSession } from './auth.js';
import { getEmagramForecast } from './emagram_provider.js';
import { queryObstacles, getVectorTile } from './obstacles_provider.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Local healthcheck endpoint (zero external network calls)
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

// In-memory cache for external weather and webcam data
const cache = {
  measurements: { data: null, timestamp: 0, ttl: 60 * 1000 },
  webcams: { data: null, timestamp: 0, ttl: 120 * 1000 },
  textForecast: {},
  isobarenSvg: {},
  timeseries: {},
  outlooks: { data: null, timestamp: 0, ttl: 15 * 60 * 1000 },
};

// Real historical measurements buffer & pair timeseries cache
const foehnRealHistory = [];
const pairHistoryCache = {};

async function fetchStationTimeseries(stationId, params = 'wind_speed,wind_direction,wind_gust,temperature,pressure_msl,relative_humidity') {
  const now = Date.now();
  if (cache.timeseries[stationId] && (now - cache.timeseries[stationId].timestamp < 3 * 60 * 1000)) {
    return cache.timeseries[stationId].data;
  }

  try {
    const url = `https://weather-ws-prod.ubmeteo.io/v1/measurements/timeseries/${encodeURIComponent(stationId)}?parameters=${params}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (SHV-FSVL-App/1.0)' },
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (resp.ok) {
      const data = await resp.json();
      cache.timeseries[stationId] = { data, timestamp: now };
      return data;
    }
    throw new Error(`Upstream timeseries returned ${resp.status}`);
  } catch (err) {
    console.error(`[Server] Timeseries error (${stationId}):`, err.message);
    if (cache.timeseries[stationId]?.data) {
      return cache.timeseries[stationId].data;
    }
    return null;
  }
}

async function computePairHistory(pairCfg) {
  if (!pairCfg) return [];
  const cacheKey = pairCfg.id;
  const now = Date.now();
  if (pairHistoryCache[cacheKey] && (now - pairHistoryCache[cacheKey].timestamp < 3 * 60 * 1000)) {
    return pairHistoryCache[cacheKey].history;
  }

  const param = pairCfg.isPressure ? 'pressure_msl' : 'temperature';
  const [data1, data2] = await Promise.all([
    fetchStationTimeseries(pairCfg.startId, param),
    fetchStationTimeseries(pairCfg.endId, param)
  ]);

  const s1 = data1?.timeseries?.find(t => t.parameter === param)?.measurements || [];
  const s2 = data2?.timeseries?.find(t => t.parameter === param)?.measurements || [];

  if (s1.length === 0 || s2.length === 0) {
    if (pairHistoryCache[cacheKey]?.history) {
      return pairHistoryCache[cacheKey].history;
    }
    return [];
  }

  const map1 = new Map();
  for (const m of s1) {
    if (m.time && m.value !== null && m.value !== undefined) {
      map1.set(m.time, m.value);
    }
  }

  const cutoff = now - 24 * 3600 * 1000;
  const history = [];

  for (const m2 of s2) {
    if (m2.time >= cutoff && map1.has(m2.time)) {
      const v1 = map1.get(m2.time);
      const v2 = m2.value;
      if (v2 === null || v2 === undefined) continue;

      let delta;
      if (pairCfg.isPressure) {
        delta = (pairCfg.id === 'GVE_GUT')
          ? Math.round((v1 - v2) * 10) / 10
          : Math.round((v2 - v1) * 10) / 10;
      } else {
        const c1 = v1 > 200 ? v1 - 273.15 : v1;
        const c2 = v2 > 200 ? v2 - 273.15 : v2;
        delta = Math.round((c1 - c2) * 10) / 10;
      }

      const d = new Date(m2.time);
      const timeStr = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
      history.push({
        time: timeStr,
        timestamp: m2.time,
        diffHpa: delta,
        unit: pairCfg.unit,
      });
    }
  }

  if (history.length > 0) {
    pairHistoryCache[cacheKey] = { history, timestamp: now };
  } else if (pairHistoryCache[cacheKey]?.history) {
    return pairHistoryCache[cacheKey].history;
  }

  return history;
}

// 1. Live Weather Measurements (Switzerland & surrounding Alpine regions: FR, IT, DE, AT)
app.get('/api/measurements', async (req, res) => {
  const minLat = req.query.minLat || '43.5';
  const minLon = req.query.minLon || '4.0';
  const maxLat = req.query.maxLat || '49.5';
  const maxLon = req.query.maxLon || '16.0';
  const countryParam = req.query.country ? `&country=${encodeURIComponent(req.query.country)}` : '';

  const cacheKey = `${minLat}_${minLon}_${maxLat}_${maxLon}_${req.query.country || 'ALL'}`;
  const now = Date.now();
  if (cache.measurements.data && cache.measurements.key === cacheKey && now - cache.measurements.timestamp < cache.measurements.ttl) {
    return res.json(cache.measurements.data);
  }

  try {
    const url = `https://weather-ws-prod.ubmeteo.io/v1/measurements/current?minLat=${minLat}&minLon=${minLon}&maxLat=${maxLat}&maxLon=${maxLon}${countryParam}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (resp.ok) {
      const json = await resp.json();
      cache.measurements.data = json;
      cache.measurements.key = cacheKey;
      cache.measurements.timestamp = now;
      return res.json(json);
    }
    throw new Error(`Upstream returned ${resp.status}`);
  } catch (err) {
    console.error('[Server] Upstream live measurements error:', err.message);
    if (cache.measurements.data) {
      return res.json(cache.measurements.data);
    }
    return res.status(503).json({ error: 'Live-Messwerte vorübergehend nicht erreichbar', features: [] });
  }
});

// 2. Webcams Overview
app.get('/api/webcams', async (req, res) => {
  const now = Date.now();
  if (cache.webcams.data && now - cache.webcams.timestamp < cache.webcams.ttl) {
    return res.json(cache.webcams.data);
  }

  try {
    const url = 'https://webcam-prod.ubmeteo.io/v1/webcams/overview?west=5.9&south=45.8&east=10.5&north=47.8';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (resp.ok) {
      const json = await resp.json();
      cache.webcams.data = json;
      cache.webcams.timestamp = now;
      return res.json(json);
    }
    throw new Error(`Upstream returned ${resp.status}`);
  } catch (err) {
    console.error('[Server] Upstream webcams error:', err.message);
    if (cache.webcams.data) {
      return res.json(cache.webcams.data);
    }
    return res.status(503).json({ error: 'Webcams vorübergehend nicht erreichbar', webcams: [] });
  }
});

// 3. Föhn & Official Station Difference Pairs (Pressure & Temperature Transects)
app.get('/api/foehn', async (req, res) => {
  try {
    let measurements = cache.measurements.data;
    if (!measurements) {
      const mResp = await fetch('http://127.0.0.1:' + PORT + '/api/measurements');
      measurements = await mResp.json();
    }

    const stations = (measurements && measurements.features) || [];
    const getStation = (id) => stations.find(f => f.id === id);

    const extractPressureHpa = (st) => {
      if (!st || !st.properties) return null;
      const p = st.properties;
      const val = p.pressureMslValue ?? p.pressureStandardMslValue ?? p.pressureSurfaceValue;
      if (val === null || val === undefined || isNaN(val)) return null;
      return val > 5000 ? Math.round((val / 10.0) * 10) / 10 : Math.round(val * 10) / 10;
    };

    const extractTempC = (st) => {
      if (!st || !st.properties) return null;
      const p = st.properties;
      const val = p.temperature2mValue ?? p.temperatureValue;
      if (val === null || val === undefined || isNaN(val)) return null;
      // Convert Kelvin to Celsius if > 200
      const celsius = val > 200 ? val - 273.15 : val;
      return Math.round(celsius * 10) / 10;
    };

    // Official 4 station pairs from decompiled APK (PressureDifferenceGeoJsonTransformer.c)
    const pairConfigs = [
      {
        id: 'KLO_LUG',
        type: 'PRESSURE_NORTH_SOUTH',
        isPressure: true,
        isNorthSouth: true,
        midpointPosition: 0.25,
        startId: 'meteo_swiss:KLO',
        endId: 'meteo_swiss:LUG',
        nameDe: 'Gotthard-Achse (Zürich/Kloten – Lugano)',
        nameEn: 'Gotthard Axis (Zurich/Kloten – Lugano)',
        unit: 'hPa',
      },
      {
        id: 'GVE_GUT',
        type: 'PRESSURE_EAST_WEST',
        isPressure: true,
        isNorthSouth: false,
        midpointPosition: 0.5,
        startId: 'meteo_swiss:GVE',
        endId: 'meteo_swiss:GUT',
        nameDe: 'Ost-West Gradient / Bise (Genf – Güttingen)',
        nameEn: 'East-West Gradient / Bise (Geneva – Guettingen)',
        unit: 'hPa',
      },
      {
        id: 'PIL_MTR',
        type: 'TEMPERATURE_NORTH_SOUTH',
        isPressure: false,
        isNorthSouth: true,
        midpointPosition: 0.4,
        startId: 'meteo_swiss:PIL',
        endId: 'meteo_swiss:MTR',
        nameDe: 'Alpenkamm Temperatur (Pilatus 2105m – Matro 2171m)',
        nameEn: 'Alpine Crest Temperature (Pilatus – Matro)',
        unit: '°C',
      },
      {
        id: 'DEM_GRE',
        type: 'PRESSURE_NORTH_SOUTH',
        isPressure: true,
        isNorthSouth: true,
        midpointPosition: 0.5,
        startId: 'meteo_swiss:DEM',
        endId: 'meteo_swiss:GRE',
        nameDe: 'Jura-Querung (Delémont – Grenchen)',
        nameEn: 'Jura Transect (Delemont – Grenchen)',
        unit: 'hPa',
      },
    ];

    const pairs = [];
    const geoJsonFeatures = [];

    for (const cfg of pairConfigs) {
      const st1 = getStation(cfg.startId);
      const st2 = getStation(cfg.endId);

      if (!st1 || !st2) continue;

      const p1 = extractPressureHpa(st1);
      const p2 = extractPressureHpa(st2);
      const t1 = extractTempC(st1);
      const t2 = extractTempC(st2);

      const coord1 = st1.geometry?.coordinates;
      const coord2 = st2.geometry?.coordinates;

      let delta = null;
      if (cfg.isPressure) {
        if (p1 !== null && p2 !== null) {
          // For Gotthard & DEM_GRE: South minus North
          // For GVE_GUT: West minus East
          delta = (cfg.id === 'GVE_GUT')
            ? Math.round((p1 - p2) * 10) / 10
            : Math.round((p2 - p1) * 10) / 10;
        }
      } else {
        if (t1 !== null && t2 !== null) {
          delta = Math.round((t1 - t2) * 10) / 10;
        }
      }

      // Status and safety assessment
      let status = 'CALM';
      let alertLevel = 'NONE';
      let descriptionDe = 'Normale Druckverhältnisse. Sichere Bedingungen.';
      let descriptionEn = 'Normal pressure conditions. Safe flying conditions.';

      if (cfg.id === 'KLO_LUG' && delta !== null) {
        if (delta >= 8.0) {
          status = 'SEVERE_SOUTH_FOEHN';
          alertLevel = 'DANGER';
          descriptionDe = `Starker Südföhn (+${delta} hPa)! Akute Lebensgefahr in den Föhntälern (starke Rotoren, schwere Sturmböen). Flugbetrieb einstellen!`;
          descriptionEn = `Severe South Foehn (+${delta} hPa)! Extreme hazard in alpine valleys (severe rotors, storm gusts). Cease flying!`;
        } else if (delta >= 4.0) {
          status = 'MODERATE_SOUTH_FOEHN';
          alertLevel = 'MODERATE';
          descriptionDe = `Mässiger Südföhn (+${delta} hPa). Zunehmende Turbulenz und Gefahr des Föhndurchbruchs in den Alpentälern.`;
          descriptionEn = `Moderate South Foehn (+${delta} hPa). Increasing turbulence and risk of Foehn breakthrough in valleys.`;
        } else if (delta <= -8.0) {
          status = 'SEVERE_NORTH_FOEHN';
          alertLevel = 'DANGER';
          descriptionDe = `Starker Nordföhn (${delta} hPa)! Gefährliche Turbulenzen und Lee-Rotoren auf der Alpensüdseite (Tessin).`;
          descriptionEn = `Severe North Foehn (${delta} hPa)! Dangerous turbulence and lee-wave rotors on the south side of the Alps.`;
        } else if (delta <= -4.0) {
          status = 'MODERATE_NORTH_FOEHN';
          alertLevel = 'MODERATE';
          descriptionDe = `Mässiger Nordföhn (${delta} hPa). Böig und turbulent im Tessin.`;
          descriptionEn = `Moderate North Foehn (${delta} hPa). Gusty and turbulent in Ticino.`;
        }
      } else if (cfg.isPressure && delta !== null) {
        if (Math.abs(delta) >= 6.0) {
          alertLevel = 'DANGER';
          descriptionDe = `Starker Druckgradient (${delta > 0 ? '+' : ''}${delta} hPa). Starkwind und Turbulenzen im Transect.`;
        } else if (Math.abs(delta) >= 3.0) {
          alertLevel = 'MODERATE';
          descriptionDe = `Mässiger Gradient (${delta > 0 ? '+' : ''}${delta} hPa). Merkliche Ausgleichsströmung.`;
        }
      }

      const pairObj = {
        id: cfg.id,
        type: cfg.type,
        isPressure: cfg.isPressure,
        isNorthSouth: cfg.isNorthSouth,
        nameDe: cfg.nameDe,
        nameEn: cfg.nameEn,
        unit: cfg.unit,
        delta,
        status,
        alertLevel,
        descriptionDe,
        descriptionEn,
        station1: {
          id: st1.id,
          name: st1.properties.name,
          altitude: st1.properties.altitude,
          pressureHpa: p1,
          temperatureC: t1,
          coordinates: coord1,
        },
        station2: {
          id: st2.id,
          name: st2.properties.name,
          altitude: st2.properties.altitude,
          pressureHpa: p2,
          temperatureC: t2,
          coordinates: coord2,
        },
        midpointPosition: cfg.midpointPosition,
      };

      pairs.push(pairObj);

      // Construct GeoJSON representations matching PressureDifferenceGeoJsonTransformer
      if (coord1 && coord2) {
        const midLon = coord1[0] + (coord2[0] - coord1[0]) * cfg.midpointPosition;
        const midLat = coord1[1] + (coord2[1] - coord1[1]) * cfg.midpointPosition;

        // Line connecting both stations
        geoJsonFeatures.push({
          type: 'Feature',
          id: `${cfg.id}_line`,
          geometry: {
            type: 'LineString',
            coordinates: [coord1, coord2],
          },
          properties: {
            pairId: cfg.id,
            isPressure: cfg.isPressure,
            isNorthSouth: cfg.isNorthSouth,
            delta,
            unit: cfg.unit,
            alertLevel,
          },
        });

        // Midpoint badge feature
        geoJsonFeatures.push({
          type: 'Feature',
          id: `${cfg.id}_midpoint`,
          geometry: {
            type: 'Point',
            coordinates: [midLon, midLat],
          },
          properties: {
            pairId: cfg.id,
            nameDe: cfg.nameDe,
            delta,
            unit: cfg.unit,
            alertLevel,
            status,
            station1_name: st1.properties.name,
            station2_name: st2.properties.name,
          },
        });
      }
    }

    // Compute real 24h verlauf history for the requested pair (or Gotthard by default)
    const reqPairId = req.query.pair || 'KLO_LUG';
    const targetPairCfg = pairConfigs.find(p => p.id === reqPairId) || pairConfigs[0];
    const gotthardPair = pairs.find(p => p.id === 'KLO_LUG');

    let history = await computePairHistory(targetPairCfg);

    // Fallback if upstream timeseries is temporarily empty or unreachable
    if (!history || history.length === 0) {
      const activeP = pairs.find(p => p.id === targetPairCfg.id);
      const curDelta = activeP ? activeP.delta : (gotthardPair ? gotthardPair.delta : 0);
      const nowTs = Date.now();
      const lastSample = foehnRealHistory[foehnRealHistory.length - 1];
      if (!lastSample || nowTs - lastSample.timestamp >= 5 * 60 * 1000) {
        const nowD = new Date();
        const timeStr = `${nowD.getHours().toString().padStart(2, '0')}:${nowD.getMinutes().toString().padStart(2, '0')}`;
        foehnRealHistory.push({ time: timeStr, diffHpa: curDelta, timestamp: nowTs, unit: targetPairCfg.unit });
        while (foehnRealHistory.length > 0 && nowTs - foehnRealHistory[0].timestamp > 24 * 3600 * 1000) {
          foehnRealHistory.shift();
        }
      } else if (curDelta !== null) {
        lastSample.diffHpa = curDelta;
      }
      history = foehnRealHistory.map(h => ({ time: h.time, timestamp: h.timestamp, diffHpa: h.diffHpa, unit: h.unit }));
    }

    return res.json({
      primaryPair: gotthardPair ? {
        id: gotthardPair.id,
        name: gotthardPair.nameDe,
        northStation: { name: gotthardPair.station1.name, pressureHpa: gotthardPair.station1.pressureHpa },
        southStation: { name: gotthardPair.station2.name, pressureHpa: gotthardPair.station2.pressureHpa },
        diffHpa: gotthardPair.delta,
        status: gotthardPair.status,
        alertLevel: gotthardPair.alertLevel,
        descriptionDe: gotthardPair.descriptionDe,
        descriptionEn: gotthardPair.descriptionEn,
      } : null,
      pairs,
      geoJson: {
        type: 'FeatureCollection',
        features: geoJsonFeatures,
      },
      history,
      thresholds: {
        moderateThresholdHpa: 4.0,
        severeThresholdHpa: 8.0,
      },
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Server] Föhn calculation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 4. Official SHV Text Forecast Proxy (Daily Regional Prognoses)
app.get('/api/meteo/text-forecast/:lang', async (req, res) => {
  const lang = (req.params.lang || 'de').toLowerCase();
  const validLang = ['de', 'fr', 'it'].includes(lang) ? lang : 'de';
  const now = Date.now();

  if (cache.textForecast[validLang] && (now - cache.textForecast[validLang].timestamp < 15 * 60 * 1000)) {
    return res.json(cache.textForecast[validLang].data);
  }

  try {
    const url = `https://shv-app-ws-prod.shv-app.ch/v1/text/forecast/${validLang}.json`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (resp.ok) {
      const data = await resp.json();
      cache.textForecast[validLang] = { data, timestamp: now };
      return res.json(data);
    }
    throw new Error(`Upstream text forecast returned ${resp.status}`);
  } catch (err) {
    console.error(`[Server] Text forecast error (${validLang}):`, err.message);
    if (cache.textForecast[validLang]?.data) {
      return res.json(cache.textForecast[validLang].data);
    }
    return res.status(503).json({ error: 'Textprognose vorübergehend nicht erreichbar' });
  }
});

// 5. Official SHV Isobar Weather Chart Proxy (SVG)
app.get('/api/meteo/isobaren/:lang', async (req, res) => {
  const lang = (req.params.lang || 'de').toLowerCase();
  const validLang = ['de', 'fr', 'it'].includes(lang) ? lang : 'de';
  const now = Date.now();

  if (cache.isobarenSvg[validLang] && (now - cache.isobarenSvg[validLang].timestamp < 15 * 60 * 1000)) {
    res.setHeader('Content-Type', 'image/svg+xml;charset=utf-8');
    return res.send(cache.isobarenSvg[validLang].data);
  }

  try {
    const url = `https://shv-app-ws-prod.shv-app.ch/v1/text/isobaren/${validLang}.svg`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (resp.ok) {
      const svgText = await resp.text();
      cache.isobarenSvg[validLang] = { data: svgText, timestamp: now };
      res.setHeader('Content-Type', 'image/svg+xml;charset=utf-8');
      return res.send(svgText);
    }
    throw new Error(`Upstream isobaren returned ${resp.status}`);
  } catch (err) {
    console.error(`[Server] Isobaren error (${validLang}):`, err.message);
    if (cache.isobarenSvg[validLang]?.data) {
      res.setHeader('Content-Type', 'image/svg+xml;charset=utf-8');
      return res.send(cache.isobarenSvg[validLang].data);
    }
    return res.status(503).json({ error: 'Isobarenkarte vorübergehend nicht erreichbar' });
  }
});

// 6. Station Timeseries Proxy (Wind, Gusts, Temp, Pressure)
app.get('/api/measurements/timeseries/:id', async (req, res) => {
  const stationId = req.params.id;
  if (!stationId) return res.status(400).json({ error: 'Missing station identifier' });

  const params = req.query.parameters || 'wind_speed,wind_direction,wind_gust,temperature,pressure_msl,relative_humidity';
  const data = await fetchStationTimeseries(stationId, params);
  if (data) {
    return res.json(data);
  }
  return res.status(503).json({ error: 'Stations-Zeitreihe vorübergehend nicht erreichbar' });
});

// 7. Aerological Soundings / Emagram Calculation via Python
app.post('/api/emagram/calculate', (req, res) => {
  const pythonScript = path.join(__dirname, 'emagram_calc.py');
  const py = spawn('python3', [pythonScript]);

  let stdout = '';
  let stderr = '';

  py.stdout.on('data', (d) => { stdout += d.toString(); });
  py.stderr.on('data', (d) => { stderr += d.toString(); });

  py.on('close', (code) => {
    if (code !== 0) {
      console.error('[Server] Python emagram_calc error:', stderr);
      return res.status(500).json({ error: stderr || 'Calculation failed' });
    }
    try {
      const result = JSON.parse(stdout);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: 'Failed to parse python output', raw: stdout });
    }
  });

  // Feed body json into python stdin
  py.stdin.write(JSON.stringify(req.body || {}));
  py.stdin.end();
});

// 8. Official Ubique Fluid Meteo Days Overview / Outlooks ("Aussichten")
app.get('/api/meteo/outlooks', async (req, res) => {
  const now = Date.now();
  if (cache.outlooks.data && (now - cache.outlooks.timestamp < cache.outlooks.ttl)) {
    return res.json(cache.outlooks.data);
  }

  try {
    const url = 'https://static-prod.ubmeteo.io/v1/animation/switzerland/days_overview.json';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (resp.ok) {
      const data = await resp.json();
      cache.outlooks = { data, timestamp: now, ttl: 30 * 60 * 1000 };
      return res.json(data);
    }
    throw new Error(`Upstream days_overview returned ${resp.status}`);
  } catch (err) {
    console.error('[Server] Days overview error:', err.message);
    if (cache.outlooks.data) {
      // Return stale cache if available to prevent red error box
      return res.json(cache.outlooks.data);
    }
    return res.status(503).json({ error: 'Aussichten vorübergehend nicht erreichbar' });
  }
});

function getPrevitempsStationsPath() {
  const candidates = [
    path.join(__dirname, 'data', 'previtemps_stations.json'),
    path.join(projectRoot, 'public', 'data', 'previtemps_stations.json'),
    path.join(projectRoot, 'src', 'data', 'previtemps_stations.json'),
    path.join(__dirname, 'previtemps_stations.json'),
  ];
  return candidates.find(p => fs.existsSync(p)) || candidates[0];
}

// 9. Official Previtemps / Emagram Sounding Stations
app.get('/api/meteo/previtemps/stations', (req, res) => {
  try {
    const stationsPath = getPrevitempsStationsPath();
    if (fs.existsSync(stationsPath)) {
      const raw = fs.readFileSync(stationsPath, 'utf8');
      return res.json(JSON.parse(raw));
    }
    return res.status(404).json({ error: 'Stations file not found' });
  } catch (err) {
    console.error('[Server] Previtemps stations error:', err.message);
    return res.status(500).json({ error: 'Failed to load previtemps stations' });
  }
});

// 9b. Official MeteoSwiss ICON-CH1 Multi-timestep Emagram Forecast
app.get('/api/meteo/previtemps/forecast', async (req, res) => {
  try {
    const stationName = req.query.name || 'Interlaken';
    let lat = req.query.lat ? parseFloat(req.query.lat) : null;
    let lon = req.query.lon ? parseFloat(req.query.lon) : null;

    if (lat === null || lon === null || isNaN(lat) || isNaN(lon)) {
      const stationsPath = getPrevitempsStationsPath();
      if (fs.existsSync(stationsPath)) {
        const list = JSON.parse(fs.readFileSync(stationsPath, 'utf8'));
        const found = list.find(s => s.name.toLowerCase() === stationName.toLowerCase());
        if (found) {
          lat = found.lat;
          lon = found.lon;
        }
      }
    }

    if (lat === null || lon === null) {
      lat = 46.686; // Interlaken default
      lon = 7.863;
    }

    const data = await getEmagramForecast(stationName, lat, lon);
    return res.json(data);
  } catch (err) {
    console.error('[Server] Emagram forecast error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/meteo/previtemps/forecast/:stationName', async (req, res) => {
  try {
    const stationName = decodeURIComponent(req.params.stationName);
    let lat = null;
    let lon = null;

    const stationsPath = getPrevitempsStationsPath();
    if (fs.existsSync(stationsPath)) {
      const list = JSON.parse(fs.readFileSync(stationsPath, 'utf8'));
      const found = list.find(s => s.name.toLowerCase() === stationName.toLowerCase());
      if (found) {
        lat = found.lat;
        lon = found.lon;
      }
    }

    if (lat === null || lon === null) {
      lat = 46.686;
      lon = 7.863;
    }

    const data = await getEmagramForecast(stationName, lat, lon);
    return res.json(data);
  } catch (err) {
    console.error('[Server] Emagram forecast error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// 10. Previtemps / Sounding Aerological Calculation for Specific Location
app.get('/api/meteo/previtemps/sounding', (req, res) => {
  const name = req.query.name || 'Payerne';
  const elevation = parseFloat(req.query.elevation || '490');
  const lat = parseFloat(req.query.lat || '46.82');
  const lon = parseFloat(req.query.lon || '6.94');
  const sTemp = req.query.surface_temp ? parseFloat(req.query.surface_temp) : undefined;
  const sDew = req.query.surface_dew ? parseFloat(req.query.surface_dew) : undefined;

  const pythonScript = path.join(__dirname, 'emagram_calc.py');
  const py = spawn('python3', [pythonScript]);

  let stdout = '';
  let stderr = '';

  py.stdout.on('data', (d) => { stdout += d.toString(); });
  py.stderr.on('data', (d) => { stderr += d.toString(); });

  py.on('close', (code) => {
    if (code !== 0) {
      console.error('[Server] Previtemps python calculation error:', stderr);
      return res.status(500).json({ error: stderr || 'Calculation failed' });
    }
    try {
      const result = JSON.parse(stdout);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: 'Failed to parse python output', raw: stdout });
    }
  });

  const payload = {
    name,
    elevation,
    lat,
    lon,
    surface_temp_c: sTemp,
    surface_dew_c: sDew,
  };
  py.stdin.write(JSON.stringify(payload));
  py.stdin.end();
});

// Sounding by station name URL parameter
app.get('/api/meteo/previtemps/sounding/:stationName', (req, res) => {
  const stationName = decodeURIComponent(req.params.stationName);
  try {
    const stationsPath = getPrevitempsStationsPath();
    let station = null;
    if (fs.existsSync(stationsPath)) {
      const list = JSON.parse(fs.readFileSync(stationsPath, 'utf8'));
      station = list.find(s => s.name.toLowerCase() === stationName.toLowerCase());
    }
    const elev = station ? station.elevation : 500;
    const lat = station ? station.lat : 46.8;
    const lon = station ? station.lon : 8.2;
    const sTemp = req.query.surface_temp ? parseFloat(req.query.surface_temp) : undefined;
    const sDew = req.query.surface_dew ? parseFloat(req.query.surface_dew) : undefined;

    const pythonScript = path.join(__dirname, 'emagram_calc.py');
    const py = spawn('python3', [pythonScript]);

    let stdout = '';
    let stderr = '';

    py.stdout.on('data', (d) => { stdout += d.toString(); });
    py.stderr.on('data', (d) => { stderr += d.toString(); });

    py.on('close', (code) => {
      if (code !== 0) {
        return res.status(500).json({ error: stderr });
      }
      try {
        const result = JSON.parse(stdout);
        res.json(result);
      } catch (e) {
        res.status(500).json({ error: 'Parse error' });
      }
    });

    const payload = {
      name: station ? station.name : stationName,
      elevation: elev,
      lat,
      lon,
      surface_temp_c: sTemp,
      surface_dew_c: sDew,
    };
    py.stdin.write(JSON.stringify(payload));
    py.stdin.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// BAZL Obstacles (Luftfahrthindernisse)
app.get('/api/obstacles', async (req, res) => {
  try {
    const { minLon, minLat, maxLon, maxLat, zoom } = req.query;
    if (!minLon || !minLat || !maxLon || !maxLat) {
      return res.status(400).json({ error: 'Missing bbox query params: minLon, minLat, maxLon, maxLat' });
    }
    const fc = await queryObstacles({
      minLon: parseFloat(minLon),
      minLat: parseFloat(minLat),
      maxLon: parseFloat(maxLon),
      maxLat: parseFloat(maxLat),
      zoom: parseFloat(zoom) || 12
    });
    res.set('Cache-Control', 'public, max-age=3600');
    res.json(fc);
  } catch (err) {
    console.error('[Server] /api/obstacles error:', err.message);
    res.status(500).json({ error: 'Failed to query BAZL obstacles' });
  }
});

app.get('/api/obstacles/tiles/bazl/:z/:x/:y.pbf', async (req, res) => {
  try {
    const { z, x, y } = req.params;
    const buf = await getVectorTile(z, x, y);
    res.set('Content-Type', 'application/x-protobuf');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(buf);
  } catch (err) {
    console.error('[Server] /api/obstacles/tiles error:', err.message);
    res.status(502).json({ error: 'Failed to fetch BAZL vector tile' });
  }
});

// 5. Skybriefing DABS (Daily Airspace Bulletin Switzerland) Info
app.get('/api/dabs', (req, res) => {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0];
  res.json({
    date: dateStr,
    status: 'ACTIVE',
    bulletinUrl: 'https://www.skybriefing.com/de/dabs',
    bulletinPdfUrl: 'https://www.skybriefing.com/dabs/dabs.pdf',
    validity: `00:00 - 23:59 LT (${dateStr})`,
    notesDe: 'Täglich ab 16:00 LT für den Folgetag durch Skybriefing publiziert. Vor jedem Streckenflug obligatorisch zu konsultieren!',
    notesEn: 'Published daily at 16:00 LT for the next day via Skybriefing. Mandatory consultation prior to cross-country flights!'
  });
});

// 6. SHV Keycloak OIDC Authentication Routes (Option A: Desktop / Web callback paste flow)
app.post('/api/auth/start', (req, res) => {
  try {
    const result = startAuth();
    res.json(result);
  } catch (err) {
    console.error('[Server] /api/auth/start error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/exchange', async (req, res) => {
  try {
    const { callbackUrl, code, state } = req.body || {};
    const result = await exchangeCode({ callbackUrl, code, state });
    res.json(result);
  } catch (err) {
    console.error('[Server] /api/auth/exchange error:', err.message);
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/auth/profile', async (req, res) => {
  try {
    const sid = req.headers['x-session-id'];
    if (!sid) {
      return res.status(401).json({ error: 'Nicht angemeldet (keine Session-ID)' });
    }
    const session = await getSession(sid);
    if (!session) {
      return res.status(401).json({ error: 'Session abgelaufen oder ungültig' });
    }
    res.json(session);
  } catch (err) {
    console.error('[Server] /api/auth/profile error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/logout', (req, res) => {
  try {
    const sid = req.headers['x-session-id'];
    if (sid) {
      logoutSession(sid);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve production static frontend if built (Docker & production)
const distPath = path.join(projectRoot, 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Swiss Free Flight] Server running on http://0.0.0.0:${PORT}`);
});
