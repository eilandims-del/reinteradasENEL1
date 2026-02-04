/**
 * Serviços de dados – Heatmap, Ranking e utilidades
 */

/* =========================
   Normalização
========================= */
export function normKey(v) {
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

/**
 * Normaliza chave de campo (para achar colunas equivalentes)
 */
function normalizeFieldKey(k) {
  return String(k || '')
    .trim()
    .toUpperCase()
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Pega valor de um campo mesmo com variações do nome:
 * - "ALIMENT." vs "ALIMENT" vs "ALIMENTADOR"
 * - com/sem ponto
 * - diferenças de caixa e espaços
 */
export function getFieldValue(row, fieldName) {
  if (!row) return '';

  // 1) direto
  if (row[fieldName] != null) return row[fieldName];

  // 2) sem ponto
  const noDot = String(fieldName).replace(/\./g, '');
  if (row[noDot] != null) return row[noDot];

  // 3) por normalização
  const target = normalizeFieldKey(fieldName);
  const found = Object.keys(row).find(k => normalizeFieldKey(k) === target);
  if (found) return row[found];

  return '';
}

/* =========================
   Coordenadas por CONJUNTO
========================= */
export const coordenadasConjuntos = {
  // ===== CENTRO NORTE =====
  'NOVA RUSSAS': [-4.7058, -40.5659],
  'MACAOCA': [-4.758647, -39.481451],
  'CANINDE': [-4.3583, -39.3116],
  'QUIXERAMOBIM': [-5.1990, -39.2927],
  'IPU': [-4.3220, -40.7107],
  'INDEPENDENCIA': [-5.3960, -40.3080],
  'ARARENDA': [-4.7448, -40.8311],
  'BOA VIAGEM': [-5.1271, -39.7336],
  'INHUPORANGA': [-4.097712, -39.060548],
  'SANTA QUITERIA': [-4.3324, -40.1572],
  'CRATEUS': [-5.1783, -40.6696],
  'MONSENHOR TABOSA': [-4.7923, -40.0645],
  'ARARAS I': [-4.2096, -40.4498],
  'BANABUIU': [-5.3054, -38.9182],
  'QUIXADA': [-4.9716, -39.0161],

  // ===== NORTE =====
  'GRANJA': [-3.1276, -40.8266],
  'CAMOCIM': [-2.9020, -40.8417],
  'MASSAPE': [-3.5239, -40.3422],
  'SOBRAL I': [-3.6860, -40.3497],
  'CARACARA SOBRAL': [-3.7145, -40.3158],
  'VICOSA DO CEARA': [-3.5664, -41.0916],
  'TIANGUA': [-3.7319, -40.9923],
  'COREAU': [-3.5416, -40.6586],
  'SOBRAL IV': [-3.7009, -40.3224],
  'SOBRAL V': [-3.7254, -40.2967],
  'INHUCU': [-3.3129, -41.0052],
  'MUCAMBO': [-3.9045, -40.7456],
  'IBIAPINA': [-3.9239, -41.1350],
  'CARIRE': [-3.9486, -40.4766],

  // ===== ATLÂNTICO =====
  'BAIXO ACARAU II': [-3.0415, -39.8423],
  'ITAREMA': [-2.9213, -39.9167],
  'UMIRIM': [-3.6765, -39.3464],
  'ITAPAJE': [-3.6832, -39.5855],
  'CRUZ': [-2.9175, -40.1767],
  'PARACURU': [-3.4140, -39.0305],
  'MARCO': [-3.1196, -40.1474],
  'ITAPIPOCA': [-3.4944, -39.5786],
  'SAO LUIS DO CURU': [-3.6692, -39.2393],
  'TRAIRI': [-3.2766, -39.2683],
  'AMONTADA': [-3.3602, -39.8285],
  'APUIARES': [-3.9451, -39.4355],
  'ACARAU': [-2.8870, -40.1194],
  'PARAIPABA': [-3.4393, -39.1481]
};

/* =========================
   Coordenada do Conjunto
========================= */
export function getCoordenadaConjunto(nome) {
  const key = normKey(nome);
  return coordenadasConjuntos[key] || null;
}

/* =========================
   Heatmap por CONJUNTO
   - aceita CONJUNTO / CONJUNTOS
========================= */
export function generateHeatmapByConjunto(data) {
  const acc = new Map();

  (data || []).forEach(row => {
    const conjRaw =
      getFieldValue(row, 'CONJUNTO') ||
      getFieldValue(row, 'CONJUNTOS') ||
      row?.CONJUNTO ||
      row?.CONJUNTOS;

    const conj = normKey(conjRaw);
    if (!conj) return;

    acc.set(conj, (acc.get(conj) || 0) + 1);
  });

  const points = [];

  acc.forEach((count, conj) => {
    const coord = coordenadasConjuntos[conj];
    if (!coord) return;

    points.push({
      lat: coord[0],
      lng: coord[1],
      intensity: count,
      label: conj
    });
  });

  return points;
}

/* =========================
   Alimentador: extrair BASE (ex: "TLM82")
   casa com o índice do KML no mapa.js
========================= */
function extractAlimBase(name) {
  const n = normKey(name);

  // pega padrão 3 letras + 2 dígitos (TLM82, TLO21 etc)
  const m = n.match(/([A-Z]{3}\s?\d{2})/);
  if (!m) return n;

  return m[1].replace(/\s+/g, '');
}

/* =========================
   Heatmap por ALIMENTADOR
   - lê ALIMENT. / ALIMENTADOR / ALIMENT
   - extrai BASE (TLM82) e usa alimentadorCenters[baseNorm]
========================= */
export function generateHeatmapByAlimentador(data, alimentadorCenters = {}) {
  const acc = new Map();

  (data || []).forEach(row => {
    const alimRaw =
      getFieldValue(row, 'ALIMENT.') ||
      getFieldValue(row, 'ALIMENTADOR') ||
      getFieldValue(row, 'ALIMENT');

    const base = extractAlimBase(alimRaw);
    const baseKey = normKey(base);
    if (!baseKey) return;

    acc.set(baseKey, (acc.get(baseKey) || 0) + 1);
  });

  const points = [];

  acc.forEach((count, baseKey) => {
    const center = alimentadorCenters[baseKey];
    if (!center) return;

    points.push({
      lat: center.lat,
      lng: center.lng,
      intensity: count,
      label: center.display || baseKey,
      base: baseKey
    });
  });

  return points;
}

/* =========================
   Utilidades usadas no main.js / modal
========================= */

/**
 * Retorna TODAS as colunas encontradas no dataset
 * (com variações de chaves)
 */
export function getAllColumns(data) {
  const set = new Set();
  (data || []).forEach(row => {
    if (!row || typeof row !== 'object') return;
    Object.keys(row).forEach(k => set.add(k));
  });
  return Array.from(set);
}

/**
 * Retorna ocorrências do ELEMENTO (robusto: tenta achar a coluna ELEMENTO)
 */
export function getOcorrenciasByElemento(data, elemento) {
  const alvo = normKey(elemento);
  if (!alvo) return [];

  return (data || []).filter(row => {
    const elRaw = getFieldValue(row, 'ELEMENTO');
    return normKey(elRaw) === alvo;
  });
}
