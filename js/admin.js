/**
 * Script do Painel Administrativo
 */

import { AuthService, DataService } from './services/firebase-service.js';
import { parseFile } from './utils/file-parser.js';
import { showToast } from './utils/helpers.js';

let currentUser = null;

const REGIONAIS = [
  { key: 'GERAL', uiKey: 'geral', label: 'GERAL' }
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

  // Upload (GERAL)
  for (const r of REGIONAIS) {
    const fileInput = document.getElementById(`fileInput_${r.uiKey}`);
    const dropZone = document.getElementById(`dropZone_${r.uiKey}`);

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
        await handleFileUpload(files[0], r.key, r.uiKey);
      }
    });

    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (file) {
        await handleFileUpload(file, r.key, r.uiKey);
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

/**
 * Helpers: detectar coluna ÁREA e mapear para REGIONAL
 */
function hasAreaColumn(headers = []) {
  return headers.some(h => String(h || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    === 'AREA'
  );
}

function normalizeAreaToRegional(areaRaw) {
  const v = String(areaRaw || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');

  if (!v) return '';

  // aceita variações comuns
  if (v.includes('ATLANT')) return 'ATLANTICO';
  if (v === 'NORTE' || v.includes(' NORTE')) return 'NORTE';
  if (v.includes('CENTRO') && v.includes('NORTE')) return 'CENTRO NORTE';

  return '';
}

/**
 * Upload Geral (planilha única) -> lê ÁREA (coluna E) -> salva cada linha com REGIONAL correto
 */
async function handleFileUpload(file, regionalKey, uiKey) {
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

  // UI reset
  uploadProgress.style.display = 'block';
  uploadResult.style.display = 'none';
  uploadResult.innerHTML = '';
  progressFill.style.width = '10%';
  progressText.textContent = 'Lendo arquivo...';
  progressText.style.color = '';

  try {
    progressFill.style.width = '25%';
    progressText.textContent = 'Processando arquivo...';

    const parsed = await parseFile(file);

    // ✅ precisa existir coluna ÁREA (AREA após normalização)
    const hasAREA = hasAreaColumn(parsed.headers || []);
    if (!hasAREA) {
      throw new Error('Coluna "ÁREA" não encontrada (esperado: coluna E).');
    }

    progressFill.style.width = '40%';
    progressText.textContent = 'Distribuindo por regional (via ÁREA)...';

    // ✅ injeta REGIONAL por linha, a partir de AREA/ÁREA
    const enriched = (parsed.data || []).map(row => {
      const areaVal = row?.AREA ?? row?.['ÁREA'] ?? row?.area ?? row?.Area ?? '';
      const reg = normalizeAreaToRegional(areaVal);

      return {
        ...row,
        // importante: salvar nos dois campos (alguns lugares usam ambos)
        REGIONAL: reg,
        regional: reg,
        AREA: areaVal
      };
    });

    // valida se veio pelo menos 1 linha com REGIONAL mapeado
    const okCount = enriched.filter(r => !!r.REGIONAL).length;
    if (okCount === 0) {
      throw new Error('Nenhuma linha foi mapeada pela coluna "ÁREA". Verifique valores: ATLÂNTICO / NORTE / CENTRO NORTE.');
    }

    progressFill.style.width = '50%';
    progressText.textContent = `Validando dados... (${okCount} linha(s) com REGIONAL)`;

    const uploadId = DataService.generateUploadId();

    const metadata = {
      uploadId,
      // histórico fica como "MISTO", porque o arquivo contém 3 regionais
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
        Modo: Geral (3 Regionais via ÁREA)<br>
        Arquivo: ${file.name}<br>
        Registros processados: ${saveResult.count}<br>
        Colunas: ${parsed.headers.length}
      `;
      uploadResult.style.display = 'block';

      showToast(`Upload concluído (GERAL): ${saveResult.count} registro(s).`, 'success');

      // limpar input
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
    console.error('[ADMIN] Erro no upload:', error);

    uploadResult.className = 'upload-result error';
    uploadResult.innerHTML = `<strong>✗ Erro no upload:</strong><br>${error.message}`;
    uploadResult.style.display = 'block';
    uploadProgress.style.display = 'none';

    showToast(`Erro (GERAL): ${error.message}`, 'error');
  }
}

/**
 * Histórico
 */
async function loadUploadHistory(regionalKey, uiKey) {
  const historyContainer = document.getElementById(`uploadHistory_${uiKey}`);
  if (!historyContainer) return;

  historyContainer.innerHTML =
    '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Carregando histórico...</div>';

  // ✅ Como "GERAL" não é uma regional real, normalizeRegional() retorna vazio e o service traz "tudo"
  const result = await DataService.getUploadHistory(regionalKey);

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

      historyItem.innerHTML = `
        <div class="history-info">
          <h3>${fileName}</h3>
          <p>Modo: Geral (ÁREA → 3 regionais)</p>
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
        handleDeleteUpload(uploadId, fileName, regionalKey, uiKey);
      });
    });

  } else {
    historyContainer.innerHTML =
      '<p style="text-align: center; padding: 1rem; color: var(--medium-gray);">Nenhum upload realizado ainda.</p>';
  }
}

function loadAllHistories() {
  for (const r of REGIONAIS) {
    loadUploadHistory(r.key, r.uiKey);
  }
}

/**
 * Excluir upload
 */
async function handleDeleteUpload(uploadId, fileName, regionalKey, uiKey) {
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
      setTimeout(() => loadUploadHistory(regionalKey, uiKey), 1000);
    } else {
      showToast(`Erro ao excluir: ${result.error || 'Erro desconhecido'}`, 'error');
      setTimeout(() => {
        historyContainer.innerHTML = originalContent;
        loadUploadHistory(regionalKey, uiKey);
      }, 1200);
    }
  } catch (error) {
    console.error('[ADMIN] Erro inesperado ao excluir:', error);
    showToast(`Erro inesperado: ${error.message}`, 'error');

    setTimeout(() => {
      historyContainer.innerHTML = originalContent;
      loadUploadHistory(regionalKey, uiKey);
    }, 1200);
  }
}

/**
 * Limpeza completa
 */
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
