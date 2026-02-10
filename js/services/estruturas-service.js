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
 * 🔧 Alimentador BASE mais flexível:
 * aceita 2-4 letras + 2-3 dígitos (ex: TLM82, TLO214, CD12, R123 etc)
 */
function extractAlimBase(name) {
  const n = normKey(name);
  const m = n.match(/([A-Z]{2,4}\s?\d{2,3})/);
  if (!m) return '';
  return m[1].replace(/\s+/g, '');
}

/**
 * ✅ Categoria vem do ICON do Placemark (no seu KMZ: files/CD_P.png, files/F.png, files/R.png)
 * Fallback: tenta no nome/estilo também.
 */
function pickCategoryFromPlacemark(pm, placemarkName = '') {
  const nameNorm = normKey(placemarkName);

  // 1) Tenta pelo ícone (mais confiável no seu KMZ)
  const hrefNodes = pm.getElementsByTagName('href');
  for (const node of Array.from(hrefNodes || [])) {
    const href = String(node?.textContent || '').trim();
    if (!href) continue;

    const up = href.toUpperCase();
    if (up.includes('/CD') || up.includes('CD_') || up.includes('CD.')) return 'CD';
    if (up.includes('/F')  || up.endsWith('F.PNG')  || up.includes('F.')) return 'F';
    if (up.includes('/R')  || up.endsWith('R.PNG')  || up.includes('R.')) return 'R';
  }

  // 2) Fallback por styleUrl (às vezes vem "#CD" / "#F" / "#R")
  const styleUrl = pm.getElementsByTagName('styleUrl')[0]?.textContent || '';
  const styleNorm = normKey(styleUrl);
  if (styleNorm === 'CD' || styleNorm.includes('CD')) return 'CD';
  if (styleNorm === 'F'  || styleNorm.includes('F'))  return 'F';
  if (styleNorm === 'R'  || styleNorm.includes('R'))  return 'R';

  // 3) Fallback por tokens no nome
  if (nameNorm.startsWith('CD') || nameNorm.includes(' CD ')) return 'CD';
  if (nameNorm.startsWith('F')  || nameNorm.includes(' F '))  return 'F';
  if (nameNorm.startsWith('R')  || nameNorm.includes(' R '))  return 'R';

  // 4) Fallback “semântico”
  if (nameNorm.includes('FUS')) return 'F';
  if (nameNorm.includes('REL')) return 'R';

  return '';
}

function parseKmlStructuresPoints(kmlText) {
  const parser = new DOMParser();
  const xml = parser.parseFromString(kmlText, 'text/xml');

  const placemarks = Array.from(xml.getElementsByTagName('Placemark'));
  const items = [];

  for (const pm of placemarks) {
    const nameNode = pm.getElementsByTagName('name')[0];
    const rawName = (nameNode?.textContent || '').trim();
    if (!rawName) continue;

    // precisa ter Point
    const point = pm.getElementsByTagName('Point')[0];
    if (!point) continue;

    const coordsNode = point.getElementsByTagName('coordinates')[0];
    const coordsText = (coordsNode?.textContent || '').trim();
    if (!coordsText) continue;

    const first = coordsText.split(/\s+/g)[0];
    const parts = first.split(',').map(Number);
    const lng = parts[0], lat = parts[1];
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    // ✅ pega categoria pelo ícone do placemark
    const cat = pickCategoryFromPlacemark(pm, rawName);
    if (!cat) continue; // só CD/F/R

    const alimBase = extractAlimBase(rawName);
    const alimKey = normKey(alimBase);

    items.push({
      name: rawName,
      nameKey: normKey(rawName),
      category: cat,
      lat,
      lng,
      alimentadorBase: alimBase,
      alimentadorBaseKey: alimKey
    });
  }

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
 * ✅ Paths conforme você informou:
 * assets/estruturas/atlanticoestrutura.kmz
 * assets/estruturas/norteestrutura.kmz
 */
const ESTR_FILES = {
  'ATLANTICO': { type: 'kmz', path: 'assets/estruturas/atlanticoestrutura.kmz' },
  'NORTE': { type: 'kmz', path: 'assets/estruturas/norteestrutura.kmz' },
  'CENTRO NORTE': { type: 'kmz', path: 'assets/estruturas/centro_norte_estrutura.kmz' } // se você tiver
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
