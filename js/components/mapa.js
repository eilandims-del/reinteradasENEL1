import { generateHeatmapByAlimentador, generateHeatmapByConjunto } from '../services/data-service.js';

let map;
let heatLayer;
let markersLayer;
let kmlLayer;

let uiMounted = false;
let mode = 'CONJUNTO'; // 'CONJUNTO' | 'ALIMENTADOR'
let lastData = [];

// anti-race: só o update mais recente pode desenhar
let renderSeq = 0;

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

function purgeAllHeatLayers() {
  if (!map) return;

  // Remove qualquer heat layer que tenha ficado “órfão”
  Object.values(map._layers || {}).forEach(layer => {
    // leaflet.heat cria layers com propriedade interna "_heat"
    if (layer && layer._heat) {
      try { map.removeLayer(layer); } catch (_) {}
    }
  });
}


/**
 * Paleta real de heat:
 * Azul → Verde → Amarelo → Laranja → Vermelho
 */
const HEAT_GRADIENT = {
  0.00: 'rgba(0, 60, 255, 0.45)',
  0.20: 'rgba(0, 180, 120, 0.65)',
  0.40: 'rgba(255, 230, 0, 0.85)',
  0.65: 'rgba(255, 140, 0, 0.95)',
  1.00: 'rgba(200, 0, 0, 1.00)'
};

// stops para interpolar cor das LINHAS também
const HEAT_STOPS = [
  { t: 0.00, rgb: [0, 80, 255] },
  { t: 0.25, rgb: [0, 200, 120] },
  { t: 0.50, rgb: [255, 230, 0] },
  { t: 0.75, rgb: [255, 140, 0] },
  { t: 1.00, rgb: [255, 0, 0] }
];

function lerp(a, b, t) { return a + (b - a) * t; }

function colorFromIntensity(intensity, max, alpha = 0.95) {
  const x = max > 0 ? clamp(intensity, 0, max) / max : 0;

  let i = 0;
  while (i < HEAT_STOPS.length - 1 && x > HEAT_STOPS[i + 1].t) i++;

  const a = HEAT_STOPS[i];
  const b = HEAT_STOPS[Math.min(i + 1, HEAT_STOPS.length - 1)];

  const span = (b.t - a.t) || 1;
  const tt = (x - a.t) / span;

  const r = Math.round(lerp(a.rgb[0], b.rgb[0], tt));
  const g = Math.round(lerp(a.rgb[1], b.rgb[1], tt));
  const bl = Math.round(lerp(a.rgb[2], b.rgb[2], tt));

  return `rgba(${r}, ${g}, ${bl}, ${alpha})`;
}

function lineStyleByIntensity(intensity, max) {
  const t = max > 0 ? clamp(intensity, 0, max) / max : 0;
  return {
    color: colorFromIntensity(intensity, max, 0.95),
    weight: 1.5 + 6.5 * t,
    opacity: 1
  };
}

// ✅ reforço de contraste do heatmap (fica mais “quente” sem zoom) — usar só no CONJUNTO
function boostIntensity(intensity, maxCap) {
  const x = maxCap > 0 ? clamp(intensity, 0, maxCap) / maxCap : 0; // 0..1
  const y = Math.pow(x, 0.55); // <1 => enfatiza valores altos
  return y * maxCap;
}

/**
 * ✅ Normalização por modo:
 * - CONJUNTO: boost (pra aparecer mais quente no zoom aberto)
 * - ALIMENTADOR: compressão (pra NÃO deixar tudo vermelho)
 */
function scaleIntensityForHeat(intensity, maxCap, currentMode) {
  const v = Number(intensity) || 0;

  if (currentMode === 'CONJUNTO') {
    return boostIntensity(v, maxCap);
  }

  // ALIMENTADOR: comprime (gamma > 1 reduz saturação)
  // Ex.: 10/50 continua baixo (azul/verde), 35/50 vira amarelo/laranja, 50 fica vermelho.
  const x = maxCap > 0 ? clamp(v, 0, maxCap) / maxCap : 0; // 0..1
  const gamma = 1.6;
  const y = Math.pow(x, gamma);
  return y * maxCap;
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
      <button id="btnModeConj">Conjunto</button>
      <button id="btnModeAlim">Alimentador</button>
    </div>
  `;

  const styleBtnBase =
    'padding:6px 10px;border-radius:8px;border:1px solid #ddd;cursor:pointer;font-weight:700;';
  const styleActive = 'background:#0A4A8C;color:#fff;border-color:#0A4A8C;';
  const styleInactive = 'background:#fff;color:#111;border-color:#ddd;';

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
      rgba(0,60,255,0.55),
      rgba(0,180,120,0.65),
      rgba(255,230,0,0.85),
      rgba(255,140,0,0.95),
      rgba(200,0,0,1.0)
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

  const paintButtons = () => {
    btnConj.style.cssText = styleBtnBase + (mode === 'CONJUNTO' ? styleActive : styleInactive);
    btnAlim.style.cssText = styleBtnBase + (mode === 'ALIMENTADOR' ? styleActive : styleInactive);
  };

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

  paintButtons();
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
  const seq = ++renderSeq;

  if (!map) initMap();
  if (!map) return;

  ensureMapUI();
  purgeAllHeatLayers();

  await loadKmlOnce();
  if (seq !== renderSeq) return;

  // limpa layers
  if (heatLayer) { map.removeLayer(heatLayer); heatLayer = null; }
  if (markersLayer) markersLayer.clearLayers();
  if (kmlLayer) kmlLayer.clearLayers();

  if (!lastData.length) return;

  const points =
    mode === 'ALIMENTADOR'
      ? generateHeatmapByAlimentador(lastData, alimentadorCenters)
      : generateHeatmapByConjunto(lastData);

  if (seq !== renderSeq) return;
  if (!points.length) return;

  const maxCap = 50;

  // ✅ maxHeat por modo:
  // - CONJUNTO: “aperta” a escala pra ficar mais quente no zoom aberto
  // - ALIMENTADOR: NÃO apertar, senão satura tudo no vermelho
  const maxObserved = points.reduce((m, p) => Math.max(m, Number(p.intensity) || 0), 0);

  const maxHeat =
    mode === 'CONJUNTO'
      ? clamp(Math.round(maxObserved * 0.35), 12, maxCap)
      : maxCap;

  // ✅ heatPoints por modo (CONJUNTO = boost / ALIMENTADOR = compressão)
  const heatPoints = points.map(p => [
    p.lat,
    p.lng,
    scaleIntensityForHeat(Number(p.intensity) || 0, maxCap, mode)
  ]);

  heatLayer = L.heatLayer(heatPoints, {
    radius: mode === 'ALIMENTADOR' ? 26 : 44,
    blur: mode === 'ALIMENTADOR' ? 18 : 34,
    maxZoom: 10,
    max: maxHeat,
    minOpacity: mode === 'ALIMENTADOR' ? 0.40 : 0.55,
    gradient: HEAT_GRADIENT
  }).addTo(map);

  // markers (deixa mais discreto pra enfatizar o heat)
  for (const p of points) {
    L.circleMarker([p.lat, p.lng], {
      radius: mode === 'ALIMENTADOR' ? 5 : 6,
      color: 'rgba(255,255,255,0.85)',
      fillColor: '#0A4A8C',
      fillOpacity: 0.35,
      weight: 1
    })
      .bindPopup(`<strong>${p.label}</strong><br>Reiteradas (total): <b>${p.intensity}</b>`)
      .addTo(markersLayer);
  }

  // linhas KML (modo ALIMENTADOR) — cor baseada em 0..50 (mesma legenda)
  if (mode === 'ALIMENTADOR') {
    const intensityByBase = new Map();
    for (const p of points) {
      const baseKey = normKey(p.base || p.label);
      intensityByBase.set(baseKey, Number(p.intensity) || 0);
    }

    let drawn = 0;
    for (const [baseKey, lines] of Object.entries(alimentadorLines)) {
      const intensity = intensityByBase.get(baseKey) || 0;
      if (intensity <= 0) continue;

      // ✅ usa maxCap (0..50) pra casar com legenda/gradiente
      const style = lineStyleByIntensity(intensity, maxCap);

      for (const latlngs of lines) {
        L.polyline(latlngs, style)
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

  if (seq !== renderSeq) return;
  map.fitBounds(points.map(p => [p.lat, p.lng]), { padding: [40, 40] });
}
