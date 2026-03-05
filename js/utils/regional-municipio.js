// utils/regional-municipio.js

function normCity(v) {
  return String(v || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// 🔵 CENTRO NORTE (por município)
const CENTRO_NORTE = new Set([
  // CANINDÉ
  'CANINDE','CARIDADE','ITATIRA','PARAMOTI','BOA VIAGEM','MADALENA',
  // CRATEÚS
  'CRATEUS','INDEPENDENCIA','NOVO ORIENTE','IPAPORANGA',
  // NOVA RUSSAS
  'NOVA RUSSAS','HIDROLANDIA','IPU','IPUEIRAS','MONSENHOR TABOSA','PORANGA',
  'RERIUTABA','SANTA QUITERIA','STA QUITERIA','TAMBORIL','VARJOTA',
  'PIRES FERREIRA','ARARENDA','CATUNDA',
  // QUIXADÁ
  'QUIXADA','QUIXERAMOBIM','BANABUIU','IBARETAMA','CHORO',
].map(normCity));

// 🟠 ATLÂNTICO (por município)
const ATLANTICO = new Set([
  // ACARAU
  'ITAREMA','JIJOCA DE JERICOACOARA','J DE JERICOACOARA','MARCO','CAMOCIM','CRUZ',
  'BELA CRUZ','MORRINHOS','ACARAU',
  // ITAPIPOCA
  'ITAPIPOCA','AMONTADA','URUBURETAMA','TURURU',
  // TRAIRI
  'PARAIPABA','PARACURU','TRAIRI',
  // ITAPAJÉ/REDOR
  'TEJUSSUOCA','PENTECOSTE','APUIARES','IRAUCUBA','UMIRIM','ITAPAJE',
  'SAO LUIS DO CURU','S LUIS DO CURU','SAO GONCALO DO AMARANTE',
].map(normCity));

// 🟢 NORTE (por município)
const NORTE = new Set([
  'BARROQUINHA','CHAVAL','CAMOCIM','GRANJA','MARTINOPOLE','URUOCA','SENADOR SA',
  'MORAUJO','MASSAPE','MERUOCA','ALCANTARAS','COREAU','FRECHEIRINHA','TIANGUA',
  'VICOSA DO CEARA','UBAJARA','IBIAPINA','SAO BENEDITO','CARNAUBAL','GUARACIABA DO NORTE',
  'CROATA','MUCAMBO','PACUJA','GRACA','SOBRAL','FORQUILHA','GROAIRAS','CARIRE',
].map(normCity));

export function municipioToRegional(municipio) {
  const m = normCity(municipio);

  // ✅ prioridade definida: Centro Norte > Atlântico > Norte
  // (porque há municípios repetidos nas listas que você colou)
  if (CENTRO_NORTE.has(m)) return 'CENTRO NORTE';
  if (ATLANTICO.has(m)) return 'ATLANTICO';
  if (NORTE.has(m)) return 'NORTE';
  return '';
}

export function normalizeMunicipio(municipio) {
  return normCity(municipio);
}