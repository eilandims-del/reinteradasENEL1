// =========================
// FILE: js/components/mapa.js
// =========================
import { generateHeatmapByConjunto } from '../services/data-service.js';
import { loadEstruturasRegionalOnce } from '../services/estruturas-service.js';

let map;

// ✅ Base layers (Mapa / Ruas HD / Satélite)
let baseLayerOSM;
let baseLayerStreetsHD;
let baseLayerSat;
let baseLayerSatLabels;
let currentBase = 'OSM'; // 'OSM' | 'STREETS' | 'SAT'

let heatLayer;
let markersLayer;
let linesLayer;
let estruturasLayer;
let regionLayer;

let btnConjRef = null;
let btnAlimRef = null;
let legendMounted = false;

let uiMounted = false;
let mode = 'CONJUNTO'; // 'CONJUNTO' | 'ALIMENTADOR'
let lastData = [];
let renderSeq = 0;

// alimentadorBaseNorm -> { lat, lng, display }
let alimentadorCenters = {};
// alimentadorBaseNorm -> array de linhas (cada linha = [[lat,lng],...])
let alimentadorLines = {};

// lock para não carregar KML duas vezes em paralelo
let kmlLoadPromise = null;

// ====== REGIONAIS (KML/KMZ) ======
const REGION_FILES = {
  'TODOS': null,
  'CENTRO NORTE': { type: 'kml', path: 'assets/doc.kml' },
  'ATLANTICO': { type: 'kmz', path: 'assets/atlantico.kmz' },
  'NORTE': { type: 'kmz', path: 'assets/norte.kmz' }
};

let currentRegion = 'TODOS';
let regionGeoJSONCache = {}; // key -> geojson | null

/* =========================
   HELPERS
========================= */
function decimateLatLngs(latlngs, step = 3) {
  if (!Array.isArray(latlngs) || latlngs.length < 3) return latlngs;
  const out = [];
  for (let i = 0; i < latlngs.length; i += step) out.push(latlngs[i]);
  const last = latlngs[latlngs.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

function normKey(v) {
  return String(v ?? '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeRegionalKey(r) {
  const v = String(r || '').trim().toUpperCase();
  if (v === 'CENTRO NORTE' || v === 'CENTRO_NORTE' || v === 'CENTRONORTE') return 'CENTRO NORTE';
  if (v === 'ATLANTICO' || v === 'ATLÂNTICO') return 'ATLANTICO';
  if (v === 'NORTE') return 'NORTE';
  if (v === 'TODOS') return 'TODOS';
  return 'TODOS';
}

function extractAlimBase(name) {
  const n = normKey(name);
  const m = n.match(/([A-Z]{2,4}\s?\d{2,4})/);
  if (!m) return n;
  return m[1].replace(/\s+/g, '');
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function purgeAllHeatLayers() {
  if (!map) return;
  Object.values(map._layers || {}).forEach(layer => {
    if (layer && layer._heat) {
      try { map.removeLayer(layer); } catch (_) {}
    }
  });
}

/* =========================
   Heat gradient (cores vivas)
========================= */
const HEAT_GRADIENT = {
  0.00: '#1b4cff',
  0.25: '#00c46a',
  0.50: '#ffe600',
  0.75: '#ff8a00',
  1.00: '#e60000'
};

function boostIntensity(intensity, maxCap) {
  const x = maxCap > 0 ? clamp(Number(intensity) || 0, 0, maxCap) / maxCap : 0;
  const y = Math.pow(x, 0.55);
  return y * maxCap;
}

function scaleIntensityForHeat(intensity, maxCap) {
  return boostIntensity(Number(intensity) || 0, maxCap);
}

/* =========================
   Linhas (ALIMENTADOR) - gradiente azul → vermelho
========================= */
const LINE_STOPS = [
  { t: 0.00, rgb: [ 27,  76, 255] },
  { t: 0.25, rgb: [  0, 196, 106] },
  { t: 0.50, rgb: [255, 230,   0] },
  { t: 0.75, rgb: [255, 138,   0] },
  { t: 1.00, rgb: [230,   0,   0] }
];

function lerp(a, b, t) { return a + (b - a) * t; }

function colorFromIntensity(intensity, max, alpha = 0.85) {
  const x = max > 0 ? clamp(Number(intensity) || 0, 0, max) / max : 0;

  let i = 0;
  while (i < LINE_STOPS.length - 1 && x > LINE_STOPS[i + 1].t) i++;

  const a = LINE_STOPS[i];
  const b = LINE_STOPS[Math.min(i + 1, LINE_STOPS.length - 1)];
  const span = (b.t - a.t) || 1;
  const tt = (x - a.t) / span;

  const r = Math.round(lerp(a.rgb[0], b.rgb[0], tt));
  const g = Math.round(lerp(a.rgb[1], b.rgb[1], tt));
  const bl = Math.round(lerp(a.rgb[2], b.rgb[2], tt));

  return `rgba(${r}, ${g}, ${bl}, ${alpha})`;
}

function lineStyleByIntensity(intensity, max) {
  const t = max > 0 ? clamp(Number(intensity) || 0, 0, max) / max : 0;

  return {
    color: colorFromIntensity(intensity, max, 0.95),
    weight: 1.2 + 3.6 * t,
    opacity: 0.90
  };
}

/* =========================
   REGION FILTER (GeoJSON point in polygon)
========================= */
function cacheHas(key) {
  return Object.prototype.hasOwnProperty.call(regionGeoJSONCache, key);
}

function extractFeatures(geojson) {
  if (!geojson) return [];
  if (geojson.type === 'FeatureCollection') return geojson.features || [];
  if (geojson.type === 'Feature') return [geojson];
  return [];
}

function geojsonHasPolygon(geojson) {
  const features = extractFeatures(geojson);
  for (const f of features) {
    const g = f?.geometry;
    if (!g) continue;
    if (g.type === 'Polygon' || g.type === 'MultiPolygon') return true;
    if (g.type === 'GeometryCollection') {
      for (const gg of (g.geometries || [])) {
        if (gg.type === 'Polygon' || gg.type === 'MultiPolygon') return true;
      }
    }
  }
  return false;
}

function pointInRing(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];

    const intersect =
      ((yi > point[1]) !== (yj > point[1])) &&
      (point[0] < (xj - xi) * (point[1] - yi) / ((yj - yi) || 1e-12) + xi);

    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInPolygon(point, polygonCoords) {
  if (!polygonCoords || !polygonCoords.length) return false;
  if (!pointInRing(point, polygonCoords[0])) return false;
  for (let i = 1; i < polygonCoords.length; i++) {
    if (pointInRing(point, polygonCoords[i])) return false;
  }
  return true;
}

function pointInGeoJSON(lat, lng, geojson) {
  if (!geojson) return true;
  if (!geojsonHasPolygon(geojson)) return true;

  const point = [lng, lat];
  const features = extractFeatures(geojson);

  for (const f of features) {
    const g = f.geometry;
    if (!g) continue;

    if (g.type === 'Polygon') {
      if (pointInPolygon(point, g.coordinates)) return true;
    } else if (g.type === 'MultiPolygon') {
      for (const poly of g.coordinates) {
        if (pointInPolygon(point, poly)) return true;
      }
    } else if (g.type === 'GeometryCollection') {
      for (const gg of (g.geometries || [])) {
        if (gg.type === 'Polygon') {
          if (pointInPolygon(point, gg.coordinates)) return true;
        } else if (gg.type === 'MultiPolygon') {
          for (const poly of gg.coordinates) {
            if (pointInPolygon(point, poly)) return true;
          }
        }
      }
    }
  }
  return false;
}

/* =========================
   KML (Alimentador lines) - usa doc.kml
========================= */
const ALIM_FILES = {
  'CENTRO NORTE': { type: 'kml', path: 'assets/doc.kml' },
  'ATLANTICO': { type: 'kmz', path: 'assets/atlantico.kmz' },
  'NORTE': { type: 'kmz', path: 'assets/norte.kmz' },
  'TODOS': null
};

function parseKmlLinesToIndex(kmlText) {
  const parser = new DOMParser();
  const xml = parser.parseFromString(kmlText, 'text/xml');
  const placemarks = Array.from(xml.getElementsByTagName('Placemark'));

  const centers = {};
  const linesByBase = {};
  let totalLines = 0;

  for (const pm of placemarks) {
    const nameNode = pm.getElementsByTagName('name')[0];
    const rawName = nameNode ? nameNode.textContent : '';
    if (!rawName) continue;

    const base = extractAlimBase(rawName);
    const baseKey = normKey(base);

    const lineStrings = Array.from(pm.getElementsByTagName('LineString'));
    for (const ls of lineStrings) {
      const coordsNode = ls.getElementsByTagName('coordinates')[0];
      if (!coordsNode) continue;

      const coordsText = coordsNode.textContent || '';
      const pairs = coordsText
        .trim()
        .split(/\s+/g)
        .map(s => s.trim())
        .filter(Boolean)
        .map(s => {
          const [lng, lat] = s.split(',').map(Number);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
          return [lat, lng];
        })
        .filter(Boolean);

      if (pairs.length < 2) continue;

      if (!linesByBase[baseKey]) linesByBase[baseKey] = [];
      linesByBase[baseKey].push(pairs);
      totalLines++;

      let sumLat = 0, sumLng = 0;
      for (const [lat, lng] of pairs) { sumLat += lat; sumLng += lng; }
      const cLat = sumLat / pairs.length;
      const cLng = sumLng / pairs.length;

      if (!centers[baseKey]) centers[baseKey] = { lat: cLat, lng: cLng, display: base };
      else {
        centers[baseKey] = {
          lat: (centers[baseKey].lat + cLat) / 2,
          lng: (centers[baseKey].lng + cLng) / 2,
          display: centers[baseKey].display || base
        };
      }
    }
  }

  console.log('[KML] alimentadores carregados:', Object.keys(centers).length, 'linhas:', totalLines);
  return { centers, linesByBase };
}

let alimLoadPromise = null;
let alimLoadedRegion = null;

async function loadAlimentadoresForRegionOnce(regionKey) {
  const reg = normalizeRegionalKey(regionKey);

  if (alimLoadedRegion === reg && Object.keys(alimentadorLines).length > 0) return;
  if (alimLoadPromise) return alimLoadPromise;

  const cfg = ALIM_FILES[reg];
  if (!cfg) {
    alimentadorCenters = {};
    alimentadorLines = {};
    alimLoadedRegion = reg;
    return;
  }

  alimLoadPromise = (async () => {
    try {
      if (!window.toGeoJSON) throw new Error('toGeoJSON não encontrado (script não carregou).');
      if (!window.JSZip && cfg.type === 'kmz') throw new Error('JSZip não encontrado (script não carregou).');

      let kmlText = '';

      if (cfg.type === 'kml') {
        const res = await fetch(cfg.path, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        kmlText = await res.text();
      } else {
        const res = await fetch(cfg.path, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = await res.arrayBuffer();

        const zip = await window.JSZip.loadAsync(buf);
        const kmlFileName = Object.keys(zip.files).find(n => n.toLowerCase().endsWith('.kml'));
        if (!kmlFileName) throw new Error('KMZ sem arquivo .kml interno');

        kmlText = await zip.files[kmlFileName].async('text');
      }

      const { centers, linesByBase } = parseKmlLinesToIndex(kmlText);

      alimentadorCenters = centers || {};
      alimentadorLines = linesByBase || {};
      alimLoadedRegion = reg;

      console.log('[ALIM] carregado p/ regional:', reg, 'bases:', Object.keys(alimentadorCenters).length);
    } catch (e) {
      console.warn('[ALIM] Falha ao carregar alimentadores da regional:', reg, e);
      alimentadorCenters = {};
      alimentadorLines = {};
      alimLoadedRegion = reg;
    } finally {
      alimLoadPromise = null;
    }
  })();

  return alimLoadPromise;
}

/* =========================
   REGION LOADER (KML / KMZ -> GeoJSON)
========================= */
async function loadRegionGeoJSON(regionKey) {
  if (regionKey === 'TODOS') return null;

  if (cacheHas(regionKey)) return regionGeoJSONCache[regionKey];

  const cfg = REGION_FILES[regionKey];
  if (!cfg) {
    regionGeoJSONCache[regionKey] = null;
    return null;
  }

  try {
    if (!window.toGeoJSON) throw new Error('toGeoJSON não encontrado.');

    if (cfg.type === 'kml') {
      const res = await fetch(cfg.path, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const kmlText = await res.text();

      const parser = new DOMParser();
      const kmlDoc = parser.parseFromString(kmlText, 'text/xml');
      const geojson = window.toGeoJSON.kml(kmlDoc);

      regionGeoJSONCache[regionKey] = geojson;
      return geojson;
    }

    const res = await fetch(cfg.path, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = await res.arrayBuffer();

    if (!window.JSZip) throw new Error('JSZip não encontrado');

    const zip = await window.JSZip.loadAsync(buf);
    const kmlFileName = Object.keys(zip.files).find(n => n.toLowerCase().endsWith('.kml'));
    if (!kmlFileName) throw new Error('KMZ sem arquivo .kml interno');

    const kmlText = await zip.files[kmlFileName].async('text');

    const parser = new DOMParser();
    const kmlDoc = parser.parseFromString(kmlText, 'text/xml');
    const geojson = window.toGeoJSON.kml(kmlDoc);

    regionGeoJSONCache[regionKey] = geojson;
    return geojson;
  } catch (e) {
    console.warn(`[REGION] Falha ao carregar regional ${regionKey}:`, e);
    regionGeoJSONCache[regionKey] = null;
    return null;
  }
}

function drawRegionBoundary(geojson, label) {
  if (!map) return;

  if (regionLayer) {
    try { map.removeLayer(regionLayer); } catch (_) {}
    regionLayer = null;
  }

  if (!geojson) return;

  regionLayer = L.geoJSON(geojson, {
    filter: (feature) => {
      const t = feature?.geometry?.type;
      return t === 'Polygon' || t === 'MultiPolygon';
    },
    style: {
      color: '#0f172a',
      weight: 2,
      opacity: 0.85,
      fillColor: '#0f172a',
      fillOpacity: 0.03
    }
  }).addTo(map);

  regionLayer.bindPopup(`<strong>Regional:</strong> ${label}`);
}

/* =========================
   UI (sem painel alimentadores)
========================= */
function ensureMapUI() {
  if (uiMounted) return;
  uiMounted = true;

  const container = map.getContainer();
  const wrap = document.createElement('div');
  wrap.style.position = 'absolute';
  wrap.style.top = '10px';
  wrap.style.right = '10px';
  wrap.style.zIndex = '800';
  wrap.style.display = 'flex';
  wrap.style.flexDirection = 'column';
  wrap.style.gap = '8px';

  const box = document.createElement('div');
  box.style.background = 'rgba(255,255,255,0.92)';
  box.style.border = '1px solid rgba(0,0,0,0.12)';
  box.style.borderRadius = '10px';
  box.style.padding = '10px';
  box.style.boxShadow = '0 6px 18px rgba(0,0,0,0.12)';
  box.style.fontFamily = 'Inter, system-ui, Arial';
  box.style.fontSize = '12px';
  box.style.fontWeight = '700';
  box.innerHTML = `
    <div style="margin-bottom:8px;">Mapa:</div>

    <div style="display:flex; gap:6px;">
      <button id="btnModeConj">Conjunto</button>
      <button id="btnModeAlim">Alimentador</button>
    </div>

    <div style="margin-top:10px;">Base:</div>
    <div style="display:flex; gap:6px; flex-wrap:wrap;">
      <button id="btnBaseOSM">Mapa</button>
      <button id="btnBaseSTR">Ruas (HD)</button>
      <button id="btnBaseSAT">Satélite</button>
    </div>

    <div style="margin-top:10px; font-size: 11px; color: #444; font-weight: 900;">
      Regional: <span id="mapRegionalLabel">${currentRegion}</span>
    </div>
  `;

  const styleBtnBase =
    'padding:6px 10px;border-radius:8px;border:1px solid #ddd;cursor:pointer;font-weight:800;';
  const styleActive = 'background:#0A4A8C;color:#fff;border-color:#0A4A8C;';
  const styleInactive = 'background:#fff;color:#111;border-color:#ddd;';

  wrap.appendChild(box);
  container.appendChild(wrap);

  const btnConj = box.querySelector('#btnModeConj');
  const btnAlim = box.querySelector('#btnModeAlim');

  btnConjRef = btnConj;
  btnAlimRef = btnAlim;

  // ✅ Base map buttons
  const btnBaseOSM = box.querySelector('#btnBaseOSM');
  const btnBaseSTR = box.querySelector('#btnBaseSTR');
  const btnBaseSAT = box.querySelector('#btnBaseSAT');

  const paintButtons = () => {
    btnConj.style.cssText = styleBtnBase + (mode === 'CONJUNTO' ? styleActive : styleInactive);
    btnAlim.style.cssText = styleBtnBase + (mode === 'ALIMENTADOR' ? styleActive : styleInactive);
  };

  const paintBaseButtons = () => {
    btnBaseOSM.style.cssText = styleBtnBase + (currentBase === 'OSM' ? styleActive : styleInactive);
    btnBaseSTR.style.cssText = styleBtnBase + (currentBase === 'STREETS' ? styleActive : styleInactive);
    btnBaseSAT.style.cssText = styleBtnBase + (currentBase === 'SAT' ? styleActive : styleInactive);
  };

  function setBase(kind) {
    if (!map) return;

    // remove todas as bases
    try {
      if (baseLayerOSM) map.removeLayer(baseLayerOSM);
      if (baseLayerStreetsHD) map.removeLayer(baseLayerStreetsHD);
      if (baseLayerSat) map.removeLayer(baseLayerSat);
      if (baseLayerSatLabels) map.removeLayer(baseLayerSatLabels);
    } catch (_) {}

    if (kind === 'OSM') {
      if (baseLayerOSM) map.addLayer(baseLayerOSM);
      map.setMaxZoom(18);
      currentBase = 'OSM';
    } else if (kind === 'STREETS') {
      if (baseLayerStreetsHD) map.addLayer(baseLayerStreetsHD);
      map.setMaxZoom(20);
      currentBase = 'STREETS';
    } else if (kind === 'SAT') {
      if (baseLayerSat) map.addLayer(baseLayerSat);
      if (baseLayerSatLabels) map.addLayer(baseLayerSatLabels);
      map.setMaxZoom(18);
      currentBase = 'SAT';
    }

    paintBaseButtons();
  }

  btnConj.addEventListener('click', async () => {
    if (mode === 'CONJUNTO') return;
    mode = 'CONJUNTO';
    paintButtons();
    await updateHeatmap(lastData);
  });

  btnAlim.addEventListener('click', async () => {
    if (mode === 'ALIMENTADOR') return;
    mode = 'ALIMENTADOR';
    paintButtons();
    await updateHeatmap(lastData);
  });

  btnBaseOSM.addEventListener('click', () => setBase('OSM'));
  btnBaseSTR.addEventListener('click', () => setBase('STREETS'));
  btnBaseSAT.addEventListener('click', () => setBase('SAT'));

  if (!legendMounted) {
    legendMounted = true;

    const legend = document.createElement('div');
    legend.style.marginTop = '10px';
    legend.style.paddingTop = '10px';
    legend.style.borderTop = '1px solid rgba(0,0,0,0.10)';
    legend.innerHTML = `
      <div style="font-size:11px; font-weight:900; margin-bottom:6px;">Intensidade</div>
      <div style="
        height:10px;
        border-radius:999px;
        background: linear-gradient(90deg,
          ${HEAT_GRADIENT[0.00]},
          ${HEAT_GRADIENT[0.25]},
          ${HEAT_GRADIENT[0.50]},
          ${HEAT_GRADIENT[0.75]},
          ${HEAT_GRADIENT[1.00]}
        );
        border: 1px solid rgba(0,0,0,0.12);
      "></div>
      <div style="display:flex; justify-content:space-between; margin-top:6px; font-size:11px; color:#111; font-weight:900;">
        <span>0</span>
        <span>50+</span>
      </div>
    `;
    box.appendChild(legend);
  }

  paintButtons();
  paintBaseButtons();
}

function updateMapRegionalLabel() {
  if (!map) return;
  const el = map.getContainer()?.querySelector('#mapRegionalLabel');
  if (el) el.textContent = currentRegion;
}

/* =========================
   EXPORTS
========================= */
export function initMap() {
  const el = document.getElementById('mapaCeara');
  if (!el) return;
  if (map) return;

  map = L.map('mapaCeara').setView([-4.8, -39.5], 7);

  // ✅ Base layers
  baseLayerOSM = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '© OpenStreetMap'
  });

  // ✅ Ruas (HD) — zoom mais próximo + nomes de ruas melhores
  baseLayerStreetsHD = L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    {
      subdomains: 'abcd',
      maxZoom: 20,
      attribution: '© OpenStreetMap © CARTO'
    }
  );

  // ✅ Satélite (Esri)
  baseLayerSat = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {
      maxZoom: 18,
      attribution: 'Tiles © Esri'
    }
  );

  // ✅ Labels (Esri) para satélite (nomes/limites)
  baseLayerSatLabels = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    {
      maxZoom: 18,
      attribution: 'Labels © Esri'
    }
  );

  // começa no OSM
  baseLayerOSM.addTo(map);
  map.setMaxZoom(18);
  currentBase = 'OSM';

  markersLayer = L.layerGroup().addTo(map);
  linesLayer = L.layerGroup().addTo(map);
  estruturasLayer = L.layerGroup().addTo(map);

  ensureMapUI();
  updateMapRegionalLabel();
}

export function setMapRegional(regional) {
  currentRegion = normalizeRegionalKey(regional);
  if (map) updateMapRegionalLabel();
}

export function resetMap() {
  lastData = [];

  if (!map) initMap();
  if (!map) return;

  mode = 'CONJUNTO';

  purgeAllHeatLayers();

  if (heatLayer) { try { map.removeLayer(heatLayer); } catch (_) {} heatLayer = null; }
  if (markersLayer) markersLayer.clearLayers();
  if (linesLayer) linesLayer.clearLayers();
  if (estruturasLayer) estruturasLayer.clearLayers();

  if (regionLayer) { try { map.removeLayer(regionLayer); } catch (_) {} regionLayer = null; }

  if (btnConjRef && btnAlimRef) {
    const base = 'padding:6px 10px;border-radius:8px;border:1px solid #ddd;cursor:pointer;font-weight:800;';
    const active = 'background:#0A4A8C;color:#fff;border-color:#0A4A8C;';
    const inactive = 'background:#fff;color:#111;border-color:#ddd;';
    btnConjRef.style.cssText = base + active;
    btnAlimRef.style.cssText = base + inactive;
  }
}

function getAlimRawFromRow(row) {
  if (!row || typeof row !== 'object') return '';
  return (
    row['ALIMENT.'] ??
    row['ALIMENT'] ??
    row['ALIMENTADOR'] ??
    row['ALIMENTADOR '] ??
    row['ALIMENT. '] ??
    ''
  );
}

function buildBaseDisplayNameMap(rows) {
  const m = new Map();
  (rows || []).forEach(row => {
    const raw = getAlimRawFromRow(row);
    const base = extractAlimBase(raw);
    const key = normKey(base);
    if (!key) return;
    if (!m.has(key)) m.set(key, String(base || '').trim());
  });
  return m;
}

function buildIntensityByBaseFromRows(rows) {
  const map = new Map();

  (rows || []).forEach(row => {
    const raw = getAlimRawFromRow(row);
    if (!raw) return;

    const base = extractAlimBase(raw);
    const key = normKey(base);
    if (!key) return;

    map.set(key, (map.get(key) || 0) + 1);
  });

  return map;
}

export async function updateHeatmap(data) {
  lastData = Array.isArray(data) ? data : [];
  const seq = ++renderSeq;

  if (!map) initMap();
  if (!map) return;

  ensureMapUI();
  purgeAllHeatLayers();

  if (heatLayer) { try { map.removeLayer(heatLayer); } catch (_) {} heatLayer = null; }
  if (markersLayer) markersLayer.clearLayers();
  if (linesLayer) linesLayer.clearLayers();
  if (estruturasLayer) estruturasLayer.clearLayers();

  const regionGeo = await loadRegionGeoJSON(currentRegion);
  if (seq !== renderSeq) return;

  drawRegionBoundary(regionGeo, currentRegion);
  updateMapRegionalLabel();

  if (!lastData.length) return;

  const maxCap = 50;

  if (mode === 'CONJUNTO') {
    let points = generateHeatmapByConjunto(lastData);
    if (seq !== renderSeq) return;
    if (!points.length) return;

    if (regionGeo && geojsonHasPolygon(regionGeo)) {
      points = points.filter(p => pointInGeoJSON(p.lat, p.lng, regionGeo));
      if (!points.length) return;
    }

    const maxObserved = points.reduce((m, p) => Math.max(m, Number(p.intensity) || 0), 0);
    const maxHeat = clamp(Math.round(maxObserved * 0.35), 12, maxCap);

    const heatPoints = points.map(p => [
      p.lat,
      p.lng,
      scaleIntensityForHeat(Number(p.intensity) || 0, maxCap)
    ]);

    heatLayer = L.heatLayer(heatPoints, {
      radius: 44,
      blur: 34,
      maxZoom: 10,
      max: maxHeat,
      minOpacity: 0.55,
      gradient: HEAT_GRADIENT
    }).addTo(map);

    for (const p of points) {
      L.circleMarker([p.lat, p.lng], {
        radius: 6,
        color: 'rgba(255,255,255,0.85)',
        fillColor: '#0A4A8C',
        fillOpacity: 0.35,
        weight: 1
      })
        .bindPopup(`<strong>${p.label}</strong><br>Reiteradas (total): <b>${p.intensity}</b>`)
        .addTo(markersLayer);
    }

    const boundsPts = L.latLngBounds(points.map(p => [p.lat, p.lng]));
    if (regionLayer) {
      try {
        const boundsRegion = regionLayer.getBounds();
        map.fitBounds(boundsRegion.isValid() ? boundsRegion : boundsPts, { padding: [40, 40] });
      } catch (_) {
        map.fitBounds(boundsPts, { padding: [40, 40] });
      }
    } else {
      map.fitBounds(boundsPts, { padding: [40, 40] });
    }

    return;
  }

  // ALIMENTADOR (sem painel)
  await loadAlimentadoresForRegionOnce(currentRegion);
  if (seq !== renderSeq) return;

  const displayByBase = buildBaseDisplayNameMap(lastData);

  const intensityByBase = buildIntensityByBaseFromRows(lastData);
  if (!intensityByBase.size) return;

  const rankedBases = Array.from(intensityByBase.entries())
    .filter(([, v]) => (Number(v) || 0) > 0)
    .sort((a, b) => (Number(b[1]) || 0) - (Number(a[1]) || 0))
    .map(([k]) => k);

  const queue = [];
  for (const baseKey of rankedBases) {
    const lines = alimentadorLines[baseKey];
    if (!lines || !lines.length) continue;

    const intensity = Number(intensityByBase.get(baseKey) || 0);
    if (intensity <= 0) continue;

    const display =
      displayByBase.get(baseKey) ||
      alimentadorCenters?.[baseKey]?.display ||
      baseKey;

    const style = lineStyleByIntensity(intensity, maxCap);

    for (const latlngs of lines) {
      queue.push({ baseKey, display, intensity, latlngs, style });
    }
  }

  if (!queue.length) return;

  let i = 0;
  const BATCH = 40;

  function drawBatch() {
    if (seq !== renderSeq) return;

    const end = Math.min(i + BATCH, queue.length);

    for (; i < end; i++) {
      const { display, intensity, latlngs, style } = queue[i];

      if (regionGeo && geojsonHasPolygon(regionGeo)) {
        let anyInside = false;
        for (let k = 0; k < latlngs.length; k += 10) {
          const [lat, lng] = latlngs[k];
          if (pointInGeoJSON(lat, lng, regionGeo)) { anyInside = true; break; }
        }
        if (!anyInside) continue;
      }

      const simplified = decimateLatLngs(latlngs, 10);

      const line = L.polyline(simplified, style)
        .bindPopup(`<strong>${display}</strong><br>Reiteradas (total): <b>${intensity}</b>`);

      line.addTo(linesLayer);
    }

    if (i < queue.length) requestAnimationFrame(drawBatch);
  }

  requestAnimationFrame(drawBatch);
}

/* =========================
   Estruturas (pinos) - CD / F / R
   + popup com Reiteradas e Alimentador (pelo dataset do card)
========================= */
function normKey2(v) {
  return String(v ?? '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// extrai código tipo SEC5218 / TLM8264 / RTB0292 etc
function extractElementoCode(el) {
  const s = normKey2(el);
  const m = s.match(/([A-Z]{2,4}\d{4})/);
  return m ? m[1] : '';
}

function getElementoRawFromRow(row) {
  return String(
    row?.ELEMENTO ??
    row?.Elemento ??
    row?.elemento ??
    ''
  ).trim();
}

function getAlimRawFromRow2(row) {
  return (
    row?.['ALIMENT.'] ??
    row?.['ALIMENT'] ??
    row?.['ALIMENTADOR'] ??
    row?.['ALIMENTADOR '] ??
    row?.['ALIMENT. '] ??
    ''
  );
}

function extractAlimBaseFlex(name) {
  const n = normKey2(name);
  const m = n.match(/([A-Z]{2,4}\s?\d{2,3})/);
  if (!m) return '';
  return m[1].replace(/\s+/g, '');
}

function elementToCat(el) {
  const code = extractElementoCode(el) || String(el || '').trim().toUpperCase();
  const first = code.charAt(0);
  if (first === 'T') return 'CD';
  if (first === 'R') return 'R';
  if (first === 'F') return 'F';
  if (first === 'S') return 'F'; // SEC como fusível
  return '';
}

export async function updateEstruturasPins(rows, opts = {}) {
  if (!map) initMap();
  if (!map) return { total: 0, shown: 0 };

  if (estruturasLayer) estruturasLayer.clearLayers();

  const regional = (opts.regional || '').toUpperCase().trim();
  const catSet = new Set((opts.categories || ['CD','F','R']).map(c => String(c).toUpperCase().trim()));
  const alimFilter = String(opts.alimentadorBase || 'TODOS').toUpperCase().trim();

  const data = Array.isArray(rows) ? rows : [];
  if (!data.length) return { total: 0, shown: 0 };

  // wanted codes + contagem/alim pelo dataset do card
  const wantedElements = new Set();
  const elemCount = new Map();     // code -> qtd
  const elemAlimCount = new Map(); // code -> Map(alim -> qtd)

  function bestAlimFor(code) {
    const m = elemAlimCount.get(code);
    if (!m || !m.size) return '';
    let best = '';
    let bestV = -1;
    for (const [k, v] of m.entries()) {
      if (v > bestV) { bestV = v; best = k; }
    }
    return best;
  }

  for (const r of data) {
    const rawEl = getElementoRawFromRow(r);
    if (!rawEl) continue;

    // filtro por alimentador
    if (alimFilter !== 'TODOS') {
      const rawAl = getAlimRawFromRow2(r);
      const base = extractAlimBaseFlex(rawAl);
      if (!base) continue;
      if (String(base).toUpperCase() !== alimFilter) continue;
    }

    // filtro por categoria
    const cat = elementToCat(rawEl);
    if (cat && !catSet.has(cat)) continue;

    const code = extractElementoCode(rawEl);
    if (!code) continue;

    wantedElements.add(code);
    elemCount.set(code, (elemCount.get(code) || 0) + 1);

    const rawAl = getAlimRawFromRow2(r);
    const alimBase = extractAlimBaseFlex(rawAl);
    if (alimBase) {
      if (!elemAlimCount.has(code)) elemAlimCount.set(code, new Map());
      const m = elemAlimCount.get(code);
      const k = String(alimBase).toUpperCase();
      m.set(k, (m.get(k) || 0) + 1);
    }
  }

  if (!wantedElements.size) return { total: 0, shown: 0 };

  // carrega estruturas da regional
  const estruturas = await loadEstruturasRegionalOnce(regional);
  if (!estruturas.length) return { total: 0, shown: 0 };

  // match robusto
  const matches = estruturas.filter(p => {
    if (!p) return false;

    const pCat = String(p.category || '').toUpperCase().trim();
    if (!catSet.has(pCat)) return false;

    const pCode = extractElementoCode(p.name) || extractElementoCode(p.nameKey) || '';
    if (!pCode) return false;

    return wantedElements.has(pCode);
  });

  if (!matches.length) return { total: estruturas.length, shown: 0 };

  for (const p of matches) {
    const pCode = extractElementoCode(p.name) || extractElementoCode(p.nameKey) || (p.nameKey || p.name || '');
    const qtd = elemCount.get(pCode) || 0;
    const alim = bestAlimFor(pCode);

    const marker = L.marker([p.lat, p.lng]).bindPopup(
      `
      <strong>${pCode}</strong>
      <br>Cat: <b>${p.category}</b>
      <br>Reiteradas: <b>${qtd}</b>
      ${alim ? `<br>Alimentador: <b>${alim}</b>` : ``}
      `
    );

    marker.addTo(estruturasLayer);
  }

  try {
    const b = L.latLngBounds(matches.map(p => [p.lat, p.lng]));
    if (b.isValid()) map.fitBounds(b, { padding: [40, 40] });
  } catch (_) {}

  console.log('[PINS] wanted:', wantedElements.size, 'matches:', matches.length);
  return { total: estruturas.length, shown: matches.length, matches };
}
