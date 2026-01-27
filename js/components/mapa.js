import {
  generateHeatmapByAlimentador,
  generateHeatmapByConjunto
} from '../services/data-service.js';

let map;
let heatLayer;
let markersLayer;

let kmlLinesLayer;          // ✅ camada das linhas (alimentadores)
let alimentadorCoords = null;
let alimentadorLines = null; // ✅ prefixo -> GeoJSON feature(s)
let kmlLoading = null;

let currentMode = 'ALIMENTADOR'; // ALIMENTADOR | CONJUNTO
let lastData = [];

const MAX_INTENSITY = 50;

/* =========================
   HELPERS
========================= */
function normKey(v) {
  return String(v ?? '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractAlimPrefix(nameNorm) {
  // tenta pegar algo como QXD01 / IPU02 / etc
  const m = nameNorm.match(/([A-Z]{3}\s?\d{2})/);
  if (!m) return null;
  return m[1].replace(/\s+/g, '');
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

/* =========================
   KML -> (coords + lines)
========================= */
async function loadKML(url = 'assets/doc.kml') {
  if (kmlLoading) return kmlLoading;

  // normaliza
  const norm = (v) =>
    String(v ?? '')
      .trim()
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  // tenta extrair uma “chave” do alimentador a partir do nome
  // (funciona para vários formatos diferentes)
  function extractAlimKey(nameRaw) {
    const s = norm(nameRaw)
      .replace(/\bALIMENTADOR\b/g, '')
      .replace(/\bALIMENT\b/g, '')
      .replace(/\bALIM\b/g, '')
      .replace(/\bCIRCUITO\b/g, '')
      .trim();

    // pega o primeiro “token” forte (ex.: QXD01, IPU 02, ARARAS I, etc)
    // 1) padrões com letras + números
    let m = s.match(/\b([A-Z]{2,6}\s?\d{1,3})\b/);
    if (m) return m[1].replace(/\s+/g, '');

    // 2) às vezes vem só número ou código curto
    m = s.match(/\b(\d{2,4})\b/);
    if (m) return m[1];

    // 3) fallback: primeiro token
    const tok = s.split(' ')[0];
    return tok || null;
  }

  function parseCoordString(coordText) {
    // KML: "lon,lat,alt lon,lat,alt ..."
    const parts = String(coordText || '').trim().split(/\s+/g);
    const coords = [];
    for (const p of parts) {
      const [lonStr, latStr] = p.split(',');
      const lon = Number(lonStr);
      const lat = Number(latStr);
      if (Number.isFinite(lat) && Number.isFinite(lon)) coords.push([lat, lon]);
    }
    return coords;
  }

  kmlLoading = (async () => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Falha ao carregar KML: ${res.status} ${res.statusText}`);

    const kmlText = await res.text();
    const xml = new DOMParser().parseFromString(kmlText, 'text/xml');

    const placemarks = Array.from(xml.getElementsByTagName('Placemark'));

    // ✅ coords exatas (Point) por alimentador
    const coordsOut = {}; // keyNorm -> {lat,lng,display}
    // ✅ linhas por alimentador
    const byKey = new Map(); // key -> array de latlng arrays (polylines)

    for (const pm of placemarks) {
      const nameNode = pm.getElementsByTagName('name')[0];
      const nameRaw = nameNode ? nameNode.textContent : '';
      const key = extractAlimKey(nameRaw);
      if (!key) continue;

      const keyNorm = norm(key);

      // 1) Point (coordenada exata)
      const pointNode = pm.getElementsByTagName('Point')[0];
      if (pointNode) {
        const coordNode = pointNode.getElementsByTagName('coordinates')[0];
        if (coordNode) {
          const pts = parseCoordString(coordNode.textContent);
          if (pts.length) avoid: {
            // pega o 1º ponto do Point
            const [lat, lng] = pts[0];
            coordsOut[keyNorm] = { lat, lng, display: key };
          }
        }
      }

      // 2) LineString / MultiGeometry (trajeto)
      const lineStrings = Array.from(pm.getElementsByTagName('LineString'));
      for (const ls of lineStrings) {
        const coordNode = ls.getElementsByTagName('coordinates')[0];
        if (!coordNode) continue;
        const latlngs = parseCoordString(coordNode.textContent);
        if (!latlngs.length) continue;

        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key).push(latlngs);
      }
    }

    alimentadorCoords = coordsOut;
    alimentadorLines = byKey;

    console.log('[KML] alimentadores carregados:', Object.keys(coordsOut).length, 'linhas:', byKey.size);

    return { coordsOut, byKey };
  })();

  return kmlLoading;
}


/* =========================
   UI: Toggle (simples)
========================= */
function injectSmallCSSOnce() {
  if (document.getElementById('mapExtrasCSS')) return;
  const style = document.createElement('style');
  style.id = 'mapExtrasCSS';
  style.textContent = `
    .map-toggle{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 12px}
    .map-toggle .tbtn{border:1px solid rgba(10,74,140,.18);background:rgba(255,255,255,.9);padding:8px 10px;border-radius:10px;font-weight:800;font-size:12px;cursor:pointer;color:#0A4A8C}
    .map-toggle .tbtn.active{background:#0A4A8C;color:#fff;border-color:#0A4A8C}
  `;
  document.head.appendChild(style);
}

function ensureToggleUI() {
  const mapEl = document.getElementById('mapaCeara');
  if (!mapEl) return;
  if (document.getElementById('mapToggleWrap')) return;

  injectSmallCSSOnce();

  const wrap = document.createElement('div');
  wrap.id = 'mapToggleWrap';
  wrap.className = 'map-toggle';
  wrap.innerHTML = `
    <button id="btnModeAlim" class="tbtn">ALIMENTADOR (KML)</button>
    <button id="btnModeConj" class="tbtn">CONJUNTO (Cidades)</button>
  `;
  mapEl.parentNode.insertBefore(wrap, mapEl);

  const btnAlim = document.getElementById('btnModeAlim');
  const btnConj = document.getElementById('btnModeConj');

  const setActive = () => {
    btnAlim?.classList.toggle('active', currentMode === 'ALIMENTADOR');
    btnConj?.classList.toggle('active', currentMode === 'CONJUNTO');
  };

  btnAlim?.addEventListener('click', async () => {
    currentMode = 'ALIMENTADOR';
    setActive();
    await renderAllLayers(lastData);
  });

  btnConj?.addEventListener('click', async () => {
    currentMode = 'CONJUNTO';
    setActive();
    await renderAllLayers(lastData);
  });

  setActive();
}

/* =========================
   INIT MAP
========================= */
export function initMap() {
  const el = document.getElementById('mapaCeara');
  if (!el) return;
  if (map) return;

  map = L.map('mapaCeara').setView([-4.8, -39.5], 7);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '© OpenStreetMap'
  }).addTo(map);

  markersLayer = L.layerGroup().addTo(map);
  kmlLinesLayer = L.layerGroup().addTo(map);

  ensureToggleUI();

  // carrega KML logo no início (pra desenhar linhas)
  loadKML('assets/doc.kml').catch(err => console.error('[KML] erro:', err));
}

/* =========================
   Render linhas do KML (com intensidade)
========================= */
function clearMapLayers() {
  if (heatLayer) { map.removeLayer(heatLayer); heatLayer = null; }
  if (markersLayer) markersLayer.clearLayers();
  if (kmlLinesLayer) kmlLinesLayer.clearLayers();
}

function intensityStyle(intensity) {
  // 0..50 => 0..1
  const rel = clamp01(intensity / MAX_INTENSITY);

  // cor fixa (vermelho) variando opacidade + espessura
  // (Leaflet polyline aceita "opacity" e "weight")
  const weight = 2 + Math.round(rel * 6);     // 2..8
  const opacity = 0.25 + rel * 0.70;          // 0.25..0.95

  return { color: '#D32F2F', weight, opacity };
}

function renderKmlLines(intensityByPrefix) {
  if (!alimentadorLines || !kmlLinesLayer) return;

  for (const [prefix, features] of alimentadorLines.entries()) {
    const total = intensityByPrefix.get(prefix) || 0;
    if (total <= 0) continue;

    const st = intensityStyle(total);

    features.forEach(f => {
      const layer = L.geoJSON(f, {
        style: () => st
      });

      layer.eachLayer(l => {
        l.bindPopup(
          `<strong>Alimentador: ${prefix}</strong><br>` +
          `Reiteradas (total): <b>${total}</b>`
        );
      });

      layer.addTo(kmlLinesLayer);
    });
  }
}

/* =========================
   Render heat + markers + linhas
========================= */
async function renderAllLayers(data) {
  if (!map) initMap();
  if (!map) return;

  lastData = Array.isArray(data) ? data : [];

  clearMapLayers();

  if (!lastData.length) return;

  if (currentMode === 'ALIMENTADOR') {
    // garante KML carregado
    if (!alimentadorCoords || !alimentadorLines) {
      await loadKML('assets/doc.kml').catch(() => null);
    }
    if (!alimentadorCoords || !alimentadorLines) return;

    // 1) heatmap points
    const points = generateHeatmapByAlimentador(lastData, alimentadorCoords);
    if (!points.length) return;

    // 2) desenha heat
    const heatPoints = points.map(p => [p.lat, p.lng, clamp01(p.intensity / MAX_INTENSITY)]);
    heatLayer = L.heatLayer(heatPoints, {
      radius: 45,
      blur: 30,
      minOpacity: 0.35,
      maxZoom: 11,
      gradient: {
        0.10: '#6EC6FF',
        0.30: '#2196F3',
        0.55: '#FFC107',
        0.75: '#FF9800',
        1.00: '#B71C1C'
      }
    }).addTo(map);

    // 3) markers
    points.forEach(p => {
      const rel = clamp01(p.intensity / MAX_INTENSITY);
      const r = 6 + Math.round(rel * 12);
      const op = 0.55 + rel * 0.40;

      L.circleMarker([p.lat, p.lng], {
        radius: r,
        color: '#ffffff',
        fillColor: '#003876',
        fillOpacity: op,
        weight: 2
      })
        .bindPopup(
          `<strong>Alimentador: ${p.label}</strong><br>` +
          `Reiteradas (total): <b>${p.intensity}</b>`
        )
        .addTo(markersLayer);
    });

    // 4) linhas do KML com intensidade por alimentador
    const intensityByPrefix = new Map();
    points.forEach(p => intensityByPrefix.set(p.label, p.intensity));
    // ⚠️ p.label aqui é o "display" (prefix). garantimos isso no KML loader
    renderKmlLines(intensityByPrefix);

    map.fitBounds(points.map(p => [p.lat, p.lng]), { padding: [40, 40] });
    if (map.getZoom() > 10) map.setZoom(10);
  } else {
    // CONJUNTO
    const points = generateHeatmapByConjunto(lastData);
    if (!points.length) return;

    const heatPoints = points.map(p => [p.lat, p.lng, clamp01(p.intensity / MAX_INTENSITY)]);
    heatLayer = L.heatLayer(heatPoints, {
      radius: 45,
      blur: 30,
      minOpacity: 0.35,
      maxZoom: 11,
      gradient: {
        0.10: '#6EC6FF',
        0.30: '#2196F3',
        0.55: '#FFC107',
        0.75: '#FF9800',
        1.00: '#B71C1C'
      }
    }).addTo(map);

    points.forEach(p => {
      const rel = clamp01(p.intensity / MAX_INTENSITY);
      const r = 6 + Math.round(rel * 12);
      const op = 0.55 + rel * 0.40;

      L.circleMarker([p.lat, p.lng], {
        radius: r,
        color: '#ffffff',
        fillColor: '#003876',
        fillOpacity: op,
        weight: 2
      })
        .bindPopup(
          `<strong>Conjunto: ${p.label}</strong><br>` +
          `Reiteradas (total): <b>${p.intensity}</b>`
        )
        .addTo(markersLayer);
    });

    map.fitBounds(points.map(p => [p.lat, p.lng]), { padding: [40, 40] });
    if (map.getZoom() > 10) map.setZoom(10);
  }
}

export function updateHeatmap(data) {
  renderAllLayers(data);
}
