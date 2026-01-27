/* =========================
   HELPERS (interno do data-service)
========================= */
function normalizeText(v) {
    return String(v ?? '')
      .replace(/\r?\n|\r/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  
  function normalizeKey(key) {
    return String(key || '')
      .toUpperCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .replace(/\./g, '');
  }
  
  function getValueSmart(obj, key) {
    if (!obj) return '';
  
    // direto
    if (obj[key] != null) return obj[key];
  
    // variações simples
    const keyNoDot = String(key).replace(/\./g, '');
    if (obj[keyNoDot] != null) return obj[keyNoDot];
  
    const upper = String(key).toUpperCase();
    const lower = String(key).toLowerCase();
    if (obj[upper] != null) return obj[upper];
    if (obj[lower] != null) return obj[lower];
  
    // busca por normalização
    const target = normalizeKey(key);
    for (const k in obj) {
      if (normalizeKey(k) === target) return obj[k];
    }
  
    return '';
  }
  
  /* =========================
     RANKING POR ELEMENTO (robusto)
  ========================= */
  export function generateRankingElemento(data, { minCount = 1 } = {}) {
    const elementos = new Map();
  
    data.forEach((item) => {
      const raw = getValueSmart(item, 'ELEMENTO');
      const elemento = normalizeText(raw);
      if (!elemento) return;
  
      if (!elementos.has(elemento)) elementos.set(elemento, []);
      elementos.get(elemento).push(item);
    });
  
    return Array.from(elementos.entries())
      .filter(([_, ocorrencias]) => ocorrencias.length >= minCount)
      .map(([elemento, ocorrencias]) => ({
        elemento,
        count: ocorrencias.length,
        ocorrencias
      }))
      .sort((a, b) => b.count - a.count);
  }
  
  export function getOcorrenciasByElemento(data, elemento) {
    const alvo = normalizeText(elemento);
    return data.filter((i) => normalizeText(getValueSmart(i, 'ELEMENTO')) === alvo);
  }
  
  /* =========================
     MAPA DE CALOR POR REITERAÇÃO (robusto)
  ========================= */
  export function generateHeatmapData(data) {
    const conjuntosCount = {};
  
    const normalizeConjuntoKey = (v) => {
      return normalizeText(v)
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    };
  
    // Conta ocorrências por CONJUNTO (usando getter smart)
    data.forEach((item) => {
      const conjuntoRaw = getValueSmart(item, 'CONJUNTO');
      const conjunto = normalizeConjuntoKey(conjuntoRaw);
      if (!conjunto) return;
      conjuntosCount[conjunto] = (conjuntosCount[conjunto] || 0) + 1;
    });
  
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
  
    // normaliza chaves 1x
    const coordenadasConjuntos = {};
    Object.entries(coordenadasConjuntosRaw).forEach(([k, v]) => {
      coordenadasConjuntos[normalizeConjuntoKey(k)] = v;
    });
  
    const heatmapPoints = [];
    const missing = [];
  
    Object.entries(conjuntosCount).forEach(([conjuntoNorm, count]) => {
      const coords = coordenadasConjuntos[conjuntoNorm];
      if (coords) {
        heatmapPoints.push({ lat: coords[0], lng: coords[1], intensity: count });
      } else {
        missing.push({ conjunto: conjuntoNorm, count });
      }
    });
  
    if (!heatmapPoints.length) {
      console.warn('[HEATMAP] Nenhum ponto gerado. Exemplos de CONJUNTO normalizado:',
        Object.keys(conjuntosCount).slice(0, 25)
      );
    }
    if (missing.length) {
      console.warn('[HEATMAP] CONJUNTOS sem coordenadas (top 15):',
        missing.sort((a,b) => b.count - a.count).slice(0, 15)
      );
    }
  
    return heatmapPoints;
  }
  /**
 * Retorna todas as colunas presentes nos dados
 */
export function getAllColumns(data) {
    const cols = new Set();
  
    data.forEach(item => {
      Object.keys(item || {}).forEach(key => {
        cols.add(key);
      });
    });
  
    return Array.from(cols);
  }
  