// =========================
// FILE: js/services/alimentadores-catalog.js
// =========================

function normRegional(r) {
  return String(r || '').trim().toUpperCase();
}

/**
 * ESTRUTURA:
 * REGIONAL -> BLOCO -> CIDADE -> [ALIMENTADORES]
 *
 * Obs: Mantive exatamente sua organização mais recente.
 */
const CATALOGO = {
  "ATLANTICO": {
    "BLOCO ACARAÚ": {
      "Acaraú": ["ACA01C1","ACA01C2","ACA01C3","ACA01C4","ACA01CA"],
      "Marco": ["MRC01M1","MRC01M2","MRC01M3","MRC01M4"],
      "Cruz": ["CRZ01P1","CRZ01P2","CRZ01P3","CRZ01P4"],
      "Itarema": ["ITR01I2","ITR01I3","ITR01I4","ITR01I5"]
    },
    "BLOCO ITAPIPOCA": {
      "Itapipoca": ["ITK01I2","ITK01I3","ITK01I4","ITK01I5","ITK01I6","ITK01I7","ITK01I8"],
      "Amontada": ["AMT01P1","AMT01P2","AMT01P3","AMT01P4","AMT01PA","BLA01L1","BLA01L4","BLA01L5"]
    },
    "BLOCO ITAPAJÉ": {
      "Itapajé": ["ITE01I1","ITE01I2","ITE01I3","ITE01I4","ITE01I5"],
      "Umirim": ["UMR01M1","UMR01M2","UMR01M3"],
      "São Luís do Curu": ["SLC01S2","SLC01S3","SLC01S5","SLC01S6","SLC01S7"],
      "Apuiarés": ["APR01P3","APR01P4","APR01P5"]
    },
    "BLOCO TRAIRI": {
      "Trairi": ["TRR01P1","TRR01P2","TRR01P3","TRR01P4"],
      "Paraipaba": ["PAR01C2","PAR01C3","PAR01C4","PAR01C5","PAR01C6","PAR01C7"],
      "Paracuru": ["PCU01L2","PCU01L3","PCU01L4","PCU01L5"]
    }
  },

  "NORTE": {
    "INHUÇU": {
      "Inhuçu": [
        "INH01I2","INH01I3","INH01I4","INH01I5","INH01I6","INH01I7",
        "IBP01I1","IBP01I2","IBP01I3","IBP01I4","IBP01I5",
        "GCN01N1","GCN01N2","GCN01N5"
      ]
    },
    "TIANGUÁ": {
      "Tianguá": [
        "MCB01M2","MCB01M3","MCB01M4",
        "VCS01C2","VCS01C3","VCS01C4","VCS01C5",
        "TNG01S1","TNG01S2","TNG01S3","TNG01S4","TNG01S5","TNG01S6","TNG01S7"
      ]
    },
    "SOBRAL": {
      "Sobral": [
        "SBU01S1","SBU01S2","SBU01S3","SBU01S4","SBU01S5","SBU01S6","SBU01S7","SBU01S8","SBU01S9",
        "SBQ01F2","SBQ01F3","SBQ01F4",
        "SBC01L1","SBC01L2","SBC01L3","SBC01L4","SBC01L5",
        "MSP01P1","MSP01P2","MSP01P3","MSP01P4",
        "CRU01C2","CRU01C3","CRU01C4",
        "CRE01C2","CRE01C4",
        "CRC01C1","CRC01C2","CRC01C3","CRC01C4"
      ]
    },
    "CAMOCIM": {
      "Camocim": [
        "CMM01C1","CMM01C2","CMM01C3","CMM01C4",
        "GRJ01N1","GRJ01N2","GRJ01N3","GRJ01N4",
        "BRQ01F1","BRQ01F2"
      ]
    }
  },

  "CENTRO NORTE": {
    "CANINDÉ": {
      "Canindé": ["CND01C1","CND01C2","CND01C3","CND01C4","CND01C5","CND01C6"],
      "Inhuporanga": ["INP01N3","INP01N4","INP01N5"],
      "Boa Viagem": ["BVG01P1","BVG01P2","BVG01P3","BVG01P4"],
      "Macaoca": ["MCA01L1","MCA01L2","MCA01L3"]
    },
    "QUIXADÁ": {
      "Banabuiú": ["BNB01Y2"],
      "Joatama": ["JTM01N2"],
      "Quixadá": ["QXD01P1","QXD01P2","QXD01P3","QXD01P4","QXD01P5","QXD01P6"],
      "Quixeramobim": ["QXB01N2","QXB01N3","QXB01N4","QXB01N5","QXB01N6","QXB01N7"]
    },
    "NOVA RUSSAS": {
      "Ipu": ["IPU01L2","IPU01L3","IPU01L4","IPU01L5"],
      "Ararendá": ["ARR01L1","ARR01L2","ARR01L3"],
      "Santa Quitéria": ["SQT01F2","SQT01F3","SQT01F4"],
      "Araras": ["ARU01Y1","ARU01Y2","ARU01Y4","ARU01Y5","ARU01Y6","ARU01Y7","ARU01Y8"],
      "Nova Russas": ["NVR01N1","NVR01N2","NVR01N3","NVR01N5"],
      "Monsenhor Tabosa": ["MTB01S2","MTB01S3","MTB01S4"]
    },
    "CRATEÚS": {
      "Independência": ["IDP01I1","IDP01I2","IDP01I3","IDP01I4"],
      "Crateús": ["CAT01C1","CAT01C2","CAT01C3","CAT01C4","CAT01C5","CAT01C6","CAT01C7"]
    }
  }
};

// ------------------- EXPORTS "NOVOS" -------------------

export function getBlocosForRegional(regional) {
  const reg = normRegional(regional);
  return Object.keys(CATALOGO[reg] || {});
}

export function getCidadesByBloco(regional, bloco) {
  const reg = normRegional(regional);
  const b = String(bloco || '').trim();
  const obj = (CATALOGO[reg] && CATALOGO[reg][b]) ? CATALOGO[reg][b] : {};
  return Object.keys(obj || {});
}

export function getAlimentadoresByCidade(regional, bloco, cidade) {
  const reg = normRegional(regional);
  const b = String(bloco || '').trim();
  const c = String(cidade || '').trim();
  const list = CATALOGO[reg]?.[b]?.[c] || [];
  return Array.isArray(list) ? list.slice() : [];
}

export function getAllAlimentadoresForRegional(regional) {
  const reg = normRegional(regional);
  const blocos = CATALOGO[reg] || {};
  const all = [];
  Object.keys(blocos).forEach(bloco => {
    const cidades = blocos[bloco] || {};
    Object.keys(cidades).forEach(cidade => {
      (cidades[cidade] || []).forEach(a => all.push(a));
    });
  });
  return Array.from(new Set(all));
}

// ------------------- ALIASES (compat) -------------------
// Para não quebrar imports antigos:

export function getConjuntosByRegional(regional) {
  // antes "conjunto" = bloco
  return getBlocosForRegional(regional);
}

export function getAlimentadoresByConjunto(regional, conjunto) {
  // retorna tudo dentro do bloco (todas as cidades)
  const reg = normRegional(regional);
  const bloco = String(conjunto || '').trim();
  const cidades = getCidadesByBloco(reg, bloco);
  const acc = [];
  cidades.forEach(c => acc.push(...getAlimentadoresByCidade(reg, bloco, c)));
  return Array.from(new Set(acc));
}

export function getAllAlimentadoresRegional(regional) {
  return getAllAlimentadoresForRegional(regional);
}

export function getCatalogForRegional(regional) {
  const reg = normRegional(regional);
  return { regional: reg, conjuntos: getBlocosForRegional(reg) };
}

export function getConjuntosForRegional(regional) {
  return getBlocosForRegional(regional);
}
