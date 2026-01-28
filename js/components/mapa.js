import { generateHeatmapByAlimentador, generateHeatmapByConjunto } from '../services/data-service.js';

let map;
let heatLayer;
let markersLayer;
let kmlLayer;

let uiMounted = false;
let mode = 'CONJUNTO'; // 'CONJUNTO' | 'ALIMENTADOR'

// cache do último dataset para re-render imediato ao trocar modo
let lastData = [];

// alimentadorBaseNorm -> { lat, lng, display }
let alimentadorCenters = {};
// alimentadorBaseNorm -> array de linhas (cada linha = [[lat,lng],...])
let alimentadorLines = {};

const KML_PATH = 'assets/doc.kml';

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
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractAlimBase(name) {
  const n = normKey(name);
  const m = n.match(/([A-Z]{3}\s?\d{2})/);
  if (!m) return n;
  return m[1].replace(/\s+/g, '');
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

// vermelho com alpha crescente (para linhas KML)
function lineStyleByIntensity(intensity) {
  const t = clamp(intensity, 0, 50) / 50;
  const alpha = 0.15 + 0.85 * t;
  const weight = 1.5 + 5.5 * t;
  return {
    color: `rgba(255, 0, 0, ${alpha.toFixed(3)})`,
    weight,
    opacity: 1
  };
}

/**
 * Gradient “mapa de calor real” (tipo meteorologia):
 * Azul → Verde → Amarelo → Laranja → Vermelho
 * IMPORTANTE: as keys são 0..1
 */
function heatGradient() {
  return {
    0.00: 'rgba(0, 80, 255, 0.35)',  // azul
    0.25: 'rgba(0, 200, 120, 0.55)', // verde
    0.50: 'rgba(255, 230, 0, 0.70)', // amarelo
    0.75: 'rgba(255, 140, 0, 0.85)', // laranja
    1.00: 'rgba(255, 0, 0, 0.95)'    // vermelho
  };
}

/* =========================
   UI
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
      <button id="btnModeConj" style="padding:6px 10px;border-radius:8px;border:1px solid #ddd;cursor:pointer;">Conjunto</button>
      <button id="btnModeAlim" style="padding:6px 10px;border-radius:8px;border:1px solid #ddd;cursor:pointer;">Alimentador</button>
    </div>
  `;

  const legend = document.createElement('div');
  legend.style.background = 'rgba(255,255,255,0.92)';
  legend.style.border = '1px solid rgba(0,0,0,0.12)';
  legend.style.borderRadius = '10px';
  legend.style.padding = '10px';
  legend.style.boxShadow = '0 6px 18px rgba(0,0,0,0.12)';
  legend.style.fontFamily = 'Inter, system-ui, Arial';
  legend.style.fontSize = '12px';
  legend.style.fontWeight = '700';
  legend.innerHTML = `
    <div style="margin-bottom:8px;">Intensidade (0 → 50)</div>
    <div style="height:10px;border-radius:8px;background: linear-gradient(90deg,
      rgba(0,80,255,0.6),
      rgba(0,200,120,0.7),
      rgba(255,230,0,0.8),
      rgba(255,140,0,0.9),
      rgba(255,0,0,0.95)
    );"></div>
    <div style="display:flex;justify-content:space-between;margin-top:6px;font-weight:800;">
      <span>0</span><span>50+</span>
    </div>
    <div style="margin-top:6px;font-weight:600;opacity:.85;">
      Quanto mais perto de 50, mais “quente”.
    </div>
  `;

  wrap.appendChild(box);
  wrap.appendChild(legend);
  container.appendChild(wrap);

  const btnConj = box.querySelector('#btnModeConj');
  const btnAlim = box.querySelector('#btnModeAlim');

  const applyBtnStyle = () => {
    const active = 'background:#0A4A8C;color:#fff;border-color:#0A4A8C;';
    const inactive = 'background:#fff;color:#111;border-color:#ddd;';
    btnConj.style.cssText = btnConj.style.cssText.replace(/background:[^;]*;|color:[^;]*;|border-color:[^;]*;/g, '');
    btnAlim.style.cssText = btnAlim.style.cssText.replace(/background:[^;]*;|color:[^;]*;|border-color:[^;]*;/g, '');

    if (mode === 'CONJUNTO') {
      btnConj.style.cssText += active;
      btnAlim.style.cssText += inactive;
    } else {
      btnAlim.style.cssText += active;
      btnConj.style.cssText += inactive;
    }
  };

  btnConj.addEventListener('click', async () => {
    if (mode === 'CONJUNTO') return;
    mode = 'CONJUNTO';
    applyBtnStyle();
    await updateHeatmap(lastData); // ✅ re-render imediato
  });

  btnAlim.addEventListener('click', async () => {
    if (mode === 'ALIMENTADOR') return;
    mode = 'ALIMENTADOR';
    applyBtnStyle();
    await updateHeatmap(lastData); // ✅ re-render imediato
  });

  applyBtnStyle();
}

/* =========================
   KML PARSER
========================= */
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

      if (!centers[baseKey]) {
        centers[baseKey] = { lat: cLat, lng: cLng, display: base };
      } else {
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

async function loadKmlOnce() {
  if (Object.keys(alimentadorCenters).length > 0) return;

  try {
    const res = await fetch(KML_PATH, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();

    const { centers, linesByBase } = parseKmlLinesToIndex(text);
    alimentadorCenters = centers;
    alimentadorLines = linesByBase;
  } catch (e) {
    console.warn('[KML] Falha ao carregar KML:', e);
    alimentadorCenters = {};
    alimentadorLines = {};
  }
}

/* =========================
   EXPORTS
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
  kmlLayer = L.layerGroup().addTo(map);

  ensureMapUI();
}

export async function updateHeatmap(data) {
  lastData = Array.isArray(data) ? data : [];

  if (!map) initMap();
  if (!map) return;

  ensureMapUI();
  await loadKmlOnce();

  if (heatLayer) {
    map.removeLayer(heatLayer);
    heatLayer = null;
  }
  if (markersLayer) markersLayer.clearLayers();
  if (kmlLayer) kmlLayer.clearLayers();

  if (!Array.isArray(lastData) || lastData.length === 0) return;

  const points =
    mode === 'ALIMENTADOR'
      ? generateHeatmapByAlimentador(lastData, alimentadorCenters)
      : generateHeatmapByConjunto(lastData);

  if (!points.length) return;

  const maxCap = 50;
  const heatPoints = points.map(p => [p.lat, p.lng, clamp(p.intensity, 0, maxCap)]);

  heatLayer = L.heatLayer(heatPoints, {
    radius: mode === 'ALIMENTADOR' ? 26 : 30,
    blur: mode === 'ALIMENTADOR' ? 18 : 20,
    maxZoom: 12,
    max: maxCap,
    minOpacity: 0.35,         // ✅ deixa o “calor” visível mesmo com intensidade baixa
    gradient: heatGradient()  // ✅ multi-cor
  }).addTo(map);

  // markers
  for (const p of points) {
    L.circleMarker([p.lat, p.lng], {
      radius: mode === 'ALIMENTADOR' ? 6 : 7,
      color: '#ffffff',
      fillColor: '#0A4A8C',
      fillOpacity: 0.85,
      weight: 2
    })
      .bindPopup(
        `<strong>${p.label}</strong><br>
         Reiteradas (total): <b>${p.intensity}</b>`
      )
      .addTo(markersLayer);
  }

  // linhas KML no modo ALIMENTADOR
  if (mode === 'ALIMENTADOR') {
    const intensityByBase = new Map();
    for (const p of points) {
      const baseKey = normKey(p.base || p.label);
      intensityByBase.set(baseKey, p.intensity);
    }

    let drawn = 0;

    for (const [baseKey, lines] of Object.entries(alimentadorLines)) {
      const intensity = intensityByBase.get(baseKey) || 0;
      if (intensity <= 0) continue;

      const style = lineStyleByIntensity(intensity);

      for (const latlngs of lines) {
        L.polyline(latlngs, { ...style })
          .bindPopup(
            `<strong>${alimentadorCenters[baseKey]?.display || baseKey}</strong><br>
             Intensidade: <b>${intensity}</b>`
          )
          .addTo(kmlLayer);
        drawn++;
      }
    }

    console.log('[MAP] linhas desenhadas:', drawn);
  }

  map.fitBounds(points.map(p => [p.lat, p.lng]), { padding: [40, 40] });
}
