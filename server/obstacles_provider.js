/**
 * BAZL Obstacles Provider (Luftfahrthindernisse)
 * 
 * Sources authentic BAZL obstacle data from official Ubique / MeteoSwiss CDN:
 * - https://shv-app-static-prod.ubmeteo.io/v1/obstacles/bazl.geojson (Complete Swiss obstacle dataset)
 * - https://shv-app-static-prod.ubmeteo.io/v1/obstacles/tiles/bazl/{z}/{x}/{y}.pbf (MVT Vector tiles)
 * 
 * Provides:
 * 1. Bounding box queries with 0.1° spatial indexing for Leaflet GeoJSON layer
 * 2. Multi-tier zoom filtering adhering to APK style.json specification:
 *    - Polygons/Lines: minzoom 6
 *    - Structural symbols (masts, cranes, trees, buildings, windmills): minzoom 8
 *    - Endpoint symbols (pylon dots along cables): minzoom 13
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CACHE_DIR = path.join(__dirname, 'cache');
const GEOJSON_CACHE_FILE = path.join(CACHE_DIR, 'bazl_obstacles.geojson');
const GEOJSON_CDN_URL = 'https://shv-app-static-prod.ubmeteo.io/v1/obstacles/bazl.geojson';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

let featureCollection = null;
let spatialGrid = null;
let isInitializing = false;
let initPromise = null;

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

export async function ensureObstaclesLoaded() {
  if (featureCollection && spatialGrid) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      // 1. Check local disk cache
      let rawJson = null;
      if (fs.existsSync(GEOJSON_CACHE_FILE)) {
        const stats = fs.statSync(GEOJSON_CACHE_FILE);
        const age = Date.now() - stats.mtimeMs;
        if (age < CACHE_TTL_MS && stats.size > 100000) {
          console.log('[ObstaclesProvider] Loading BAZL obstacles from disk cache...');
          rawJson = fs.readFileSync(GEOJSON_CACHE_FILE, 'utf8');
        }
      }

      // 2. Fetch from CDN if not cached or expired
      if (!rawJson) {
        console.log('[ObstaclesProvider] Fetching BAZL obstacles GeoJSON from production CDN...');
        const resp = await fetch(GEOJSON_CDN_URL, {
          headers: { 'Accept': 'application/json' },
        });
        if (!resp.ok) {
          throw new Error(`CDN returned HTTP ${resp.status}`);
        }
        rawJson = await resp.text();
        fs.writeFileSync(GEOJSON_CACHE_FILE, rawJson, 'utf8');
        console.log(`[ObstaclesProvider] Cached ${(rawJson.length / 1024 / 1024).toFixed(1)} MB BAZL obstacles to disk`);
      }

      const data = JSON.parse(rawJson);
      if (!data || !Array.isArray(data.features)) {
        throw new Error('Invalid GeoJSON structure');
      }

      featureCollection = data;
      buildSpatialIndex(data.features);
      console.log(`[ObstaclesProvider] Indexed ${data.features.length} BAZL obstacles into spatial grid`);
    } catch (err) {
      console.error('[ObstaclesProvider] Failed to load BAZL obstacles:', err.message);
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

function buildSpatialIndex(features) {
  const grid = new Map();

  for (let i = 0; i < features.length; i++) {
    const f = features[i];
    const geom = f.geometry;
    if (!geom) continue;

    let minX = 180, maxX = -180, minY = 90, maxY = -90;
    const addPt = (p) => {
      if (p[0] < minX) minX = p[0];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
    };

    if (geom.type === 'Point') {
      addPt(geom.coordinates);
    } else if (geom.type === 'LineString') {
      geom.coordinates.forEach(addPt);
    } else if (geom.type === 'Polygon') {
      geom.coordinates.forEach(r => r.forEach(addPt));
    } else if (geom.type === 'MultiLineString') {
      geom.coordinates.forEach(l => l.forEach(addPt));
    }

    f._uid = f.properties?.sourceId || `${f.id || 'feat'}_${i}`;
    f._bbox = [minX, minY, maxX, maxY];

    // 0.1° grid cells (~7 x 11 km)
    const gx0 = Math.floor(minX * 10);
    const gx1 = Math.floor(maxX * 10);
    const gy0 = Math.floor(minY * 10);
    const gy1 = Math.floor(maxY * 10);

    for (let gx = gx0; gx <= gx1; gx++) {
      for (let gy = gy0; gy <= gy1; gy++) {
        const key = `${gx}_${gy}`;
        let list = grid.get(key);
        if (!list) {
          list = [];
          grid.set(key, list);
        }
        list.push(f);
      }
    }
  }

  spatialGrid = grid;
}

/**
 * Query obstacles intersecting a bounding box with zoom-level LOD filtering
 */
export async function queryObstacles({ minLon, minLat, maxLon, maxLat, zoom = 12 }) {
  await ensureObstaclesLoaded();
  if (!spatialGrid || !featureCollection) {
    return { type: 'FeatureCollection', features: [] };
  }

  const z = parseFloat(zoom) || 12;
  const isDetail = z >= 13;       // Red dot endpoints along cables
  const isLocal = z >= 12;        // Local flight sites
  const isRegional = z >= 10;     // Regional view
  const isOverview = z >= 8;      // Country overview

  if (z < 7) {
    return { type: 'FeatureCollection', features: [] };
  }

  const gx0 = Math.floor(minLon * 10);
  const gx1 = Math.floor(maxLon * 10);
  const gy0 = Math.floor(minLat * 10);
  const gy1 = Math.floor(maxLat * 10);

  // Find all cells that actually contain data in this bounding box
  const activeCells = [];
  for (let gx = gx0; gx <= gx1; gx++) {
    for (let gy = gy0; gy <= gy1; gy++) {
      const cell = spatialGrid.get(`${gx}_${gy}`);
      if (cell && cell.length > 0) {
        activeCells.push(cell);
      }
    }
  }

  // Filter features within each active cell by bbox and zoom LOD
  const cellCandidates = [];
  for (const cell of activeCells) {
    const list = [];
    for (let i = 0; i < cell.length; i++) {
      const f = cell[i];
      const [bMinX, bMinY, bMaxX, bMaxY] = f._bbox;
      if (bMaxX < minLon || bMinX > maxLon || bMaxY < minLat || bMinY > maxLat) {
        continue;
      }

      const geomType = f.geometry?.type;
      const props = f.properties || {};

      // Multi-level zoom LOD filtering derived from Android APK style.json:
      if (geomType === 'Point') {
        const isEndpoint = ['TRANSMISSION_LINE', 'CABLE_CAR', 'CATENARY', 'BRIDGE'].includes(props.obstacleType);
        if (isEndpoint) {
          if (!isDetail) continue; // Cable pylon endpoint dots only at zoom >= 13
        } else {
          if (z < 9 && (props.maxHeightAgl < 70 && props.lighting === 'NONE')) continue;
          if (z < 11 && (props.maxHeightAgl < 30 && props.lighting === 'NONE')) continue;
          if (z < 12 && (props.small && props.lighting === 'NONE')) continue;
        }
      } else if (geomType === 'LineString' || geomType === 'Polygon') {
        if (z < 9) {
          if (props.maxHeightAgl < 50 && props.marking !== 'MARKED' && props.obstacleType !== 'CABLE_CAR') continue;
        } else if (z < 11) {
          if (props.maxHeightAgl < 25 && props.marking !== 'MARKED' && props.obstacleType !== 'CABLE_CAR') continue;
        } else if (z < 12) {
          if (props.small && props.maxHeightAgl < 15 && props.marking !== 'MARKED' && props.obstacleType !== 'CABLE_CAR') continue;
        }
      }
      list.push(f);
    }
    if (list.length > 0) {
      cellCandidates.push(list);
    }
  }

  // Fair Round-Robin distribution across all spatial cells
  // This guarantees West, Central, and East Switzerland all receive equal representation without any longitude starvation
  const TARGET_MAX = 2000;
  const seen = new Set();
  const matched = [];

  let round = 0;
  let addedInRound = true;

  while (matched.length < TARGET_MAX && addedInRound) {
    addedInRound = false;
    for (let c = 0; c < cellCandidates.length; c++) {
      const list = cellCandidates[c];
      if (round < list.length) {
        const f = list[round];
        if (!seen.has(f._uid)) {
          seen.add(f._uid);
          matched.push(f);
          addedInRound = true;
          if (matched.length >= TARGET_MAX) break;
        }
      }
    }
    round++;
  }

  return {
    type: 'FeatureCollection',
    features: matched.map(f => {
      // Clean internal temporary _bbox and _uid
      const { _bbox, _uid, ...rest } = f;
      return rest;
    })
  };
}

/**
 * Proxy BAZL vector tile from upstream CDN with local caching
 */
export async function getVectorTile(z, x, y) {
  const tileFile = path.join(CACHE_DIR, `tile_${z}_${x}_${y}.pbf`);
  if (fs.existsSync(tileFile)) {
    return fs.readFileSync(tileFile);
  }

  const url = `https://shv-app-static-prod.ubmeteo.io/v1/obstacles/tiles/bazl/${z}/${x}/${y}.pbf`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Upstream tile returned HTTP ${resp.status}`);
  }

  const buffer = Buffer.from(await resp.arrayBuffer());
  fs.writeFileSync(tileFile, buffer);
  return buffer;
}
