/**
 * Serviço de Dados - Lógica de negócio para rankings e análises
 */

import { DataService } from './firebase-service.js';

/* =========================
   RANKING POR ELEMENTO
========================= */
export function generateRankingElemento(data) {
  const elementos = {};

  data.forEach(item => {
    const elemento = item.ELEMENTO || item.ELEMENTOS || '';
    if (!elemento) return;

    if (!elementos[elemento]) elementos[elemento] = [];
    elementos[elemento].push(item);
  });

  return Object.entries(elementos)
    .filter(([_, ocorrencias]) => ocorrencias.length > 1)
    .map(([elemento, ocorrencias]) => ({
      elemento,
      count: ocorrencias.length,
      ocorrencias
    }))
    .sort((a, b) => b.count - a.count);
}

/* =========================
   HEATMAP POR ALIMENTADOR (KML)
========================= */
function extractAlimBase(name) {
  const n = normKey(name);
  // pega padrão: 3 letras + 2 números (QXD01, CND12, etc)
  const m = n.match(/([A-Z]{3}\s?\d{2})/);
  if (!m) return n;
  return m[1].replace(/\s+/g, '');
}

// ✅ normalização forte
function normKey(v) {
  return String(v ?? '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // remove acentos
    .replace(/[^\w\s]/g, ' ')         // pontuação vira espaço
    .replace(/_/g, ' ')               // underscore vira espaço
    .replace(/\s+/g, ' ')             // colapsa espaços
    .trim();
}

// ✅ tenta pegar alimentador de várias colunas possíveis
function getAlimentadorRaw(item) {
  return (
    item.ALIMENT ||
    item.ALIMENTADOR ||
    item.ALIMEN ||
    item.ALIM ||
    item['ALIMENT.'] ||
    item['ALIMEN.'] ||
    ''
  );
}

/**
 * Gera pontos de heatmap por ALIMENTADOR usando coords vindas do KML.
 * @param {Array} data registros normalizados (do Firestore/planilha)
 * @param {Object} alimentadorCoords mapa: ALIM_NORMALIZADO -> {lat,lng, display}
 */
export function generateHeatmapData(data, alimentadorCoords = {}) {
  // alimentadorNorm -> elementoNorm -> contagem
  const byAlim = new Map();

  data.forEach(item => {
    const alimRaw = getAlimentadorRaw(item);
    const alim = extractAlimBase(alimRaw);
    const elemento = normKey(item.ELEMENTO || item.ELEMENTOS);

    if (!alim || !elemento) return;

    if (!byAlim.has(alim)) byAlim.set(alim, new Map());
    const mapElem = byAlim.get(alim);
    mapElem.set(elemento, (mapElem.get(elemento) || 0) + 1);
  });

  const heatmap = [];
  const missing = [];

  for (const [alim, elementos] of byAlim.entries()) {
    // ✅ Reiteradas do alimentador: soma apenas elementos repetidos (>=2)
    let reiteradasTotal = 0;
    for (const count of elementos.values()) {
      if (count >= 2) reiteradasTotal += count;
    }
    if (reiteradasTotal <= 0) continue;

    const coordInfo = alimentadorCoords[alim];
    if (!coordInfo) {
      missing.push(alim);
      continue;
    }

    heatmap.push({
      lat: coordInfo.lat,
      lng: coordInfo.lng,
      intensity: reiteradasTotal,
      // mantém o campo "conjunto" porque o mapa.js usa p.conjunto no popup
      conjunto: coordInfo.display || alim
    });
  }

  console.log('[HEATMAP-ALIM] alimentadores lidos:', byAlim.size, 'pontos:', heatmap.length);
  if (missing.length) console.warn('[HEATMAP-ALIM] sem coords (top 30):', missing.slice(0, 30));
  console.warn('[HEATMAP-ALIM] exemplo alimentadores do KML:', Object.keys(alimentadorCoords).slice(0, 30));


  return heatmap;
}

/* =========================
   FILTRO POR DATA
========================= */
export function filterByDateRange(data, di, df) {
  if (!di && !df) return data;

  return data.filter(item => {
    const d = item.DATA;
    if (!d) return false;
    if (di && d < di) return false;
    if (df && d > df) return false;
    return true;
  });
}

export function getAllColumns(data) {
  const cols = new Set();
  data.forEach(i => Object.keys(i).forEach(k => cols.add(k)));
  return Array.from(cols);
}

export function getOcorrenciasByElemento(data, elemento) {
  return data.filter(i => i.ELEMENTO === elemento);
}
