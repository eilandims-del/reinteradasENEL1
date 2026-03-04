/**
 * Script do Painel Administrativo
 *
 * ✅ Esta versão adiciona um SEGUNDO upload independente:
 * - Upload Reiteradas (planilha com coluna ÁREA para distribuir 3 regionais)
 * - Upload Clientes Afetados (planilha separada) -> salva em outra coleção
 *
 * Requisitos (Clientes):
 * - Deve conter a coluna "CLI. AFE" (ou variações: CLI AFE / CLI. AFET)
 * - Coluna ÁREA/AREA/REGIONAL é opcional (se existir, mapeia a regional; se não, salva como "GERAL")
 */

import { AuthService, DataService } from './services/firebase-service.js';
import { parseFile } from './utils/file-parser.js?v=20260304-1';
import { showToast } from './utils/helpers.js';

let currentUser = null;

// Mantemos o upload de reiteradas como “GERAL” (planilha única com ÁREA)
const UPLOADS = [
  { key: 'GERAL', uiKey: 'geral', label: 'REITERADAS (GERAL)' },
  { key: 'CLIENTES', uiKey: 'clientes', label: 'CLIENTES AFETADOS' }
];

function init() {
  initEventListeners();
  checkAuthState();
}

function checkAuthState() {
  AuthService.onAuthStateChanged((user) => {
    currentUser = user;

    if (user) {
      showAdminSection();
      loadAllHistories();
    } else {
      showLoginSection();
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

function pickRegionalFromRow(row) {
  if (!row || typeof row !== 'object') return '';

  const direct =
    row['ÁREA'] ?? row['AREA'] ?? row.AREA ?? row.area ??
    row['REGIONAL'] ?? row.REGIONAL ?? row.regional;

  const reg = normalizeAreaToRegional(direct);
  if (reg) return reg;

  // fallback: procura chaves equivalentes
  const keys = Object.keys(row);
  const kArea = keys.find(k => normalizeFieldName(k) === 'AREA');
  if (kArea != null) {
    const r2 = normalizeAreaToRegional(row[kArea]);
    if (r2) return r2;
  }

  const kReg = keys.find(k => normalizeFieldName(k) === 'REGIONAL');
  if (kReg != null) {
    const r3 = normalizeAreaToRegional(row[kReg]);
    if (r3) return r3;
  }

  return '';
}
/* =========================
   Roteamento de upload
========================= */
async function routeUploadByType(file, key, uiKey) {
  if (key === 'CLIENTES') return handleClientesUpload(file, uiKey);
  // padrão: reiteradas (GERAL)
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

      return {
        ...row,
        REGIONAL: reg,
        regional: reg,
        AREA: areaVal
      };
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

    if (saveResult.success) {
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
    } else {
      throw new Error(saveResult.error || 'Erro ao salvar dados');
    }

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

  try {
    progressFill.style.width = '25%';
    progressText.textContent = 'Processando arquivo...';

    const parsed = await parseFile(file, { dataset: 'CLIENTES' });

    // parseFile agora já valida estrutura CLIENTES (colunas obrigatórias)
    const rows = Array.isArray(parsed.data) ? parsed.data : [];

    const cleaned = rows.map(r => {
      const reg = pickRegionalFromRow(r) || 'GERAL';

      return {
        ...r,
        REGIONAL: reg,
        regional: reg
      };
    });

    // segurança extra
    if (!cleaned.length) {
      throw new Error('Nenhuma linha válida encontrada (CLIENTES).');
    }

    progressFill.style.width = '55%';
    progressText.textContent = `Preparando upload... (${cleaned.length} linha(s))`;

    const uploadId = DataService.generateUploadId();

    const metadata = {
      uploadId,
      dataset: 'CLIENTES',
      regional: 'GERAL',
      REGIONAL: 'GERAL',
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type || 'unknown',
      totalColumns: parsed.headers.length,
      columns: parsed.headers,
      uploadedAt: new Date().toISOString()
    };

    progressFill.style.width = '70%';
    progressText.textContent = 'Salvando no banco (CLIENTES)...';

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

    const saveResult = await DataService.saveClientesData(cleaned, metadata, updateProgress);

    if (saveResult.success) {
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
    } else {
      throw new Error(saveResult.error || 'Erro ao salvar dados');
    }

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
  for (const u of UPLOADS) {
    loadUploadHistory(u.key, u.uiKey);
  }
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