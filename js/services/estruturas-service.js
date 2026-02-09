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
   * Pega categoria CD/F/R olhando:
   * - pasta/folder pai (se tiver)
   * - nome do placemark
   */
  function pickCategory(pathNames = [], placemarkName = '') {
    const all = [...(pathNames || []), placemarkName].map(normKey).join(' | ');
  
    // regra: se aparecer CD (ou "CHAVE ... CD"), pega CD; senão F; senão R
    if (/(^|\s|[|])CD(\s|$|[|])/.test(all) || all.includes(' CD ' ) || all.includes('|CD|') || all.includes('CD ')) return 'CD';
    if (/(^|\s|[|])F(\s|$|[|])/.test(all) || all.includes('|F|')) return 'F';
    if (/(^|\s|[|])R(\s|$|[|])/.test(all) || all.includes('|R|')) return 'R';
  
    // fallback por prefixo tipo "FUS..." / "REL..."
    if (all.includes('FUS')) return 'F';
    if (all.includes('REL')) return 'R';
  
    return '';
  }
  
  function findFolderPathNames(node) {
    // tenta subir no DOM: Folder -> Folder -> ...
    const out = [];
    let cur = node;
    while (cur) {
      if (cur.nodeName && cur.nodeName.toLowerCase() === 'folder') {
        const nameNode = cur.getElementsByTagName('name')[0];
        const nm = nameNode?.textContent || '';
        if (nm) out.push(nm);
      }
      cur = cur.parentNode;
    }
    return out.reverse();
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
      const coordsNode = point?.getElementsByTagName('coordinates')[0];
      const coordsText = (coordsNode?.textContent || '').trim();
      if (!coordsText) continue;
  
      const first = coordsText.split(/\s+/g)[0];
      const parts = first.split(',').map(Number);
      const lng = parts[0], lat = parts[1];
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
  
      const pathNames = findFolderPathNames(pm);
      const cat = pickCategory(pathNames, rawName);
      if (!cat) continue; // só CD/F/R
  
      const alimBase = extractAlimBase(rawName); // se existir no nome, ajuda a filtrar por alimentador
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
   * ✅ Ajuste os paths aqui conforme você colocou:
   * assets/estruturas/<regional>.kmz  (ou .kml)
   */
  const ESTR_FILES = {
    'ATLANTICO': { type: 'kmz', path: 'assets/estruturas/atlantico.kmz' },
    'NORTE': { type: 'kmz', path: 'assets/estruturas/norte.kmz' },
    'CENTRO NORTE': { type: 'kmz', path: 'assets/estruturas/centro_norte.kmz' }
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
  