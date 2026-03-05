const ALIM_TREE = {
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
    },
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

function buildAlimLookup(tree) {
  const map = new Map();

  for (const [regional, blocos] of Object.entries(tree || {})) {
    for (const [bloco, subs] of Object.entries(blocos || {})) {
      for (const [subestacao, alims] of Object.entries(subs || {})) {
        for (const a of (alims || [])) {
          const key = String(a).trim().toUpperCase();
          if (!key) continue;

          // Se houver duplicado, mantém o primeiro e avisa no console
          if (map.has(key)) {
            console.warn("[ALIM_LOOKUP] Duplicado:", key, "já estava em", map.get(key), "novo:", { regional, bloco, subestacao });
            continue;
          }

          map.set(key, { regional, bloco, subestacao });
        }
      }
    }
  }

  return map;
}

const ALIM_LOOKUP = buildAlimLookup(ALIM_TREE);

const $ = (id) => document.getElementById(id);
const statusEl = $("status");

let mergedRows = [];
let kmlIndex = new Map();

function setStatus(msg) {
  statusEl.textContent = msg;
}

function normalizeKey(v) {
  return String(v ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

async function readXlsxWorkbook(file) {
  const ab = await file.arrayBuffer();
  return XLSX.read(ab, { type: "array" });
}

function sheetToRows(wb, sheetName) {
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(`Aba "${sheetName}" não encontrada no arquivo.`);
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
}

function colIndex(letter) {
  let n = 0;
  for (const ch of letter.toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n - 1;
}

async function readKmlIndex(file) {
  const fname = file.name.toLowerCase();
  let kmlText = "";

  if (fname.endsWith(".kmz")) {
    const ab = await file.arrayBuffer();
    const u8 = new Uint8Array(ab);
    const unzipped = window.fflate.unzipSync(u8);

    let kmlEntry = unzipped["doc.kml"];
    if (!kmlEntry) {
      const key = Object.keys(unzipped).find(k => k.endsWith(".kml"));
      kmlEntry = unzipped[key];
    }

    kmlText = new TextDecoder().decode(kmlEntry);
  } else {
    kmlText = await file.text();
  }

  const doc = new DOMParser().parseFromString(kmlText, "text/xml");
  const placemarks = [...doc.getElementsByTagName("Placemark")];

  const idx = new Map();

  for (const pm of placemarks) {
    const name = pm.getElementsByTagName("name")[0]?.textContent ?? "";
    const coords = pm.getElementsByTagName("coordinates")[0]?.textContent ?? "";
    const first = coords.trim().split(/\s+/)[0] || "";
    const [lon, lat] = first.split(",").map(Number);

    const key = normalizeKey(name);
    if (!key || !lat || !lon) continue;

    if (!idx.has(key)) idx.set(key, { lat, lon });
  }

  return idx;
}

function buildFromInspecao(rows) {
  const iE  = colIndex("E");   // Instalacao_nova
  const iH  = colIndex("H");   // Número OT
  const iAP = colIndex("AP");  // DISPOSITIVO_PROTECAO
  const iV  = colIndex("V");   // Subestacao
  const iW  = colIndex("W");   // Alimentador

  return rows.slice(1).map(row => {
    const dispProt = String(row[iAP] ?? "").trim();
    const inst     = String(row[iE]  ?? "").trim();
    const ot       = String(row[iH]  ?? "").trim();
    const sub      = String(row[iV]  ?? "").trim();
    const alim     = String(row[iW]  ?? "").trim();

    const key = normalizeKey(dispProt);
    if (!key) return null;

    return {
      key,
      TIPO: "INSPECAO",
      DISPOSITIVO_PROTECAO: dispProt,
      INSTALACAO_NOVA: inst,
      NUMERO_OT: ot,
      ALIMENTADOR: alim,
      SUBESTACAO: sub
    };
  }).filter(Boolean);
}

function buildFromReiteradas(rows) {
  const iA = colIndex("A");
  const iC = colIndex("C");

  return rows.slice(1).map(row => {
    const disp = String(row[iA] ?? "").trim(); // Elemento
    return {
      key: normalizeKey(disp),
      TIPO: "REITERADA",
      DISPOSITIVO_PROTECAO: disp,  // reaproveita campo para mostrar no popup
      INSTALACAO_NOVA: "",
      NUMERO_OT: "",
      ALIMENTADOR: String(row[iC] ?? "").trim()
    };
  }).filter(r => r.key);
}

function mergeAndDiff(ins, rei) {
  const setIns = new Set(ins.map(x => x.key));
  const setRei = new Set(rei.map(x => x.key));
  const intersection = new Set([...setIns].filter(k => setRei.has(k)));

  return [
    ...rei.filter(x => !intersection.has(x.key)),
    ...ins.filter(x => !intersection.has(x.key))
  ];
}

function escapeXml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function buildKml(rows, idx) {

  // ---- Coordenada: tenta por DISPOSITIVO_PROTECAO, depois INSTALACAO_NOVA, depois ALIMENTADOR
  function findGeoForRow(r) {
    const k1 = normalizeKey(r.DISPOSITIVO_PROTECAO || "");
    const k2 = normalizeKey(r.INSTALACAO_NOVA || "");
    const k3 = normalizeKey(r.ALIMENTADOR || "");
    return idx.get(k1) || idx.get(k2) || idx.get(k3) || null;
  }

  // ---- Categoria: usa ALIMENTADOR; se vazio, usa INSTALACAO_NOVA (porque é onde vem CND01C4 etc)
  function detectCategory(row) {
    const alim = String(row.ALIMENTADOR || row.INSTALACAO_NOVA || "")
      .trim()
      .toUpperCase();
  
    // ✅ 1) REGRA PRINCIPAL: pelo alimentador exato
    const hit = ALIM_LOOKUP.get(alim);
    if (hit?.subestacao) return hit.subestacao;
  
    // ✅ 2) se tiver SUBESTACAO já preenchida (ex.: vindo da inspeção), usa
    const sub = String(row.SUBESTACAO || "").trim();
    if (sub) return sub;
  
    // ✅ 3) fallback (último recurso)
    if (alim) return alim.substring(0, 3) || "Outros";
    const dp = String(row.DISPOSITIVO_PROTECAO || "").trim().toUpperCase();
    return dp.substring(0, 3) || "Outros";
  }

  const groups = {};
  const notFoundRows = [];

  const PUSH_PIN = "http://maps.google.com/mapfiles/kml/pushpin/wht-pushpin.png";

  for (const r of rows) {
    const geo = findGeoForRow(r);
    if (!geo) {
      notFoundRows.push({
        TIPO: r.TIPO,
        DISPOSITIVO_PROTECAO: r.DISPOSITIVO_PROTECAO,
        INSTALACAO_NOVA: r.INSTALACAO_NOVA,
        ALIMENTADOR: r.ALIMENTADOR,
        NUMERO_OT: r.NUMERO_OT
      });
      continue;
    }

    const cat = detectCategory(r);
    if (!groups[cat]) groups[cat] = { INSPEÇÃO:[], REITERADA:[] };

    const tipo = r.TIPO === "INSPECAO" ? "INSPEÇÃO" : "REITERADA";
    const color = tipo === "INSPEÇÃO" ? "ff800080" : "ffffffff";

    const nomePino = String(r.DISPOSITIVO_PROTECAO || "").trim(); // ✅ SEMPRE DISPOSITIVO_PROTECAO
    const alimRef = String(r.ALIMENTADOR || r.INSTALACAO_NOVA || "").trim();

    groups[cat][tipo].push(`
<Placemark>
  <name>${escapeXml(nomePino)}</name>
  <Style>
    <IconStyle>
      <color>${color}</color>
      <scale>1.8</scale>
      <Icon><href>${PUSH_PIN}</href></Icon>
    </IconStyle>
  </Style>
  <description><![CDATA[
    <b>CATEGORIA:</b> ${escapeXml(cat)}<br/>
    <b>TIPO:</b> ${escapeXml(tipo)}<br/>
    <b>DISPOSITIVO_PROTECAO / ELEMENTO:</b> ${escapeXml(nomePino)}<br/>
    <b>OT:</b> ${escapeXml(r.NUMERO_OT || "-")}<br/>
    <b>ALIMENTADOR (ref):</b> ${escapeXml(alimRef || "-")}<br/>
    <b>INSTALACAO_NOVA:</b> ${escapeXml(r.INSTALACAO_NOVA || "-")}<br/>
  ]]></description>
  <Point><coordinates>${geo.lon},${geo.lat},0</coordinates></Point>
</Placemark>
`);
  }

  const ordered = Object.keys(groups)
  .filter(c => c !== "Outros")
  .sort((a,b) => a.localeCompare(b, "pt-BR"));

if (groups["Outros"]) ordered.push("Outros");

  const folders = ordered
    .filter(c => groups[c])
    .map(c => `
<Folder>
  <name>${escapeXml(c)}</name>

  <Folder>
    <name>🟣 INSPEÇÃO</name>
    ${groups[c]["INSPEÇÃO"].join("\n")}
  </Folder>

  <Folder>
    <name>⚪ REITERADA</name>
    ${groups[c]["REITERADA"].join("\n")}
  </Folder>

</Folder>`).join("\n");

  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>Resultado - Reiteradas x Inspeção</name>
${folders}
</Document>
</kml>`;

  return { kml, missing: notFoundRows.length, notFoundRows };
}

function download(data, filename, type) {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* function downloadXlsxNotFound(rows, filename) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "NAO_ENCONTRADOS");

  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });

  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
} */

$("btnGerarPlanilha").addEventListener("click", async () => {
  const fIns = $("fileInspecao").files[0];
  const fRei = $("fileReiteradas").files[0];

  if (!fIns || !fRei) {
    setStatus("Envie as duas planilhas.");
    return;
  }

  setStatus("Processando planilhas...");

  const wbIns = await readXlsxWorkbook(fIns);
  const insRows = sheetToRows(wbIns, "PBM-CE - Inspecao");
  const ins = buildFromInspecao(insRows);

// 🔵 CRIA MAPA: ALIMENTADOR -> SUBESTACAO
const alimToSub = new Map();

for (const r of ins) {
  const alim = normalizeKey(r.ALIMENTADOR || r.INSTALACAO_NOVA || "");

  const sub = String(r.SUBESTACAO || "").trim();

  if (alim && sub && !alimToSub.has(alim)) {
    alimToSub.set(alim, sub);
  }
}

  const wbRei = await readXlsxWorkbook(fRei);
  const reiRows = sheetToRows(wbRei, wbRei.SheetNames[0]);
  const rei = buildFromReiteradas(reiRows);

// 🔵 AGORA ADICIONA SUBESTACAO NAS REITERADAS
for (const r of rei) {
  const alim = normalizeKey(r.ALIMENTADOR || r.INSTALACAO_NOVA || "");

  r.SUBESTACAO = alimToSub.get(alim) || "";
}

  mergedRows = mergeAndDiff(ins, rei);

  // Planilha resultado: mostra claramente os campos
  const exportRows = mergedRows.map(r => ({
    TIPO: r.TIPO,
    DISPOSITIVO_PROTECAO: r.DISPOSITIVO_PROTECAO,
    SUBESTACAO: r.SUBESTACAO || "",
    ALIMENTADOR: r.ALIMENTADOR,
    INSTALACAO_NOVA: r.INSTALACAO_NOVA,
    NUMERO_OT: r.NUMERO_OT
  }));

  const ws = XLSX.utils.json_to_sheet(exportRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "RESULTADO");

  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  download(buf, "resultado.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

  $("btnGerarKml").disabled = false;
  setStatus("Planilha gerada com sucesso.");
});

$("btnGerarKml").addEventListener("click", async () => {
  const fKml = $("fileKmlGeral").files[0];
  if (!fKml) {
    setStatus("Envie o KML/KMZ geral.");
    return;
  }

  if (!mergedRows?.length) {
    setStatus("Gere a planilha primeiro.");
    return;
  }

  setStatus("Gerando KML final...");

  const idx = await readKmlIndex(fKml);
  const { kml, missing } = buildKml(mergedRows, idx);

  download(kml, "resultado_google_earth.kml", "application/vnd.google-earth.kml+xml");
  
  setStatus(
    `KML gerado com sucesso.\n` +
    `Sem coordenadas encontradas: ${missing}`
  );
  
});
function setBtnLoading(btn, loading, textDefault) {
  if (!btn) return;
  if (loading) {
    btn.dataset.prev = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="ico">⏳</span> Processando...`;
  } else {
    btn.disabled = false;
    btn.innerHTML = btn.dataset.prev || textDefault;
  }
}
