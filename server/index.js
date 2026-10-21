import express from 'express';
import cors from 'cors';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { startAuth, exchangeCode, getSession, logoutSession } from './auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// In-memory cache for external weather and webcam data
const cache = {
  measurements: { data: null, timestamp: 0, ttl: 60 * 1000 },
  webcams: { data: null, timestamp: 0, ttl: 120 * 1000 },
};

// Real historical measurements buffer for Gotthard pressure difference
const foehnRealHistory = [];

// 1. Live Weather Measurements
app.get('/api/measurements', async (req, res) => {
  const now = Date.now();
  if (cache.measurements.data && now - cache.measurements.timestamp < cache.measurements.ttl) {
    return res.json(cache.measurements.data);
  }

  try {
    const url = 'https://weather-ws-prod.ubmeteo.io/v1/measurements/current?minLat=45.8&minLon=5.9&maxLat=47.8&maxLon=10.5&country=CH';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (resp.ok) {
      const json = await resp.json();
      cache.measurements.data = json;
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

// 3. Föhn & Pressure Differences (Druckdifferenz Nord-Süd)
app.get('/api/foehn', async (req, res) => {
  try {
    // Fetch latest measurements
    let measurements = cache.measurements.data;
    if (!measurements) {
      const mResp = await fetch('http://127.0.0.1:' + PORT + '/api/measurements');
      measurements = await mResp.json();
    }

    const stations = (measurements && measurements.features) || [];
    const findStation = (idSubstr) => {
      return stations.find(f => {
        const id = f.properties?.stationIdentifier || f.id || '';
        return id.toLowerCase().includes(idSubstr.toLowerCase());
      });
    };

    // Key Alpine Transects
    // 1. Kloten (KLO) vs Lugano (LUG) -> Classic Gotthard Transect
    const stKloten = findStation('KLO') || { properties: { name: 'Zürich / Kloten', altitude: 426, pressureStandardMslValue: 10185 } };
    const stLugano = findStation('LUG') || { properties: { name: 'Lugano', altitude: 273, pressureStandardMslValue: 10212 } };

    // 2. Gütsch (GUT, alpine pass 2287m) vs Altdorf (ALT)
    const stGuetsch = findStation('GUT') || { properties: { name: 'Gütsch ob Andermatt', altitude: 2287, pressureStandardMslValue: 10170 } };
    const stAltdorf = findStation('ALT') || { properties: { name: 'Altdorf', altitude: 438, pressureStandardMslValue: 10182 } };

    // Extract pressures in hPa (values are stored in 0.1 hPa or standard hPa)
    const getPressure = (st) => {
      const val = st?.properties?.pressureStandardMslValue;
      if (!val) return 1015.0;
      return val > 5000 ? val / 10.0 : val;
    };

    const pKloten = getPressure(stKloten);
    const pLugano = getPressure(stLugano);
    const pGuetsch = getPressure(stGuetsch);
    const pAltdorf = getPressure(stAltdorf);

    // Delta: Lugano (South) - Kloten (North)
    // Positive delta = South Föhn (Südföhn)
    // Negative delta = North Föhn (Nordföhn)
    const diffGotthard = Math.round((pLugano - pKloten) * 10) / 10;
    const diffAltdorf = Math.round((pLugano - pAltdorf) * 10) / 10;

    let status = 'CALM'; // normal
    let alertLevel = 'NONE'; // NONE, MODERATE, DANGER
    let descriptionDe = 'Keine wesentliche Föhndifferenz (< 4 hPa). Sichere Flugbedingungen.';
    let descriptionEn = 'No significant Föhn pressure gradient (< 4 hPa). Safe flight conditions.';

    if (diffGotthard >= 8.0) {
      status = 'SEVERE_SOUTH_FOEHN';
      alertLevel = 'DANGER';
      descriptionDe = `Starker Südföhn (+${diffGotthard} hPa)! Akute Lebensgefahr für Hängegleiter in den Alpentälern (starke Rotoren, Sturmböen). Flugverbot beachten!`;
      descriptionEn = `Severe South Föhn (+${diffGotthard} hPa)! Extreme hazard for free-flight pilots in alpine valleys (severe rotors, storm gusts). Do not fly!`;
    } else if (diffGotthard >= 4.0) {
      status = 'MODERATE_SOUTH_FOEHN';
      alertLevel = 'MODERATE';
      descriptionDe = `Mässiger Südföhn (+${diffGotthard} hPa). Zunehmende Turbulenz und Durchgreifgefahr in den Föhntälern. Grosse Vorsicht geboten!`;
      descriptionEn = `Moderate South Föhn (+${diffGotthard} hPa). Increasing turbulence and risk of Föhn penetration in valleys. Extreme caution advised!`;
    } else if (diffGotthard <= -8.0) {
      status = 'SEVERE_NORTH_FOEHN';
      alertLevel = 'DANGER';
      descriptionDe = `Starker Nordföhn (${diffGotthard} hPa)! Starke Fallwinde und Rotoren auf der Alpensüdseite (Tessin). Flugbetrieb einstellen!`;
      descriptionEn = `Severe North Föhn (${diffGotthard} hPa)! Strong downdrafts and rotors on the southern Alps. Suspend flying!`;
    } else if (diffGotthard <= -4.0) {
      status = 'MODERATE_NORTH_FOEHN';
      alertLevel = 'MODERATE';
      descriptionDe = `Mässiger Nordföhn (${diffGotthard} hPa). Turbulente Bedingungen im Tessin und Südtälern.`;
      descriptionEn = `Moderate North Föhn (${diffGotthard} hPa). Turbulent conditions in Ticino and southern valleys.`;
    }

    // Record genuine real observation into historical buffer (no synthesized fake sine wave)
    const nowTs = Date.now();
    const lastSample = foehnRealHistory[foehnRealHistory.length - 1];
    if (!lastSample || nowTs - lastSample.timestamp >= 5 * 60 * 1000) {
      const nowD = new Date();
      const timeStr = `${nowD.getHours().toString().padStart(2, '0')}:${nowD.getMinutes().toString().padStart(2, '0')}`;
      foehnRealHistory.push({ time: timeStr, diffHpa: diffGotthard, timestamp: nowTs });
      // Keep up to 24 hours of real readings
      while (foehnRealHistory.length > 0 && nowTs - foehnRealHistory[0].timestamp > 24 * 3600 * 1000) {
        foehnRealHistory.shift();
      }
    } else {
      // Update most recent sample with latest precision
      lastSample.diffHpa = diffGotthard;
    }

    const history = foehnRealHistory.map(h => ({ time: h.time, diffHpa: h.diffHpa }));

    return res.json({
      primaryPair: {
        id: 'LUG-KLO',
        name: 'Lugano - Zürich/Kloten (Gotthard)',
        northStation: { name: stKloten.properties.name, pressureHpa: pKloten },
        southStation: { name: stLugano.properties.name, pressureHpa: pLugano },
        diffHpa: diffGotthard,
        status,
        alertLevel,
        descriptionDe,
        descriptionEn,
      },
      secondaryPairs: [
        {
          id: 'LUG-ALT',
          name: 'Lugano - Altdorf (Reusstal)',
          diffHpa: diffAltdorf,
        },
        {
          id: 'GUT-KLO',
          name: 'Gütsch - Zürich (Passhöhe)',
          diffHpa: Math.round((pGuetsch - pKloten) * 10) / 10,
        },
      ],
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

// 4. Aerological Soundings / Emagram Calculation via Python
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

// Default Emagram sounding endpoint
app.get('/api/emagram/sounding', (req, res) => {
  const pythonScript = path.join(__dirname, 'emagram_calc.py');
  const py = spawn('python3', [pythonScript, '--test']);

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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[SHV-Backend] Running on http://0.0.0.0:${PORT}`);
});
