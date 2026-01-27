/**
 * Serviço de Dados - Lógica de negócio para rankings e análises
 */

/* =========================
   HELPERS GERAIS
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
export function generateHeatmapByAlimentador(data, alimentadorCoords = {}) {
  const byAlim = new Map(); // alim -> elemento -> count

  data.forEach(item => {
    const alim = extractAlimBase(getAlimentadorRaw(item));
    const elemento = normKey(item.ELEMENTO || item.ELEMENTOS);
    if (!alim || !elemento) return;

    if (!byAlim.has(alim)) byAlim.set(alim, new Map());
    const mapElem = byAlim.get(alim);
    mapElem.set(elemento, (mapElem.get(elemento) || 0) + 1);
  });

  const heatmap = [];
  const missing = [];

  for (const [alim, elementos] of byAlim.entries()) {
    let reiteradasTotal = 0;
    for (const count of elementos.values()) {
      if (count >= 2) reiteradasTotal += count;
    }
    if (reiteradasTotal <= 0) continue;

    const coordInfo = alimentadorCoords[normKey(alim)];
    if (!coordInfo) {
      missing.push(alim);
      continue;
    }

    heatmap.push({
      lat: coordInfo.lat,
      lng: coordInfo.lng,
      intensity: reiteradasTotal,
      label: coordInfo.display || alim
    });
  }

  console.log('[HEATMAP-ALIM] alimentadores lidos:', byAlim.size, 'pontos:', heatmap.length);
  if (missing.length) console.warn('[HEATMAP-ALIM] sem coords (top 30):', missing.slice(0, 30));

  return heatmap;
}

/* =========================
   HEATMAP POR CONJUNTO (CIDADES)
========================= */
export function generateHeatmapByConjunto(data) {
  const byConjunto = new Map(); // conjunto -> elemento -> count

  data.forEach(item => {
    const conjuntoRaw = item.CONJUNTO;
    const conjunto = normKey(conjuntoRaw);
    const elemento = normKey(item.ELEMENTO || item.ELEMENTOS);
    if (!conjunto || !elemento) return;

    if (!byConjunto.has(conjunto)) {
      byConjunto.set(conjunto, {
        display: String(conjuntoRaw ?? '').trim(),
        elementCounts: new Map()
      });
    }

    const bucket = byConjunto.get(conjunto);
    bucket.elementCounts.set(elemento, (bucket.elementCounts.get(elemento) || 0) + 1);
  });

  const coordenadasConjuntos = {
    'NOVA RUSSAS': [-4.7058, -40.5659],
    'MACAOCA': [-4.4519, -40.7262],
    'CANINDÉ': [-4.3583, -39.3116],
    'QUIXERAMOBIM': [-5.1990, -39.2927],
    'IPU': [-4.3220, -40.7107],
    'INDEPENDÊNCIA': [-5.3960, -40.3080],
    'ARARENDA': [-4.7448, -40.8311],
    'BOA VIAGEM': [-5.1271, -39.7336],
    'INHUPORANGA': [-4.4369, -40.8892],
    'SANTA QUITÉRIA': [-4.3324, -40.1572],
    'CRATEÚS': [-5.1783, -40.6696],
    'MONSENHOR TABOSA': [-4.7923, -40.0645],
    'ARARAS I': [-4.2096, -40.4498],
    'BANABUIÚ': [-5.3054, -38.9182],
    'QUIXADÁ': [-4.9716, -39.0161]
  };

  const coords = {};
  const displayByKey = {};
  Object.entries(coordenadasConjuntos).forEach(([k, v]) => {
    const nk = normKey(k);
    coords[nk] = v;
    displayByKey[nk] = k;
  });

  const heatmap = [];
  const missing = [];

  for (const [conjuntoNorm, bucket] of byConjunto.entries()) {
    let reiteradasTotal = 0;
    for (const count of bucket.elementCounts.values()) {
      if (count >= 2) reiteradasTotal += count;
    }
    if (reiteradasTotal <= 0) continue;

    const coord = coords[conjuntoNorm];
    if (!coord) {
      missing.push(bucket.display);
      continue;
    }

    heatmap.push({
      lat: coord[0],
      lng: coord[1],
      intensity: reiteradasTotal,
      label: displayByKey[conjuntoNorm]
    });
  }

  console.log('[HEATMAP-CONJ] conjuntos lidos:', byConjunto.size, 'pontos:', heatmap.length);
  if (missing.length) console.warn('[HEATMAP-CONJ] sem coords (top 30):', missing.slice(0, 30));

  return heatmap;
}

/* =========================
   UTILIDADES EXISTENTES
========================= */
export function getAllColumns(data) {
  const cols = new Set();
  data.forEach(i => Object.keys(i).forEach(k => cols.add(k)));
  return Array.from(cols);
}

export function getOcorrenciasByElemento(data, elemento) {
  return data.filter(i => i.ELEMENTO === elemento);
}
