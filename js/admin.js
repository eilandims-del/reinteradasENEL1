/**
 * Script do Painel Administrativo
 */

import { AuthService, DataService } from './services/firebase-service.js';
import { parseFile } from './utils/file-parser.js';
import { showToast } from './utils/helpers.js';

let currentUser = null;

const REGIONAIS = [
  { key: 'ATLANTICO', uiKey: 'atlantico', label: 'ATLANTICO' },
  { key: 'NORTE', uiKey: 'norte', label: 'NORTE' },
  { key: 'CENTRO NORTE', uiKey: 'centronorte', label: 'CENTRO NORTE' }
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

  // Limpeza completa (se existir)
  document.getElementById('btnClearAll')?.addEventListener('click', async () => {
    await handleClearAll();
  });

  // Upload listeners por regional (3)
  for (const r of REGIONAIS) {
    const fileInput = document.getElementById(`fileInput_${r.uiKey}`);
    const dropZone = document.getElementById(`dropZone_${r.uiKey}`);

    // Se o admin.html ainda não estiver com os 3 blocos, não quebra
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
 * Upload por Regional
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
  progressText.textContent = `Lendo arquivo (${regionalKey})...`;
  progressText.style.color = '';

  try {

    progressFill.style.width = '30%';
    progressText.textContent = `Processando arquivo (${regionalKey})...`;

    const parsed = await parseFile(file);

    // ✅ detecta coluna REGIONAL na planilha (modo misto)
    const hasRegionalColumn = (parsed.headers || []).some(h =>
      String(h || '').trim().toUpperCase().replace(/\./g,'') === 'REGIONAL'
    );

    // ✅ AQUI você troca a mensagem “Lendo arquivo ...”
    progressText.textContent = hasRegionalColumn
      ? `Lendo arquivo (MISTO: 3 regionais)...`
      : `Lendo arquivo (${regionalKey})...`;

    progressFill.style.width = '50%';
    progressText.textContent = `Validando dados (${regionalKey})...`;

    const metadata = {
      uploadId,
      regional: hasRegionalColumn ? 'MISTO' : regionalKey,
      REGIONAL: hasRegionalColumn ? 'MISTO' : regionalKey,      
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type || 'unknown',
      totalColumns: parsed.headers.length,
      columns: parsed.headers,
      uploadedAt: new Date().toISOString()
    };

    const updateProgress = (progressInfo) => {
      const progress = progressInfo.progress ?? 0;
      progressFill.style.width = `${70 + (progress * 0.3)}%`;

      if (progressInfo.retrying) {
        progressText.textContent = `(${regionalKey}) Retry (${progressInfo.retryCount})... ${progressInfo.nextRetryIn}s`;
        progressText.style.color = 'var(--warning)';
      } else {
        progressText.textContent =
          `(${regionalKey}) Batch ${progressInfo.batch}/${progressInfo.totalBatches}... ` +
          `(${progressInfo.saved}/${progressInfo.total} - ${progress}%)`;
        progressText.style.color = '';
      }
    };

    const saveResult = await DataService.saveData(parsed.data, metadata, updateProgress);

    if (saveResult.success) {
      progressFill.style.width = '100%';
      progressText.textContent = `Concluído! (${regionalKey})`;

      uploadResult.className = 'upload-result success';
      uploadResult.innerHTML = `
        <strong>✓ Upload realizado com sucesso!</strong><br>
        Regional: ${regionalKey}<br>
        Arquivo: ${file.name}<br>
        Registros processados: ${saveResult.count}<br>
        Colunas: ${parsed.headers.length}
      `;
      uploadResult.style.display = 'block';

      showToast(`Upload concluído (${regionalKey}): ${saveResult.count} registro(s).`, 'success');

      // limpar input
      const input = document.getElementById(`fileInput_${uiKey}`);
      if (input) input.value = '';

      // recarregar histórico dessa regional
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

    showToast(`Erro (${regionalKey}): ${error.message}`, 'error');
  }
}

/**
 * Excluir upload (recarrega apenas a regional correta)
 */
async function handleDeleteUpload(uploadId, fileName, regionalKey, uiKey) {
  const confirmMessage =
    `Tem certeza que deseja excluir a planilha "${fileName}"?\n\n` +
    `Regional: ${regionalKey}\n\n` +
    `⚠️ Esta ação não pode ser desfeita.\n\nDeseja continuar?`;

  if (!confirm(confirmMessage)) return;

  const historyContainer = document.getElementById(`uploadHistory_${uiKey}`);
  if (!historyContainer) {
    showToast(`Container de histórico (${regionalKey}) não encontrado.`, 'error');
    return;
  }

  const originalContent = historyContainer.innerHTML;

  historyContainer.innerHTML = `
    <div class="loading-spinner">
      <i class="fas fa-spinner fa-spin"></i>
      <p>Excluindo "${fileName}" (${regionalKey})...</p>
    </div>
  `;

  try {
    const result = await DataService.deleteUpload(uploadId);

    if (result.success) {
      const msg = result.deletedCount > 0
        ? `✅ Excluída! ${result.deletedCount} registro(s) removido(s).`
        : `✅ Referência removida. (Nenhum registro encontrado)`;

      showToast(`${msg} (${regionalKey})`, 'success');
      setTimeout(() => loadUploadHistory(regionalKey, uiKey), 1000);
    } else {
      showToast(`Erro ao excluir (${regionalKey}): ${result.error || 'Erro desconhecido'}`, 'error');
      setTimeout(() => {
        historyContainer.innerHTML = originalContent;
        loadUploadHistory(regionalKey, uiKey);
      }, 1200);
    }
  } catch (error) {
    console.error('[ADMIN] Erro inesperado ao excluir:', error);
    showToast(`Erro inesperado (${regionalKey}): ${error.message}`, 'error');

    setTimeout(() => {
      historyContainer.innerHTML = originalContent;
      loadUploadHistory(regionalKey, uiKey);
    }, 1200);
  }
}

/**
 * Carregar histórico por regional
 */
async function loadUploadHistory(regionalKey, uiKey) {
  const historyContainer = document.getElementById(`uploadHistory_${uiKey}`);
  if (!historyContainer) return;

  historyContainer.innerHTML =
    '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Carregando histórico...</div>';

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
          <p>Regional: ${regionalKey}</p>
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
 * Limpeza completa (usa DataService.clearAllData)
 */
async function handleClearAll() {
  const firstConfirm = confirm(
    '⚠️ ATENÇÃO: LIMPEZA COMPLETA DO BANCO DE DADOS\n\n' +
    'Esta ação irá deletar TODOS os dados (todas as regionais).\n\n' +
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