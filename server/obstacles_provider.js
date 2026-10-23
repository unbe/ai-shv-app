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

function getFeatureKey(f, index = 0) {
  const p = f.properties || {};
  const base = p.sourceId || f.id || p.id || `feat_${index}`;
  const type = f.geometry?.type || 'geom';
  const part = p.partIndex !== null && p.partIndex !== undefined ? `_${p.partIndex}` : '';
  return `${base}_${type}${part}`;
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

    f._uid = getFeatureKey(f, i);
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
 * Query obstacles intersecting a bounding box with zoom-level LOD filtering.
 * Features are returned deterministically without random round-robin sampling,
 * preventing flickering or obstacles vanishing when panning.
 */
export async function queryObstacles({ minLon, minLat, maxLon, maxLat, zoom = 12 }) {
  await ensureObstaclesLoaded();
  if (!spatialGrid || !featureCollection) {
    return { type: 'FeatureCollection', features: [] };
  }

  const z = parseFloat(zoom) || 12;

  if (z < 7) {
    return { type: 'FeatureCollection', features: [] };
  }

  const gx0 = Math.floor(minLon * 10);
  const gx1 = Math.floor(maxLon * 10);
  const gy0 = Math.floor(minLat * 10);
  const gy1 = Math.floor(maxLat * 10);

  const seen = new Set();
  const matched = [];

  for (let gx = gx0; gx <= gx1; gx++) {
    for (let gy = gy0; gy <= gy1; gy++) {
      const cell = spatialGrid.get(`${gx}_${gy}`);
      if (!cell) continue;

      for (let i = 0; i < cell.length; i++) {
        const f = cell[i];
        if (seen.has(f._uid)) continue;
        seen.add(f._uid);

        const [bMinX, bMinY, bMaxX, bMaxY] = f._bbox;
        if (bMaxX < minLon || bMinX > maxLon || bMaxY < minLat || bMinY > maxLat) {
          continue;
        }

        const geomType = f.geometry?.type;
        const props = f.properties || {};

        if (geomType === 'Polygon' || geomType === 'MultiPolygon') {
          matched.push(f);
          continue;
        }

        if (geomType === 'Point') {
          const isEndpoint = ['TRANSMISSION_LINE', 'CABLE_CAR', 'CATENARY', 'BRIDGE'].includes(props.obstacleType);
          if (isEndpoint) {
            if (z < 13) continue; // Pylon dots along cables only visible at high zoom >= 13 (per native style.json)
          } else {
            // Structural point symbols (masts, poles, trees, cranes, windmills, etc.)
            const isMarked = props.marking === 'MARKED';
            const h = props.maxHeightAgl || 0;
            if (z < 9) {
              if (!isMarked && h < 80) continue;
            } else if (z < 10) {
              if (!isMarked && h < 50) continue;
            } else if (z < 11) {
              if (!isMarked && h < 30) continue;
            } else if (z < 12) {
              if (props.small && h < 15 && !isMarked) continue;
            }
          }
          matched.push(f);
        } else if (geomType === 'LineString' || geomType === 'MultiLineString') {
          const isMarked = props.marking === 'MARKED';
          const h = props.maxHeightAgl || 0;
          if (z < 9) {
            // Country overview: only marked hazards, or major high-voltage lines >= 60m
            if (!isMarked && !(props.obstacleType === 'TRANSMISSION_LINE' && h >= 60)) continue;
          } else if (z < 10) {
            // Regional overview: marked, transmission lines >= 35m, or cable cars >= 30m
            if (!isMarked && h < 35) continue;
          } else if (z < 11) {
            // Intermediate zoom: marked, transmission lines >= 20m, or cable cars >= 15m
            if (!isMarked && h < 20) continue;
          } else if (z < 12) {
            // Local flight area: marked, transmission lines, cable cars, exclude only tiny local lines < 10m
            if (!isMarked && h < 10 && props.small) continue;
          }
          matched.push(f);
        }
      }
    }
  }

  // Deterministic safety cap: if the query covers a huge area, prioritize the most critical
  // aviation hazards deterministically so panning NEVER changes feature inclusion randomly
  const MAX_FEATURES = 2000;
  if (matched.length > MAX_FEATURES) {
    matched.sort((a, b) => {
      // 1. Marked hazards first
      const markedA = a.properties?.marking === 'MARKED' ? 1 : 0;
      const markedB = b.properties?.marking === 'MARKED' ? 1 : 0;
      if (markedB !== markedA) return markedB - markedA;

      // 2. Cable cars next
      const cableA = a.properties?.obstacleType === 'CABLE_CAR' ? 1 : 0;
      const cableB = b.properties?.obstacleType === 'CABLE_CAR' ? 1 : 0;
      if (cableB !== cableA) return cableB - cableA;

      // 3. Taller obstacles first
      const hA = a.properties?.maxHeightAgl || 0;
      const hB = b.properties?.maxHeightAgl || 0;
      if (hB !== hA) return hB - hA;

      // 4. Stable tie-breaker: unique id
      return a._uid < b._uid ? -1 : 1;
    });
    matched.length = MAX_FEATURES;
  }

  return {
    type: 'FeatureCollection',
    features: matched.map(f => {
      // Clean internal temporary _bbox and _uid, and strip heavy unused properties for network speed
      const props = f.properties || {};
      return {
        type: 'Feature',
        id: f.id,
        geometry: f.geometry,
        properties: {
          id: props.id || f.id,
          sourceId: props.sourceId,
          partIndex: props.partIndex,
          obstacleType: props.obstacleType,
          marking: props.marking,
          lighting: props.lighting,
          maxHeightAgl: props.maxHeightAgl,
          topElevationAmsl: props.topElevationAmsl,
          styleId: props.styleId,
          airport: props.airport,
          geometryType: props.geometryType || f.geometry?.type
        }
      };
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
