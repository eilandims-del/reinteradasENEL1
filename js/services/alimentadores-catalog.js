// =========================
// FILE: js/services/alimentadores-catalog.js
// =========================

function normRegional(r) {
    return String(r || '').trim().toUpperCase();
  }
  
  /**
   * Catálogo: Regional -> Conjunto -> [Alimentadores]
   * Ajuste os grupos/conjuntos conforme sua organização.
   */
  const CATALOGO = {
    "NORTE": {
      "BLOCO INHUÇU": [
        "INH01I2","INH01I3","INH01I4","INH01I5","INH01I6","INH01I7",
        "IBP01I1","IBP01I2","IBP01I3","IBP01I4","IBP01I5",
        "GCN01N1","GCN01N2","GCN01N5"
      ],
      "BLOCO TIANGUÁ": [
        "MCB01M2","MCB01M3","MCB01M4",
        "VCS01C2","VCS01C3","VCS01C4","VCS01C5",
        "TNG01S1","TNG01S2","TNG01S3","TNG01S4","TNG01S5","TNG01S6","TNG01S7"
      ],
      "BLOCO SOBRAL": [
        "SBU01S1","SBU01S2","SBU01S3","SBU01S4","SBU01S5","SBU01S6","SBU01S7","SBU01S8","SBU01S9",
        "SBQ01F2","SBQ01F3","SBQ01F4",
        "SBC01L1","SBC01L2","SBC01L3","SBC01L4","SBC01L5",
        "MSP01P1","MSP01P2","MSP01P3","MSP01P4",
        "CRU01C2","CRU01C3","CRU01C4",
        "CRE01C2","CRE01C4",
        "CRC01C1","CRC01C2","CRC01C3","CRC01C4"
      ]
    },
  
    "ATLANTICO": {
      "BLOCO TRAIRI": [
        "TRR01P1","TRR01P2","TRR01P3","TRR01P4",
        "PAR01C2","PAR01C3","PAR01C4","PAR01C5","PAR01C6","PAR01C7",
        "PCU01L2","PCU01L3","PCU01L4","PCU01L5"
      ],
      "BLOCO ITAPAJÉ": [
        "ITE01I1","ITE01I2","ITE01I3","ITE01I4","ITE01I5",
        "UMR01M1","UMR01M2","UMR01M3",
        "SLC01S2","SLC01S3","SLC01S5","SLC01S6","SLC01S7"
      ]
    },
  
    "CENTRO NORTE": {
      "CANINDÉ - Canindé": [
        "CND01C1","CND01C2","CND01C3","CND01C4","CND01C5","CND01C6"
      ],
      "CANINDÉ - Inhuporanga": [
        "INP01N3","INP01N4","INP01N5"
      ],
      "CANINDÉ - Boa Viagem": [
        "BVG01P1","BVG01P2","BVG01P3","BVG01P4"
      ],
      "CANINDÉ - Macaoca": [
        "MCA01L1","MCA01L2","MCA01L3"
      ],
  
      "QUIXADÁ - Banabuiú": ["BNB01Y2"],
      "QUIXADÁ - Quixadá": ["QXD01P1","QXD01P2","QXD01P3","QXD01P4","QXD01P5","QXD01P6"],
      "NOVA RUSSAS - Ararendá": ["ARR01L1","ARR01L2","ARR01L3"],
      "NOVA RUSSAS - Araras": ["ARU01Y1","ARU01Y2","ARU01Y4","ARU01Y5","ARU01Y6","ARU01Y7","ARU01Y8"],
      "NOVA RUSSAS - Monsenhor Tabosa": ["MTB01S2","MTB01S3","MTB01S4"],
      "CRATEÚS - Independência": ["IDP01I1","IDP01I2","IDP01I3","IDP01I4"]
    }
  };
  
  // ---------- FUNÇÕES BASE (nomes "novos") ----------
  
  export function getCatalogForRegional(regional) {
    const reg = normRegional(regional);
    const conjuntosObj = CATALOGO[reg] || {};
    return { regional: reg, conjuntos: Object.keys(conjuntosObj) };
  }
  
  export function getConjuntosForRegional(regional) {
    const reg = normRegional(regional);
    return Object.keys(CATALOGO[reg] || {});
  }
  
  export function getAlimentadoresByConjunto(regional, conjunto) {
    const reg = normRegional(regional);
    const conj = String(conjunto || '').trim();
    const list = (CATALOGO[reg] && CATALOGO[reg][conj]) ? CATALOGO[reg][conj] : [];
    return Array.isArray(list) ? list.slice() : [];
  }
  
  export function getAllAlimentadoresForRegional(regional) {
    const reg = normRegional(regional);
    const conjuntos = CATALOGO[reg] || {};
    const all = [];
    Object.keys(conjuntos).forEach(conj => {
      (conjuntos[conj] || []).forEach(a => all.push(a));
    });
    return Array.from(new Set(all));
  }
  
  // ---------- ALIASES (nomes "antigos" que o seu modal pode estar importando) ----------
  // ✅ Isso resolve o erro do console: "does not provide an export named getAllAlimentadoresRegional"
  
  export function getAllAlimentadoresRegional(regional) {
    return getAllAlimentadoresForRegional(regional);
  }
  
  export function getConjuntosByRegional(regional) {
    return getConjuntosForRegional(regional);
  }
  