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
    const elemento = item.ELEMENTO || '';
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
   MAPA DE CALOR POR REITERAÇÃO
========================= */
/**
 * Gerar dados para mapa de calor (baseado em CONJUNTO)
 * FIX: normaliza CONJUNTO (remove acentos, espaços duplicados, etc)
 * e normaliza as chaves do dicionário de coordenadas.
 */
export function generateHeatmapData(data) {
    const conjuntosCount = {};
  
    const normalizeKey = (v) => {
      return String(v || '')
        .trim()
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')     // remove acentos
        .replace(/[^\w\s]/g, ' ')            // remove pontuação/hífens
        .replace(/\s+/g, ' ')                // colapsa espaços
        .trim();
    };
  
    // Conta ocorrências por CONJUNTO
    data.forEach(item => {
      const conjuntoRaw = item.CONJUNTO || item['CONJUNTO'] || '';
      const conjunto = normalizeKey(conjuntoRaw);
      if (!conjunto) return;
      conjuntosCount[conjunto] = (conjuntosCount[conjunto] || 0) + 1;
    });
  
    // Coordenadas (AGORA com chaves normalizadas)
    const coordenadasConjuntosRaw = {
      'FORTALEZA': [-3.7172, -38.5433],
      'MARACANAU': [-3.8770, -38.6256],
      'CAUCAIA': [-3.7361, -38.6533],
      'JUAZEIRO DO NORTE': [-7.2133, -39.3153],
      'SOBRAL': [-3.6856, -40.3442],
      'CRATO': [-7.2337, -39.4097],
      'ITAPIPOCA': [-3.4944, -39.5786],
      'MARANGUAPE': [-3.8906, -38.6853],
      'QUIXADA': [-4.9716, -39.0161],
      'IGUATU': [-6.3614, -39.2978],
      'PACATUBA': [-3.9808, -38.6181],
      'AQUIRAZ': [-3.9017, -38.3914],
      'PARACURU': [-3.4106, -39.0317],
      'HORIZONTE': [-4.0917, -38.4956],
      'EUSEBIO': [-3.8936, -38.4508],
      'CANINDE': [-4.3579, -39.3020],
      'TIANGUA': [-3.7322, -40.9917],
      'CRATEUS': [-5.1986, -40.6689],
      'BARBALHA': [-7.3056, -39.3036],
      'ARACATI': [-4.5606, -37.7717],
  
      // os que você listou:
      'ARARAS I': [-4.2096, -40.4498],
      'IPU': [-4.3256, -40.7109],
      'INDEPENDENCIA': [-5.3964, -40.3086],
      'NOVA RUSSAS': [-4.7044, -40.5669],
      'BANABUIU': [-5.3140, -38.9230],
      'SANTA QUITERIA': [-4.3319, -40.1570],
      'MONSENHOR TABOSA': [-4.7861, -40.0606],
      'MACAOCA': [-4.7626, -39.4837],
      'BOA VIAGEM': [-5.1310, -39.7336],
      'ARARENDA': [-4.7525, -40.8330],
      'QUIXERAMOBIM': [-5.0939, -39.3619],
      'INHUPORANGA': [-4.0908, -39.0585],
    };
  
    // Normaliza as chaves do dicionário uma vez
    const coordenadasConjuntos = {};
    Object.entries(coordenadasConjuntosRaw).forEach(([k, v]) => {
      coordenadasConjuntos[normalizeKey(k)] = v;
    });
  
    const heatmapPoints = [];
    const missing = [];
  
    Object.entries(conjuntosCount).forEach(([conjuntoNorm, count]) => {
      const coords = coordenadasConjuntos[conjuntoNorm];
      if (coords) {
        heatmapPoints.push({
          lat: coords[0],
          lng: coords[1],
          intensity: count
        });
      } else {
        missing.push({ conjunto: conjuntoNorm, count });
      }
    });
  
    // DEBUG: ajuda você a ver por que não aparece
    if (!heatmapPoints.length) {
      console.warn('[HEATMAP] Nenhum ponto gerado. Exemplos de CONJUNTO (normalizado):',
        Object.keys(conjuntosCount).slice(0, 25)
      );
    } else {
      console.log('[HEATMAP] Pontos gerados:', heatmapPoints.length);
    }
  
    if (missing.length) {
      console.warn('[HEATMAP] CONJUNTOS sem coordenadas (top 15):',
        missing.sort((a,b) => b.count - a.count).slice(0, 15)
      );
    }
  
    return heatmapPoints;
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
