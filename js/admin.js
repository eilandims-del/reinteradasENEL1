/**
 * Script do Painel Administrativo
 *
 * ✅ Uploads:
 * - Reiteradas (planilha com coluna ÁREA)
 * - Clientes Afetados (planilha separada) -> salva em outra coleção
 *
 * ✅ Admin - Inspetores:
 * - Botão "Inspetores" abre modal com retornos
 * - Filtra por regional + período (client-side)
 * - Exporta XLSX / Copiar
 */

import { AuthService, DataService } from './services/firebase-service.js';
import { parseFile } from './utils/file-parser.js?v=20260304-1';
import { showToast } from './utils/helpers.js';
import { municipioToRegional } from './utils/regional-municipio.js';
import { openModal, closeModal } from './components/modal.js';

let currentUser = null;

// Mantemos o upload de reiteradas como “GERAL” (planilha única com ÁREA)
const UPLOADS = [
  { key: 'GERAL', uiKey: 'geral', label: 'REITERADAS (GERAL)' },
  { key: 'CLIENTES', uiKey: 'clientes', label: 'CLIENTES AFETADOS' }
];

function init() {
  initEventListeners();
  initInspetoresAdminUI(); // ✅ ativa o modal Inspetores
  checkAuthState();
}

function checkAuthState() {
  AuthService.onAuthStateChanged((user) => {
    currentUser = user;

    if (user) {
      showAdminSection();
      loadAllHistories();
    } else {
      // ✅ Login único em /login.html (evita “duplo login”)
      const base = window.location.pathname.replace(/\/[^/]*$/, '/');
      window.location.href = `${base}login.html?role=admin`;
    }
  });
}

function showLoginSection() {
  document.getElementById('loginSection').style.display = 'block';
  document.getElementById('adminSection').style.display = 'none';
  document.getElementById('logoutBtn').style.display = 'none';
}

function showAdminSection() {
  document.getElementById('loginSection').style.display = 'none';
  document.getElementById('adminSection').style.display = 'block';
  document.getElementById('logoutBtn').style.display = 'block';
}

function initEventListeners() {
  // Login
  document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleLogin();
  });

  // Logout
  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    await handleLogout();
  });

  // Limpeza completa
  document.getElementById('btnClearAll')?.addEventListener('click', async () => {
    await handleClearAll();
  });

  // Uploads (Reiteradas + Clientes)
  for (const u of UPLOADS) {
    const fileInput = document.getElementById(`fileInput_${u.uiKey}`);
    const dropZone = document.getElementById(`dropZone_${u.uiKey}`);

    if (!fileInput || !dropZone) continue;

    dropZone.addEventListener('click', () => fileInput.click());

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', async (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');

      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        await routeUploadByType(files[0], u.key, u.uiKey);
      }
    });

    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (file) {
        await routeUploadByType(file, u.key, u.uiKey);
      }
    });
  }
}

/* =========================
   ADMIN - MODAL INSPETORES
========================= */

function pad2(n) { return String(n).padStart(2, '0'); }

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function fmtBR(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function sanitizeOneLine(v) {
  return String(v ?? '').replace(/\s+/g, ' ').replace(/\n/g, ' ').trim();
}

function setTotal(n) {
  const el = document.getElementById('inspetoresTotal');
  if (el) el.textContent = `Retornos: ${Number(n || 0)}`;
}

function renderRetornosList(rows) {
  const container = document.getElementById('inspetoresLista');
  if (!container) return;

  const items = Array.isArray(rows) ? rows : [];
  setTotal(items.length);

  if (!items.length) {
    container.innerHTML =
      '<p style="text-align:center; padding: 2rem; color: var(--medium-gray);">Nenhum retorno encontrado.</p>';
    return;
  }

  container.innerHTML = '';

  items.forEach((r, idx) => {
    const div = document.createElement('div');
    div.className = 'ranking-item';
    div.style.cursor = 'default';

    const incidencia = sanitizeOneLine(r.incidencia || '—');
    const elemento = sanitizeOneLine(r.elemento || '—');
    const causa = sanitizeOneLine(r.causa || '—');
    const cli = sanitizeOneLine(r.clienteAfetado || '—');
    const regional = sanitizeOneLine(r.regional || r.REGIONAL || '—');
    const dataRef = fmtBR(r.dataRef);
    const insp = sanitizeOneLine(r.inspectorEmail || '—');
    const txt = sanitizeOneLine(r.retornoTexto || '');

    div.innerHTML = `
      <span class="ranking-item-position">${idx + 1}º</span>
      <span class="ranking-item-name" style="display:flex; flex-direction:column; gap:4px;">
        <span><b>${elemento}</b> • Inc: ${incidencia} • ${regional} • ${dataRef}</span>
        <span style="color: var(--medium-gray); font-weight:700;">Cli: ${cli} • Causa: ${causa}</span>
        <span style="white-space: pre-wrap; font-weight:800;">Retorno: ${txt || '—'}</span>
        <span style="color: var(--medium-gray); font-weight:700;">Inspetor: ${insp}</span>
      </span>
    `;
    container.appendChild(div);
  });
}

function buildCopyText(rows) {
  const items = Array.isArray(rows) ? rows : [];
  if (!items.length) return 'Sem retornos.';

  const lines = [];
  lines.push(`RETORNOS DOS INSPETORES (${items.length})`);
  lines.push('---------------------------');

  for (const r of items) {
    lines.push(
      `• ${sanitizeOneLine(r.regional || r.REGIONAL || '—')} • ${fmtBR(r.dataRef)} • Inc ${sanitizeOneLine(r.incidencia)} • ${sanitizeOneLine(r.elemento)}`
    );
    lines.push(`  Cliente: ${sanitizeOneLine(r.clienteAfetado)}`);
    lines.push(`  Causa: ${sanitizeOneLine(r.causa)}`);
    lines.push(`  Retorno: ${sanitizeOneLine(r.retornoTexto)}`);
    lines.push(`  Inspetor: ${sanitizeOneLine(r.inspectorEmail)}`);
    lines.push('');
  }

  return lines.join('\n').trim();
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return { success: true };
  } catch (_) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      return { success: true };
    } catch (err) {
      return { success: false, error: err?.message || String(err) };
    }
  }
}

function exportToXlsx(rows) {
  if (!window.XLSX) {
    alert('XLSX não carregado. Verifique o CDN do SheetJS no admin.html.');
    return;
  }

  const items = Array.isArray(rows) ? rows : [];
  if (!items.length) {
    alert('Sem retornos para exportar.');
    return;
  }

  const header = [
    'REGIONAL', 'DATA_REF', 'INCIDENCIA', 'ELEMENTO', 'CLIENTE_AFETADO', 'CAUSA',
    'RETORNO', 'INSPETOR_EMAIL', 'CREATED_AT', 'UPDATED_AT'
  ];

  const aoa = [header];

  items.forEach(r => {
    aoa.push([
      r.regional || r.REGIONAL || '',
      r.dataRef || '',
      r.incidencia || '',
      r.elemento || '',
      r.clienteAfetado || '',
      r.causa || '',
      r.retornoTexto || '',
      r.inspectorEmail || '',
      r.createdAt?.seconds ? new Date(r.createdAt.seconds * 1000).toISOString() : '',
      r.updatedAt?.seconds ? new Date(r.updatedAt.seconds * 1000).toISOString() : ''
    ]);
  });

  const ws = window.XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = header.map((h, i) => {
    let max = h.length;
    for (let r = 1; r < aoa.length; r++) max = Math.max(max, String(aoa[r][i] || '').length);
    return { wch: Math.min(Math.max(max + 2, 12), 60) };
  });

  const wb = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(wb, ws, 'Retornos');

  const now = new Date();
  const stamp = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}_${pad2(now.getHours())}${pad2(now.getMinutes())}`;
  window.XLSX.writeFile(wb, `Retornos_Inspetores_${stamp}.xlsx`);
}

function initInspetoresAdminUI() {
  const btnOpen = document.getElementById('btnInspetores');
  const btnClose = document.getElementById('fecharModalInspetores');
  const btnLoad = document.getElementById('btnCarregarRetornos');
  const btnCopy = document.getElementById('btnCopiarRetornos');
  const btnExport = document.getElementById('btnExportRetornos');

  const selReg = document.getElementById('inspReg');
  const di = document.getElementById('inspDataIni');
  const df = document.getElementById('inspDataFim');

  // se o admin.html ainda não tem o modal, não quebra
  if (!btnOpen || !selReg || !di || !df) return;

  if (!di.value) di.value = todayISO();
  if (!df.value) df.value = todayISO();

  let lastRows = [];

  const load = async () => {
    const regional = selReg?.value || 'TODOS';
    const dataInicial = di?.value || '';
    const dataFinal = df?.value || '';

    const res = await DataService.getRetornosAdminFiltrado({ regional, dataInicial, dataFinal });
    if (!res?.success) {
      alert(`Erro ao carregar retornos: ${res?.error || 'Falha desconhecida'}`);
      lastRows = [];
      renderRetornosList([]);
      return;
    }

    lastRows = res.data || [];
    renderRetornosList(lastRows);
  };

  btnOpen.addEventListener('click', async () => {
    openModal('modalInspetores');
    await load();
  });

  btnClose?.addEventListener('click', () => closeModal('modalInspetores'));
  btnLoad?.addEventListener('click', load);

  btnCopy?.addEventListener('click', async () => {
    const text = buildCopyText(lastRows);
    const r = await copyToClipboard(text);
    alert(r.success ? 'Retornos copiados!' : `Erro ao copiar: ${r.error || 'falha'}`);
  });

  btnExport?.addEventListener('click', () => exportToXlsx(lastRows));
}

/* =========================
   Auth handlers
========================= */

async function handleLogin() {
  const email = document.getElementById('email')?.value || '';
  const senha = document.getElementById('senha')?.value || '';
  const errorDiv = document.getElementById('loginError');

  const result = await AuthService.login(email, senha);

  if (result.success) {
    errorDiv?.classList.remove('show');
    if (errorDiv) errorDiv.textContent = '';
    showToast('Login realizado com sucesso!', 'success');
  } else {
    if (errorDiv) {
      errorDiv.textContent = result.error || 'Erro ao fazer login';
      errorDiv.classList.add('show');
    }
    showToast('Erro ao fazer login. Verifique suas credenciais.', 'error');
  }
}

async function handleLogout() {
  const result = await AuthService.logout();
  if (result.success) {
    showToast('Logout realizado com sucesso!', 'success');
    showLoginSection();
  }
}

/* =========================
   Helpers: ÁREA/REGIONAL
========================= */

function normalizeFieldName(name) {
  return String(name || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasAreaColumn(headers = []) {
  return headers.some(h => normalizeFieldName(h) === 'AREA');
}

function normalizeAreaToRegional(areaRaw) {
  const v = String(areaRaw || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');

  if (!v) return '';

  if (v.includes('ATLANT')) return 'ATLANTICO';
  if (v === 'NORTE' || v.includes(' NORTE')) return 'NORTE';
  if (v.includes('CENTRO') && v.includes('NORTE')) return 'CENTRO NORTE';

  return '';
}

/* =========================
   Roteamento de upload
========================= */

async function routeUploadByType(file, key, uiKey) {
  if (key === 'CLIENTES') return handleClientesUpload(file, uiKey);
  return handleReiteradasUpload(file, key, uiKey);
}

/* =========================
   Upload REITERADAS (GERAL)
========================= */

async function handleReiteradasUpload(file, regionalKey, uiKey) {
  const uploadProgress = document.getElementById(`uploadProgress_${uiKey}`);
  const progressFill = document.getElementById(`progressFill_${uiKey}`);
  const progressText = document.getElementById(`progressText_${uiKey}`);
  const uploadResult = document.getElementById(`uploadResult_${uiKey}`);

  if (!currentUser) {
    showToast('Você precisa estar logado para fazer upload.', 'error');
    return;
  }

  if (!uploadProgress || !progressFill || !progressText || !uploadResult) {
    showToast(`UI do upload (${regionalKey}) não encontrada no admin.html.`, 'error');
    return;
  }

  uploadProgress.style.display = 'block';
  uploadResult.style.display = 'none';
  uploadResult.innerHTML = '';
  progressFill.style.width = '10%';
  progressText.textContent = 'Lendo arquivo...';
  progressText.style.color = '';

  try {
    progressFill.style.width = '25%';
    progressText.textContent = 'Processando arquivo...';

    const parsed = await parseFile(file, { dataset: 'REITERADAS' });

    const hasAREA = hasAreaColumn(parsed.headers || []);
    if (!hasAREA) {
      throw new Error('Coluna "ÁREA" não encontrada (esperado: coluna E).');
    }

    progressFill.style.width = '40%';
    progressText.textContent = 'Distribuindo por regional (via ÁREA)...';

    const enriched = (parsed.data || []).map(row => {
      const areaVal = row?.AREA ?? row?.['ÁREA'] ?? row?.area ?? row?.Area ?? '';
      const reg = normalizeAreaToRegional(areaVal);

      return { ...row, REGIONAL: reg, regional: reg, AREA: areaVal };
    });

    const okCount = enriched.filter(r => !!r.REGIONAL).length;
    if (okCount === 0) {
      throw new Error('Nenhuma linha foi mapeada pela coluna "ÁREA". Verifique valores: ATLÂNTICO / NORTE / CENTRO NORTE.');
    }

    progressFill.style.width = '50%';
    progressText.textContent = `Validando dados... (${okCount} linha(s) com REGIONAL)`;

    const uploadId = DataService.generateUploadId();

    const metadata = {
      uploadId,
      dataset: 'REITERADAS',
      regional: 'MISTO',
      REGIONAL: 'MISTO',
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type || 'unknown',
      totalColumns: parsed.headers.length,
      columns: parsed.headers,
      uploadedAt: new Date().toISOString()
    };

    progressFill.style.width = '70%';
    progressText.textContent = 'Salvando no banco (3 regionais)...';

    const updateProgress = (progressInfo) => {
      const progress = progressInfo.progress ?? 0;
      progressFill.style.width = `${70 + (progress * 0.3)}%`;

      if (progressInfo.retrying) {
        progressText.textContent = `Retry (${progressInfo.retryCount})... ${progressInfo.nextRetryIn}s`;
        progressText.style.color = 'var(--warning)';
      } else {
        progressText.textContent =
          `Batch ${progressInfo.batch}/${progressInfo.totalBatches}... ` +
          `(${progressInfo.saved}/${progressInfo.total} - ${progress}%)`;
        progressText.style.color = '';
      }
    };

    const saveResult = await DataService.saveData(enriched, metadata, updateProgress);

    if (!saveResult.success) throw new Error(saveResult.error || 'Erro ao salvar dados');

    progressFill.style.width = '100%';
    progressText.textContent = 'Concluído! (3 regionais)';

    uploadResult.className = 'upload-result success';
    uploadResult.innerHTML = `
      <strong>✓ Upload realizado com sucesso!</strong><br>
      Tipo: Reiteradas (Geral via ÁREA)<br>
      Arquivo: ${file.name}<br>
      Registros processados: ${saveResult.count}<br>
      Colunas: ${parsed.headers.length}
    `;
    uploadResult.style.display = 'block';

    showToast(`Upload concluído (REITERADAS): ${saveResult.count} registro(s).`, 'success');

    const input = document.getElementById(`fileInput_${uiKey}`);
    if (input) input.value = '';

    setTimeout(() => {
      loadUploadHistory(regionalKey, uiKey);
      uploadProgress.style.display = 'none';
    }, 1200);

  } catch (error) {
    console.error('[ADMIN] Erro no upload (REITERADAS):', error);

    uploadResult.className = 'upload-result error';
    uploadResult.innerHTML = `<strong>✗ Erro no upload:</strong><br>${error.message}`;
    uploadResult.style.display = 'block';
    uploadProgress.style.display = 'none';

    showToast(`Erro (REITERADAS): ${error.message}`, 'error');
  }
}

/* =========================
   Upload CLIENTES AFETADOS
========================= */

async function handleClientesUpload(file, uiKey) {
  const uploadProgress = document.getElementById(`uploadProgress_${uiKey}`);
  const progressFill = document.getElementById(`progressFill_${uiKey}`);
  const progressText = document.getElementById(`progressText_${uiKey}`);
  const uploadResult = document.getElementById(`uploadResult_${uiKey}`);

  if (!currentUser) {
    showToast('Você precisa estar logado para fazer upload.', 'error');
    return;
  }

  if (!uploadProgress || !progressFill || !progressText || !uploadResult) {
    showToast(`UI do upload (CLIENTES) não encontrada no admin.html.`, 'error');
    return;
  }

  uploadProgress.style.display = 'block';
  uploadResult.style.display = 'none';
  uploadResult.innerHTML = '';
  progressFill.style.width = '10%';
  progressText.textContent = 'Lendo arquivo...';
  progressText.style.color = '';

  // ✅ progress callback local (era o bug: updateProgress não existia aqui)
  const updateProgressClientes = (progressInfo) => {
    const p = progressInfo.progress ?? 0;
    progressFill.style.width = `${70 + (p * 0.3)}%`;

    if (progressInfo.retrying) {
      progressText.textContent = `Retry (${progressInfo.retryCount})... ${progressInfo.nextRetryIn}s`;
      progressText.style.color = 'var(--warning)';
    } else {
      progressText.textContent =
        `Batch ${progressInfo.batch}/${progressInfo.totalBatches}... ` +
        `(${progressInfo.saved}/${progressInfo.total} - ${p}%)`;
      progressText.style.color = '';
    }
  };

  try {
    progressFill.style.width = '25%';
    progressText.textContent = 'Processando arquivo...';

    const parsed = await parseFile(file, { dataset: 'CLIENTES' });

    const rows = Array.isArray(parsed.data) ? parsed.data : [];
    if (!rows.length) throw new Error('Nenhuma linha válida encontrada (CLIENTES).');

    // normaliza e define regional pelo município
    const normalized = rows.map(r => {
      const municipio = r.MUNICIPIO || r['MUNICÍPIO'] || '';
      const reg = municipioToRegional(municipio) || 'GERAL';

      const drop = { ...r };

      // remove campos pesados
      const DROP_FIELDS = ['OBSERVACAO CC', 'OBSERVAÇÃO CC', 'CC'];
      for (const f of DROP_FIELDS) if (f in drop) delete drop[f];

      for (const k of Object.keys(drop)) {
        const kk = String(k).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (kk.startsWith('OBSERVACAO')) delete drop[k];
        if (kk.startsWith('OBSERVAÇÃO')) delete drop[k];
      }

      return { ...drop, REGIONAL: reg, regional: reg };
    });

    // TOP 10 por regional
    const getNumCliente = (row) =>
      String(row.NUM_CLIENTE || row['Nº CLIENTE'] || row['NUM CLIENTE'] || '').trim();

    const counts = new Map(); // `${REGIONAL}||${NUM}`
    for (const r of normalized) {
      const num = getNumCliente(r);
      const reg = String(r.REGIONAL || 'GERAL');
      if (!num) continue;
      const key = `${reg}||${num}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    function topNByRegional(regional, n = 10) {
      const items = [];
      for (const [k, c] of counts.entries()) {
        const [reg, num] = k.split('||');
        if (reg === regional) items.push({ num, count: c });
      }
      items.sort((a, b) => b.count - a.count);
      return items.slice(0, n).map(x => x.num);
    }

    const topNorte = new Set(topNByRegional('NORTE', 10));
    const topCentro = new Set(topNByRegional('CENTRO NORTE', 10));
    const topAtlantico = new Set(topNByRegional('ATLANTICO', 10));

    const filtered = normalized.filter(r => {
      const num = getNumCliente(r);
      const reg = String(r.REGIONAL || 'GERAL');
      if (!num) return false;
      if (reg === 'NORTE') return topNorte.has(num);
      if (reg === 'CENTRO NORTE') return topCentro.has(num);
      if (reg === 'ATLANTICO') return topAtlantico.has(num);
      return false;
    });

    if (!filtered.length) {
      throw new Error('Após o filtro TOP 10 por regional, nenhuma linha sobrou. Verifique MUNICIPIO/NUM_CLIENTE.');
    }

    progressFill.style.width = '55%';
    progressText.textContent = `Preparando upload filtrado (TOP 10/regional)... (${filtered.length} linha(s))`;

    const uploadId = DataService.generateUploadId();

    const metadata = {
      uploadId,
      dataset: 'CLIENTES',
      regional: 'MISTO',
      REGIONAL: 'MISTO',
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type || 'unknown',
      totalColumns: parsed.headers.length,
      columns: parsed.headers,
      uploadedAt: new Date().toISOString(),
      top10: {
        NORTE: Array.from(topNorte),
        'CENTRO NORTE': Array.from(topCentro),
        ATLANTICO: Array.from(topAtlantico),
      }
    };

    progressFill.style.width = '70%';
    progressText.textContent = 'Salvando no banco (CLIENTES TOP 10/regional)...';

    const saveResult = await DataService.saveClientesData(filtered, metadata, updateProgressClientes);
    if (!saveResult.success) throw new Error(saveResult.error || 'Erro ao salvar dados');

    progressFill.style.width = '100%';
    progressText.textContent = 'Concluído! (CLIENTES)';

    uploadResult.className = 'upload-result success';
    uploadResult.innerHTML = `
      <strong>✓ Upload de CLIENTES realizado com sucesso!</strong><br>
      Arquivo: ${file.name}<br>
      Registros processados: ${saveResult.count}<br>
      Colunas: ${parsed.headers.length}
    `;
    uploadResult.style.display = 'block';

    showToast(`Upload concluído (CLIENTES): ${saveResult.count} registro(s).`, 'success');

    const input = document.getElementById(`fileInput_${uiKey}`);
    if (input) input.value = '';

    setTimeout(() => {
      loadUploadHistory('CLIENTES', uiKey);
      uploadProgress.style.display = 'none';
    }, 1200);

  } catch (error) {
    console.error('[ADMIN] Erro no upload (CLIENTES):', error);

    uploadResult.className = 'upload-result error';
    uploadResult.innerHTML = `<strong>✗ Erro no upload:</strong><br>${error.message}`;
    uploadResult.style.display = 'block';
    uploadProgress.style.display = 'none';

    showToast(`Erro (CLIENTES): ${error.message}`, 'error');
  }
}

/* =========================
   Histórico
========================= */

async function loadUploadHistory(key, uiKey) {
  const historyContainer = document.getElementById(`uploadHistory_${uiKey}`);
  if (!historyContainer) return;

  historyContainer.innerHTML =
    '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Carregando histórico...</div>';

  const result = await DataService.getUploadHistory(key);

  if (result.success && result.history.length > 0) {
    historyContainer.innerHTML = '';

    result.history.forEach(item => {
      const historyItem = document.createElement('div');
      historyItem.className = 'history-item';
      historyItem.dataset.uploadId = item.id;

      const date = item.uploadedAt?.toDate
        ? item.uploadedAt.toDate().toLocaleString('pt-BR')
        : 'Data não disponível';

      const fileName = item.fileName || 'Arquivo sem nome';
      const uploadId = item.id;
      const ds = String(item.dataset || '').toUpperCase() || (key === 'CLIENTES' ? 'CLIENTES' : 'REITERADAS');

      const dsLabel = ds === 'CLIENTES'
        ? 'Clientes Afetados'
        : 'Reiteradas (Geral via ÁREA)';

      historyItem.innerHTML = `
        <div class="history-info">
          <h3>${fileName}</h3>
          <p>Tipo: ${dsLabel}</p>
          <p>Upload em: ${date}</p>
          <p>Por: ${item.uploadedBy || 'Desconhecido'}</p>
        </div>
        <div class="history-actions">
          <span class="history-badge success">${item.totalRecords || 0} registros</span>
          <button class="btn btn-danger btn-sm btn-delete-upload" type="button">
            <i class="fas fa-trash"></i> Excluir
          </button>
        </div>
      `;

      historyContainer.appendChild(historyItem);

      historyItem.querySelector('.btn-delete-upload')?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleDeleteUpload(uploadId, fileName, key, uiKey);
      });
    });

  } else {
    historyContainer.innerHTML =
      '<p style="text-align: center; padding: 1rem; color: var(--medium-gray);">Nenhum upload realizado ainda.</p>';
  }
}

function loadAllHistories() {
  for (const u of UPLOADS) loadUploadHistory(u.key, u.uiKey);
}

/* =========================
   Excluir upload
========================= */

async function handleDeleteUpload(uploadId, fileName, key, uiKey) {
  const confirmMessage =
    `Tem certeza que deseja excluir a planilha "${fileName}"?\n\n` +
    `⚠️ Esta ação não pode ser desfeita.\n\nDeseja continuar?`;

  if (!confirm(confirmMessage)) return;

  const historyContainer = document.getElementById(`uploadHistory_${uiKey}`);
  if (!historyContainer) {
    showToast(`Container de histórico não encontrado.`, 'error');
    return;
  }

  const originalContent = historyContainer.innerHTML;

  historyContainer.innerHTML = `
    <div class="loading-spinner">
      <i class="fas fa-spinner fa-spin"></i>
      <p>Excluindo "${fileName}"...</p>
    </div>
  `;

  try {
    const result = await DataService.deleteUpload(uploadId);

    if (result.success) {
      const msg = result.deletedCount > 0
        ? `✅ Excluída! ${result.deletedCount} registro(s) removido(s).`
        : `✅ Referência removida. (Nenhum registro encontrado)`;

      showToast(msg, 'success');
      setTimeout(() => loadUploadHistory(key, uiKey), 1000);
    } else {
      showToast(`Erro ao excluir: ${result.error || 'Erro desconhecido'}`, 'error');
      setTimeout(() => {
        historyContainer.innerHTML = originalContent;
        loadUploadHistory(key, uiKey);
      }, 1200);
    }
  } catch (error) {
    console.error('[ADMIN] Erro inesperado ao excluir:', error);
    showToast(`Erro inesperado: ${error.message}`, 'error');

    setTimeout(() => {
      historyContainer.innerHTML = originalContent;
      loadUploadHistory(key, uiKey);
    }, 1200);
  }
}

/* =========================
   Limpeza completa
========================= */

async function handleClearAll() {
  const firstConfirm = confirm(
    '⚠️ ATENÇÃO: LIMPEZA COMPLETA DO BANCO DE DADOS\n\n' +
    'Esta ação irá deletar TODOS os dados.\n\n' +
    'Tem CERTEZA ABSOLUTA que deseja continuar?'
  );
  if (!firstConfirm) return;

  const secondConfirm = confirm('⚠️ ÚLTIMA CONFIRMAÇÃO\n\nDeseja realmente apagar tudo?');
  if (!secondConfirm) return;

  const typedConfirm = prompt('Digite "CONFIRMAR" (maiúsculas) para executar a limpeza completa:');
  if (typedConfirm !== 'CONFIRMAR') {
    showToast('Limpeza cancelada.', 'error');
    return;
  }

  showToast('Iniciando limpeza completa... isso pode demorar.', 'info');

  try {
    const result = await DataService.clearAllData();
    if (result.success) {
      showToast('Limpeza completa concluída!', 'success');
      loadAllHistories();
    } else {
      showToast(`Erro na limpeza: ${result.error || 'desconhecido'}`, 'error');
    }
  } catch (e) {
    showToast(`Erro inesperado: ${e.message}`, 'error');
  }
}

// Inicializar
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}