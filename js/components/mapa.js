/**
 * Componente Mapa - Mapa de calor do Ceará com Leaflet
 */

import { generateHeatmapData } from '../services/data-service.js';

let map = null;
let heatLayer = null;
let markersLayer = null;

/**
 * Inicializar mapa
 */
export function initMap() {
  const mapContainer = document.getElementById('mapaCeara');
  if (!mapContainer) return;

  // se já existe, não recria
  if (map) return;

  // Centro do Ceará
  map = L.map('mapaCeara', { scrollWheelZoom: true }).setView([-4.2250, -39.1353], 7);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 18
  }).addTo(map);
}

/**
 * Atualizar mapa de calor
 */
export function updateHeatmap(data) {
  if (!map) initMap();
  if (!map) return;

  const heatmapPoints = generateHeatmapData(data);

  if (!heatmapPoints || heatmapPoints.length === 0) {
    console.warn('[MAPA] Sem pontos para heatmap. Verifique CONJUNTO x coordenadas.');
    return;
  }

  // remove heat anterior
  if (heatLayer) {
    map.removeLayer(heatLayer);
    heatLayer = null;
  }

  // remove marcadores anteriores
  if (markersLayer) {
    map.removeLayer(markersLayer);
    markersLayer = null;
  }

  const points = heatmapPoints.map(p => [p.lat, p.lng, p.intensity]);

  if (typeof L.heatLayer === 'function') {
    heatLayer = L.heatLayer(points, {
      radius: 28,
      blur: 18,
      maxZoom: 17
    }).addTo(map);
  } else {
    console.error('[MAPA] leaflet.heat não carregou. L.heatLayer não existe.');
    return;
  }

  // camada de marcadores
  markersLayer = L.layerGroup().addTo(map);

  heatmapPoints.forEach(point => {
    L.circleMarker([point.lat, point.lng], {
      radius: 8,
      weight: 2,
      opacity: 1,
      fillOpacity: 0.85
    })
      .bindPopup(`<strong>Ocorrências:</strong> ${point.intensity}`)
      .addTo(markersLayer);
  });

  // enquadrar bounds
  const bounds = L.latLngBounds(heatmapPoints.map(p => [p.lat, p.lng]));
  map.fitBounds(bounds, { padding: [40, 40] });

  // FIX: Leaflet às vezes não renderiza direito se o container acabou de aparecer
  setTimeout(() => map.invalidateSize(), 120);
}
    