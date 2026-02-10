// =========================
// FILE: js/services/estruturas-service.js
// =========================

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

function normalizeRegionalKey(r) {
  const v = String(r || '').trim().toUpperCase();
  if (v === 'CENTRO NORTE' || v === 'CENTRO_NORTE' || v === 'CENTRONORTE') return 'CENTRO NORTE';
  if (v === 'ATLANTICO' || v === 'ATLÂNTICO') return 'ATLANTICO';
  if (v === 'NORTE') return 'NORTE';
  return v || 'TODOS';
}

/**
 * Extrai um "ID de estrutura" do nome (para bater com ELEMENTO do Firestore)
 * Exemplos típicos: TLM8264, FEW0665, RLG1234, TEC9629 etc
 */
function extractStructureId(name) {
  const n = normKey(name);
  // 1-5 letras + 3-8 dígitos (bem flexível)
  const m = n.match(/([A-Z]{1,5}\s?\d{3,8})/);
  if (!m) return '';
  return m[1].replace(/\s+/g, '');
}

/**
 * Categoria:
 * - Se nome começar com F => F
 * - Se nome começar com R => R
 * - Se nome começar com T => CD (trafos entram como CD no seu conceito)
 * - Se conter "CD" => CD
 * - Se contiver "FUS" => F
 * - Se contiver "REL" => R
 */
function inferCategoryFromName(placemarkName = '') {
  const n = normKey(placemarkName);
  if (!n) return '';

  const first = n.charAt(0);
  if (first === 'F') return 'F';
  if (first === 'R') return 'R';
  if (first === 'T') return 'CD';

  if (n.includes(' CD ' ) || n === 'CD' || n.includes('|CD|') || n.includes('CD')) return 'CD';
  if (n.includes('FUS')) return 'F';
  if (n.includes('REL')) return 'R';

  return '';
}

function parseKmlStructuresPoints(kmlText) {
  const parser = new DOMParser();
  const xml = parser.parseFromString(kmlText, 'text/xml');

  const placemarks = Array.from(xml.getElementsByTagName('Placemark'));
  const items = [];

  // DEBUG rápido (pra você ver se está lendo mesmo)
  console.log('[ESTR][DEBUG] placemarks:', placemarks.length);

  for (const pm of placemarks) {
    const nameNode = pm.getElementsByTagName('name')[0];
    const rawName = (nameNode?.textContent || '').trim();
    if (!rawName) continue;

    // Pega o primeiro <coordinates> dentro de <Point>
    // (funciona mesmo se estiver dentro de MultiGeometry)
    const point = pm.getElementsByTagName('Point')[0];
    const coordsNode = point?.getElementsByTagName('coordinates')[0];
    const coordsText = (coordsNode?.textContent || '').trim();
    if (!coordsText) continue;

    const first = coordsText.split(/\s+/g)[0];
    const parts = first.split(',').map(Number);
    const lng = parts[0], lat = parts[1];
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const category = inferCategoryFromName(rawName);
    if (!category) continue; // só CD/F/R

    const structureId = extractStructureId(rawName);
    const structureIdKey = normKey(structureId || rawName); // fallback no nome

    items.push({
      name: rawName,
      category,
      lat,
      lng,
      // chave pra bater com ELEMENTO
      structureId: structureId || rawName,
      structureIdKey
    });
  }

  console.log('[ESTR][DEBUG] points after filter (CD/F/R):', items.length);
  if (items.length) console.log('[ESTR][DEBUG] sample:', items.slice(0, 5).map(x => x.name));

  return items;
}

// cache por regional
const cache = {
  loaded: new Set(),
  dataByRegional: {
    'ATLANTICO': [],
    'NORTE': [],
    'CENTRO NORTE': []
  }
};

/**
 * ✅ PATHS reais (os que você disse que existem)
 */
const ESTR_FILES = {
  'ATLANTICO': { type: 'kmz', path: 'assets/estruturas/atlanticoestrutura.kmz' },
  'NORTE': { type: 'kmz', path: 'assets/estruturas/norteestrutura.kmz' },
  // se ainda não tem CN, deixa comentado ou cria depois
  // 'CENTRO NORTE': { type: 'kmz', path: 'assets/estruturas/centro_norte_estrutura.kmz' }
};

async function loadKmlTextFromFile(cfg) {
  if (!cfg) return '';

  if (cfg.type === 'kml') {
    const res = await fetch(cfg.path, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  }

  // KMZ
  if (!window.JSZip) throw new Error('JSZip não encontrado');
  const res = await fetch(cfg.path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = await res.arrayBuffer();

  const zip = await window.JSZip.loadAsync(buf);
  const kmlFileName = Object.keys(zip.files).find(n => n.toLowerCase().endsWith('.kml'));
  if (!kmlFileName) throw new Error('KMZ sem arquivo .kml interno');

  return await zip.files[kmlFileName].async('text');
}

export async function loadEstruturasRegionalOnce(regional) {
  const reg = normalizeRegionalKey(regional);
  if (!ESTR_FILES[reg]) return [];

  if (cache.loaded.has(reg)) return cache.dataByRegional[reg] || [];

  const cfg = ESTR_FILES[reg];

  try {
    const kmlText = await loadKmlTextFromFile(cfg);
    const items = parseKmlStructuresPoints(kmlText);

    cache.loaded.add(reg);
    cache.dataByRegional[reg] = items;

    console.log('[ESTR] carregado:', reg, 'pontos:', items.length);
    return items;
  } catch (e) {
    console.warn('[ESTR] falha ao carregar estruturas:', reg, e);
    cache.loaded.add(reg);
    cache.dataByRegional[reg] = [];
    return [];
  }
}

export function clearEstruturasCache() {
  cache.loaded = new Set();
  cache.dataByRegional = { 'ATLANTICO': [], 'NORTE': [], 'CENTRO NORTE': [] };
}
