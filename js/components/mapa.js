import {
  generateHeatmapByAlimentador,
  generateHeatmapByConjunto
} from '../services/data-service.js';

let map;
let heatLayer;
let markersLayer;

let alimentadorCoords = null;
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
  const m = nameNorm.match(/^([A-Z]{3}\s?\d{2})/);
  if (!m) return null;
  return m[1].replace(/\s+/g, '');
}

/* =========================
   KML
========================= */
async function loadAlimentadoresFromKML(url = 'assets/doc.kml') {
  if (alimentadorCoords) return alimentadorCoords;
  if (kmlLoading) return kmlLoading;

  kmlLoading = (async () => {
    const res = await fetch(url);
    const text = await res.text();

    const xml = new DOMParser().parseFromString(text, 'text/xml');
    const placemarks = Array.from(xml.getElementsByTagName('Placemark'));

    const acc = new Map();

    for (const pm of placemarks) {
      const nameEl = pm.getElementsByTagName('name')[0];
      const nameRaw = nameEl ? nameEl.textContent : '';
      const prefix = extractAlimPrefix(normKey(nameRaw));
      if (!prefix) continue;

      const coordsEls = Array.from(pm.getElementsByTagName('coordinates'));
      let sumLat = 0, sumLng = 0, n = 0;

      coordsEls.forEach(cEl => {
        const parts = (cEl.textContent || '').trim().split(/\s+/);
        parts.forEach(p => {
          const [lon, lat] = p.split(',').map(Number);
          if (Number.isFinite(lat) && Number.isFinite(lon)) {
            sumLat += lat;
            sumLng += lon;
            n++;
          }
        });
      });

      if (n === 0) continue;

      if (!acc.has(prefix)) acc.set(prefix, { sumLat: 0, sumLng: 0, n: 0 });
      const a = acc.get(prefix);
      a.sumLat += sumLat;
      a.sumLng += sumLng;
      a.n += n;
    }

    const out = {};
    acc.forEach((v, k) => {
      out[normKey(k)] = {
        lat: v.sumLat / v.n,
        lng: v.sumLng / v.n,
        display: k
      };
    });

    console.log('[KML] alimentadores carregados:', Object.keys(out).length);
    alimentadorCoords = out;
    return out;
  })();

  return kmlLoading;
}

/* =========================
   MAPA
========================= */
export function initMap() {
  if (map) return;

  map = L.map('mapaCeara').setView([-4.8, -39.5], 7);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '© OpenStreetMap'
  }).addTo(map);

  markersLayer = L.layerGroup().addTo(map);

  loadAlimentadoresFromKML();
}

function renderHeatmap(data) {
  if (!map || !data?.length) return;

  let points = [];

  if (currentMode === 'ALIMENTADOR' && alimentadorCoords) {
    points = generateHeatmapByAlimentador(data, alimentadorCoords);
  } else if (currentMode === 'CONJUNTO') {
    points = generateHeatmapByConjunto(data);
  }

  if (!points.length) return;

  if (heatLayer) map.removeLayer(heatLayer);
  markersLayer.clearLayers();

  heatLayer = L.heatLayer(
    points.map(p => [p.lat, p.lng, Math.min(p.intensity / MAX_INTENSITY, 1)]),
    {
      radius: 28,
      blur: 18,
      maxZoom: 10,
      gradient: {
        0.10: '#6EC6FF',
        0.30: '#2196F3',
        0.55: '#FFC107',
        0.75: '#FF9800',
        1.00: '#D32F2F'
      }
    }
  ).addTo(map);

  points.forEach(p => {
    L.circleMarker([p.lat, p.lng], {
      radius: 7,
      color: '#fff',
      fillColor: '#003876',
      fillOpacity: 0.85,
      weight: 2
    })
      .bindPopup(
        `<strong>${currentMode}: ${p.label}</strong><br>
         Reiteradas: <b>${p.intensity}</b>`
      )
      .addTo(markersLayer);
  });

  map.fitBounds(points.map(p => [p.lat, p.lng]), { padding: [40, 40] });
}

export function updateHeatmap(data) {
  lastData = data;
  renderHeatmap(data);
}
