/**
 * Script do Painel Administrativo
 */

import { AuthService, DataService } from './services/firebase-service.js';
import { db } from './firebase-config.js';
import { parseFile } from './utils/file-parser.js';
import { showToast } from './utils/helpers.js';

let currentUser = null;

/**
 * Inicializar painel administrativo
 */
function init() {
    initEventListeners();
    checkAuthState();
}

/**
 * Verificar estado de autenticação
 */
function checkAuthState() {
    AuthService.onAuthStateChanged((user) => {
        currentUser = user;
        
        if (user) {
            showAdminSection();
            loadUploadHistory();
        } else {
            showLoginSection();
        }
    });
}

/**
 * Mostrar seção de login
 */
function showLoginSection() {
    document.getElementById('loginSection').style.display = 'block';
    document.getElementById('adminSection').style.display = 'none';
    document.getElementById('logoutBtn').style.display = 'none';
}

/**
 * Mostrar seção administrativa
 */
function showAdminSection() {
    document.getElementById('loginSection').style.display = 'none';
    document.getElementById('adminSection').style.display = 'block';
    document.getElementById('logoutBtn').style.display = 'block';
}

/**
 * Inicializar event listeners
 */
function initEventListeners() {
    // Login form
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await handleLogin();
        });
    }

    // Logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await handleLogout();
        });
    }

    // Limpeza completa
    const btnClearAll = document.getElementById('btnClearAll');
    if (btnClearAll) {
        btnClearAll.addEventListener('click', async () => {
            await handleClearAll();
        });
    }

    // File input
    const fileInput = document.getElementById('fileInput');
    const dropZone = document.getElementById('dropZone');

    if (dropZone) {
        dropZone.addEventListener('click', () => {
            fileInput?.click();
        });

        // Drag and drop
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
            if (files.length > 0) {
                await handleFileUpload(files[0]);
            }
        });
    }

    if (fileInput) {
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                await handleFileUpload(file);
            }
        });
    }
}

/**
 * Manipular login
 */
async function handleLogin() {
    const email = document.getElementById('email').value;
    const senha = document.getElementById('senha').value;
    const errorDiv = document.getElementById('loginError');

    const result = await AuthService.login(email, senha);

    if (result.success) {
        errorDiv.classList.remove('show');
        errorDiv.textContent = '';
        showToast('Login realizado com sucesso!', 'success');
    } else {
        errorDiv.textContent = result.error || 'Erro ao fazer login';
        errorDiv.classList.add('show');
        showToast('Erro ao fazer login. Verifique suas credenciais.', 'error');
    }
}

/**
 * Manipular logout
 */
async function handleLogout() {
    const result = await AuthService.logout();
    
    if (result.success) {
        showToast('Logout realizado com sucesso!', 'success');
        showLoginSection();
    }
}

/**
 * Manipular upload de arquivo
 */
async function handleFileUpload(file) {
    const uploadProgress = document.getElementById('uploadProgress');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    const uploadResult = document.getElementById('uploadResult');
    const dropZone = document.getElementById('dropZone');

    // Verificar se usuário está autenticado
    if (!currentUser) {
        showToast('Você precisa estar logado para fazer upload.', 'error');
        return;
    }

    // Mostrar progresso
    uploadProgress.style.display = 'block';
    uploadResult.style.display = 'none';
    progressFill.style.width = '10%';
    progressText.textContent = 'Lendo arquivo...';

    try {
        // Parsear arquivo
        progressFill.style.width = '30%';
        progressText.textContent = 'Processando arquivo...';

        const parsed = await parseFile(file);
        
        progressFill.style.width = '50%';
        progressText.textContent = 'Validando dados...';

        // Gerar ID único do upload (spreadsheetId)
        const uploadId = DataService.generateUploadId();
        console.log('[UPLOAD] UploadId gerado:', uploadId);
        console.log('[UPLOAD] Total de registros para salvar:', parsed.data.length);

        progressFill.style.width = '70%';
        progressText.textContent = 'Salvando no banco de dados...';

        // Preparar metadata com uploadId garantido
        const metadata = {
            uploadId: uploadId, // ID único obrigatório
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type || 'unknown',
            totalColumns: parsed.headers.length,
            columns: parsed.headers,
            uploadedAt: new Date().toISOString()
        };

        // Callback de progresso para atualizar UI
        const updateProgress = (progressInfo) => {
            const progress = progressInfo.progress;
            progressFill.style.width = `${70 + (progress * 0.3)}%`; // 70% a 100%
            
            // Mensagem diferente se estiver em retry
            if (progressInfo.retrying) {
                progressText.textContent = `Aguardando retry (tentativa ${progressInfo.retryCount})... Próximo em ${progressInfo.nextRetryIn}s`;
                progressText.style.color = 'var(--warning)';
            } else {
                progressText.textContent = `Salvando batch ${progressInfo.batch}/${progressInfo.totalBatches}... (${progressInfo.saved}/${progressInfo.total} registros - ${progress}%)`;
                progressText.style.color = '';
            }
            
            // Log adicional para debug
            if (progressInfo.batch % 5 === 0 || progressInfo.batch === progressInfo.totalBatches) {
                console.log(`[UPLOAD UI] Progresso: ${progress}% - Batch ${progressInfo.batch}/${progressInfo.totalBatches}`);
            }
        };

        // Salvar no Firestore com callback de progresso
        const saveResult = await DataService.saveData(parsed.data, metadata, updateProgress);
        
        console.log('[UPLOAD] Resultado do save:', saveResult);
        
        // Verificação pós-upload será feita automaticamente pelo sistema
        // O uploadId está garantido no metadata e será salvo em todos os registros

        if (saveResult.success) {
            progressFill.style.width = '100%';
            progressText.textContent = 'Concluído!';
            
            uploadResult.className = 'upload-result success';
            uploadResult.innerHTML = `
                <strong>✓ Upload realizado com sucesso!</strong><br>
                Arquivo: ${file.name}<br>
                Registros processados: ${saveResult.count}<br>
                Colunas: ${parsed.headers.length}
            `;
            uploadResult.style.display = 'block';

            showToast(`Upload concluído: ${saveResult.count} registro(s) processado(s).`, 'success');

            // Limpar input
            document.getElementById('fileInput').value = '';

            // Recarregar histórico
            setTimeout(() => {
                loadUploadHistory();
                uploadProgress.style.display = 'none';
            }, 2000);
        } else {
            throw new Error(saveResult.error || 'Erro ao salvar dados');
        }

    } catch (error) {
        console.error('Erro no upload:', error);
        
        uploadResult.className = 'upload-result error';
        uploadResult.innerHTML = `
            <strong>✗ Erro no upload:</strong><br>
            ${error.message}
        `;
        uploadResult.style.display = 'block';
        uploadProgress.style.display = 'none';

        showToast(`Erro: ${error.message}`, 'error');
    }
}

/**
 * Manipular exclusão de upload
 * Implementação robusta com verificações e feedback detalhado
 */
async function handleDeleteUpload(uploadId, fileName) {
    // Confirmar exclusão
    const confirmMessage = `Tem certeza que deseja excluir a planilha "${fileName}"?\n\n⚠️ ATENÇÃO:\n- Esta ação não pode ser desfeita\n- Todos os registros relacionados serão removidos permanentemente do Firebase\n- Os rankings serão atualizados automaticamente\n\nDeseja continuar?`;
    
    if (!confirm(confirmMessage)) {
        return;
    }

    // Mostrar loading com mensagem detalhada
    const historyContainer = document.getElementById('uploadHistory');
    const originalContent = historyContainer.innerHTML;
    historyContainer.innerHTML = `
        <div class="loading-spinner">
            <i class="fas fa-spinner fa-spin"></i> 
            <p>Excluindo planilha "${fileName}"...</p>
            <p style="font-size: 0.9rem; color: var(--medium-gray); margin-top: 0.5rem;">
                Isso pode levar alguns segundos dependendo do tamanho dos dados.
            </p>
        </div>
    `;

    try {
        console.log('[ADMIN] Iniciando exclusão de upload:', uploadId, fileName);
        
        const result = await DataService.deleteUpload(uploadId);

        if (result.success) {
            const message = result.deletedCount > 0 
                ? `✅ Planilha excluída com sucesso! ${result.deletedCount} registro(s) removido(s) permanentemente do Firebase.`
                : `✅ Referência da planilha removida. (Nenhum registro encontrado no banco)`;
            
            showToast(message, 'success');
            console.log('[ADMIN] Exclusão bem-sucedida:', result);
            
            // Recarregar histórico após 1.5 segundos para garantir propagação
            setTimeout(() => {
                loadUploadHistory();
            }, 1500);
            
            // Forçar recarregamento da página principal se estiver aberta
            // (Nota: Isso só funciona se estiver na mesma origem)
            if (window.opener) {
                window.opener.location.reload();
            }
        } else {
            const errorMessage = result.error || 'Erro desconhecido ao excluir';
            const detailedMessage = result.errorCode 
                ? `Erro (${result.errorCode}): ${errorMessage}`
                : `Erro: ${errorMessage}`;
            
            showToast(detailedMessage, 'error');
            console.error('[ADMIN] Erro na exclusão:', result);
            
            // Se foi exclusão parcial, avisar o usuário
            if (result.remainingCount && result.remainingCount > 0) {
                const partialMessage = `⚠️ Exclusão parcial: ${result.deletedCount} removidos, mas ${result.remainingCount} ainda existem. Verifique as permissões do Firestore ou recarregue a página.`;
                alert(partialMessage);
            }
            
            // Restaurar conteúdo original
            setTimeout(() => {
                historyContainer.innerHTML = originalContent;
                // Reanexar eventos
                loadUploadHistory();
            }, 2000);
        }
    } catch (error) {
        console.error('[ADMIN] Erro inesperado ao excluir upload:', error);
        showToast(`Erro inesperado: ${error.message}`, 'error');
        
        // Restaurar conteúdo original
        setTimeout(() => {
            historyContainer.innerHTML = originalContent;
            loadUploadHistory();
        }, 2000);
    }
}

/**
 * Manipular limpeza completa do banco
 * ⚠️ FUNÇÃO DESTRUTIVA - Remove TODOS os dados
 */
async function handleClearAll() {
    // Confirmação dupla (muito perigoso)
    const firstConfirm = confirm(
        '⚠️ ATENÇÃO: LIMPEZA COMPLETA DO BANCO DE DADOS\n\n' +
        'Esta ação irá:\n' +
        '• Deletar TODOS os registros da coleção "reinteradas"\n' +
        '• Deletar TODOS os registros da coleção "uploads"\n' +
        '• Esta ação NÃO PODE SER DESFEITA\n\n' +
        'Tem CERTEZA ABSOLUTA que deseja continuar?'
    );

    if (!firstConfirm) {
        return;
    }

    // Segunda confirmação
    const secondConfirm = confirm(
        '⚠️ ÚLTIMA CONFIRMAÇÃO\n\n' +
        'Digite "CONFIRMAR" no próximo prompt para prosseguir.\n\n' +
        'Esta ação é IRREVERSÍVEL!'
    );

    if (!secondConfirm) {
        return;
    }

    const typedConfirm = prompt(
        'Digite "CONFIRMAR" (em maiúsculas) para executar a limpeza completa:'
    );

    if (typedConfirm !== 'CONFIRMAR') {
        showToast('Limpeza cancelada. Você não digitou "CONFIRMAR" corretamente.', 'error');
        return;
    }

    // Mostrar loading
    const historyContainer = document.getElementById('uploadHistory');
    const originalContent = historyContainer.innerHTML;
    historyContainer.innerHTML = `
        <div class="loading-spinner">
            <i class="fas fa-spinner fa-spin"></i> 
            <p><strong>Limpando TODOS os dados do banco...</strong></p>
            <p style="font-size: 0.9rem; color: var(--medium-gray); margin-top: 0.5rem;">
                ⚠️ Isso pode levar VÁRIOS MINUTOS dependendo do volume de dados.<br>
                O sistema está configurado para evitar quota exceeded, então pode ser lento mas seguro.
            </p>
            <p style="font-size: 0.85rem; color: var(--warning); margin-top: 0.5rem; font-weight: 600;">
                ⏱️ Aguarde... Não feche esta página!
            </p>
        </div>
    `;

    try {
        console.log('[ADMIN] Iniciando limpeza completa do banco...');
        
        const result = await DataService.clearAllData();

        if (result.success) {
            const message = `✅ Limpeza completa realizada!\n\n` +
                `• Reinteradas: ${result.reinteradas || 0} documentos removidos\n` +
                `• Uploads: ${result.uploads || 0} documentos removidos\n` +
                `• Total: ${result.deletedCount || 0} documentos removidos`;
            
            alert(message);
            showToast('Limpeza completa realizada com sucesso!', 'success');
            console.log('[ADMIN] Limpeza completa bem-sucedida:', result);
            
            // Recarregar histórico após 2 segundos
            setTimeout(() => {
                loadUploadHistory();
            }, 2000);
        } else {
            const errorMessage = result.error || 'Erro desconhecido';
            const partialMessage = result.deletedCount > 0
                ? `⚠️ Limpeza parcial:\n\n` +
                  `• Removidos: ${result.deletedCount} documentos\n` +
                  `• Reinteradas: ${result.reinteradas || 0}\n` +
                  `• Uploads: ${result.uploads || 0}\n\n` +
                  `Erro: ${errorMessage}`
                : `❌ Erro na limpeza: ${errorMessage}`;
            
            alert(partialMessage);
            showToast(`Erro: ${errorMessage}`, 'error');
            console.error('[ADMIN] Erro na limpeza completa:', result);
            
            // Recarregar histórico mesmo em caso de erro parcial
            setTimeout(() => {
                loadUploadHistory();
            }, 2000);
        }
    } catch (error) {
        console.error('[ADMIN] Erro inesperado na limpeza completa:', error);
        showToast(`Erro inesperado: ${error.message}`, 'error');
        
        setTimeout(() => {
            historyContainer.innerHTML = originalContent;
            loadUploadHistory();
        }, 2000);
    }
}

/**
 * Carregar histórico de uploads
 */
async function loadUploadHistory() {
    const historyContainer = document.getElementById('uploadHistory');
    if (!historyContainer) return;

    historyContainer.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Carregando histórico...</div>';

    const result = await DataService.getUploadHistory();

    if (result.success && result.history.length > 0) {
        historyContainer.innerHTML = '';

        result.history.forEach(item => {
            const historyItem = document.createElement('div');
            historyItem.className = 'history-item';
            historyItem.dataset.uploadId = item.id;

            const date = item.uploadedAt?.toDate ? 
                item.uploadedAt.toDate().toLocaleString('pt-BR') : 
                'Data não disponível';

            const fileName = item.fileName || 'Arquivo sem nome';
            const uploadId = item.id;

            historyItem.innerHTML = `
                <div class="history-info">
                    <h3>${fileName}</h3>
                    <p>Upload em: ${date}</p>
                    <p>Por: ${item.uploadedBy || 'Desconhecido'}</p>
                </div>
                <div class="history-actions">
                    <span class="history-badge success">${item.totalRecords || 0} registros</span>
                    <button class="btn btn-danger btn-sm btn-delete-upload" data-upload-id="${uploadId}" title="Excluir esta planilha" type="button">
                        <i class="fas fa-trash"></i> Excluir
                    </button>
                </div>
            `;

            // Adicionar ao DOM primeiro
            historyContainer.appendChild(historyItem);

            // Depois adicionar evento de clique no botão de excluir
            const deleteBtn = historyItem.querySelector('.btn-delete-upload');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleDeleteUpload(uploadId, fileName);
                });
            } else {
                console.error('Botão de excluir não encontrado para:', uploadId, fileName);
            }
        });
    } else {
        historyContainer.innerHTML = '<p style="text-align: center; padding: 2rem; color: var(--medium-gray);">Nenhum upload realizado ainda.</p>';
    }
}

// Inicializar quando DOM estiver pronto
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

