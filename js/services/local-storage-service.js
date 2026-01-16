/**
 * Serviço de Armazenamento Local - Para testes sem Firebase
 * Simula o comportamento do Firestore usando localStorage/IndexedDB
 */

/**
 * Serviço de Dados Local (simula Firestore)
 */
export class LocalDataService {
    static COLLECTION_NAME = 'reinteradas';
    static UPLOADS_COLLECTION = 'uploads';
    static STORAGE_KEY = 'enel_reinteradas_data';
    static UPLOADS_KEY = 'enel_reinteradas_uploads';

    /**
     * Inicializar armazenamento
     */
    static init() {
        if (!localStorage.getItem(this.STORAGE_KEY)) {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify([]));
        }
        if (!localStorage.getItem(this.UPLOADS_KEY)) {
            localStorage.setItem(this.UPLOADS_KEY, JSON.stringify([]));
        }
        console.log('[LOCAL] Armazenamento local inicializado');
    }

    /**
     * Gerar ID único
     */
    static generateId() {
        return 'local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Salvar dados (simula saveData do Firestore)
     */
    static async saveData(data, metadata = {}, progressCallback = null) {
        try {
            this.init();
            const uploadId = metadata.uploadId || this.generateId();
            
            if (!uploadId) {
                throw new Error('uploadId é obrigatório');
            }

            const BATCH_SIZE = 200;
            const THROTTLE_MS = 100; // Mais rápido localmente
            let totalSaved = 0;
            const totalBatches = Math.ceil(data.length / BATCH_SIZE);

            console.log(`[LOCAL UPLOAD] Iniciando upload de ${data.length} registros em ${totalBatches} batches`);

            // Carregar dados existentes
            const existingData = JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '[]');
            const dataMap = new Map();
            existingData.forEach(item => {
                dataMap.set(item.id, item);
            });

            // Processar em batches (simulado)
            for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
                const startIndex = batchIndex * BATCH_SIZE;
                const endIndex = Math.min(startIndex + BATCH_SIZE, data.length);
                const batchData = data.slice(startIndex, endIndex);

                // Adicionar ao map (simula batch commit)
                batchData.forEach((item, index) => {
                    const rowIndex = startIndex + index;
                    const docId = `${uploadId}_${rowIndex}`;
                    
                    const itemData = {
                        id: docId,
                        ...item,
                        createdAt: new Date().toISOString(),
                        uploadId: uploadId,
                        rowIndex: rowIndex
                    };
                    
                    dataMap.set(docId, itemData);
                });

                totalSaved += batchData.length;
                const progress = Math.round((totalSaved / data.length) * 100);
                
                console.log(`[LOCAL UPLOAD] Batch ${batchIndex + 1}/${totalBatches} processado: ${batchData.length} registros (${totalSaved}/${data.length} - ${progress}%)`);

                if (progressCallback) {
                    progressCallback({
                        batch: batchIndex + 1,
                        totalBatches: totalBatches,
                        saved: totalSaved,
                        total: data.length,
                        progress: progress
                    });
                }

                // Throttling simulado (muito menor localmente)
                if (batchIndex < totalBatches - 1) {
                    await this.sleep(THROTTLE_MS);
                }
            }

            // Salvar no localStorage
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(Array.from(dataMap.values())));

            // Salvar metadata do upload
            const uploads = JSON.parse(localStorage.getItem(this.UPLOADS_KEY) || '[]');
            const uploadIndex = uploads.findIndex(u => u.id === uploadId);
            const uploadData = {
                id: uploadId,
                ...metadata,
                totalRecords: data.length,
                uploadedAt: new Date().toISOString(),
                uploadedBy: 'local_user',
                lastUpdated: new Date().toISOString()
            };

            if (uploadIndex >= 0) {
                uploads[uploadIndex] = uploadData;
            } else {
                uploads.push(uploadData);
            }

            localStorage.setItem(this.UPLOADS_KEY, JSON.stringify(uploads));

            console.log(`[LOCAL UPLOAD] Upload concluído: ${totalSaved} registros salvos`);
            return { success: true, count: totalSaved };

        } catch (error) {
            console.error('[LOCAL UPLOAD] Erro ao salvar dados:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Buscar todos os dados (simula getData do Firestore)
     */
    static async getData(filters = {}) {
        try {
            this.init();
            const data = JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '[]');
            
            // Ordenar por DATA (descendente)
            data.sort((a, b) => {
                const dateA = a.DATA || '';
                const dateB = b.DATA || '';
                return dateB.localeCompare(dateA);
            });

            console.log(`[LOCAL] Carregados ${data.length} registros do armazenamento local`);
            return { success: true, data };

        } catch (error) {
            console.error('[LOCAL] Erro ao buscar dados:', error);
            return {
                success: false,
                error: error.message,
                data: []
            };
        }
    }

    /**
     * Buscar histórico de uploads
     */
    static async getUploadHistory() {
        try {
            this.init();
            const uploads = JSON.parse(localStorage.getItem(this.UPLOADS_KEY) || '[]');
            
            // Ordenar por data (mais recente primeiro)
            uploads.sort((a, b) => {
                const dateA = new Date(a.uploadedAt || 0);
                const dateB = new Date(b.uploadedAt || 0);
                return dateB - dateA;
            });

            // Converter uploadedAt para formato compatível (simula Timestamp)
            const history = uploads.map(upload => ({
                ...upload,
                uploadedAt: {
                    toDate: () => new Date(upload.uploadedAt)
                }
            }));

            return { success: true, history };

        } catch (error) {
            console.error('[LOCAL] Erro ao buscar histórico:', error);
            return {
                success: false,
                error: error.message,
                history: []
            };
        }
    }

    /**
     * Gerar ID único para upload
     */
    static generateUploadId() {
        return this.generateId();
    }

    /**
     * Excluir dados de um upload específico
     */
    static async deleteUpload(uploadId) {
        try {
            this.init();
            
            // Carregar dados
            const data = JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '[]');
            const uploads = JSON.parse(localStorage.getItem(this.UPLOADS_KEY) || '[]');

            // Filtrar dados a serem removidos
            const beforeCount = data.length;
            const filteredData = data.filter(item => item.uploadId !== uploadId);
            const deletedCount = beforeCount - filteredData.length;

            // Remover upload do histórico
            const filteredUploads = uploads.filter(u => u.id !== uploadId);

            // Salvar
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filteredData));
            localStorage.setItem(this.UPLOADS_KEY, JSON.stringify(filteredUploads));

            console.log(`[LOCAL DELETE] Removidos ${deletedCount} registros do upload ${uploadId}`);

            return {
                success: true,
                deletedCount: deletedCount
            };

        } catch (error) {
            console.error('[LOCAL DELETE] Erro ao excluir upload:', error);
            return {
                success: false,
                error: error.message,
                deletedCount: 0
            };
        }
    }

    /**
     * Limpar TODOS os dados
     */
    static async clearAllData() {
        try {
            this.init();
            
            const data = JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '[]');
            const uploads = JSON.parse(localStorage.getItem(this.UPLOADS_KEY) || '[]');

            const totalDeleted = data.length + uploads.length;

            // Limpar tudo
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify([]));
            localStorage.setItem(this.UPLOADS_KEY, JSON.stringify([]));

            console.log(`[LOCAL CLEAR] Limpeza completa: ${totalDeleted} documentos removidos`);

            return {
                success: true,
                deletedCount: totalDeleted,
                reinteradas: data.length,
                uploads: uploads.length
            };

        } catch (error) {
            console.error('[LOCAL CLEAR] Erro na limpeza:', error);
            return {
                success: false,
                error: error.message,
                deletedCount: 0
            };
        }
    }

    /**
     * Helper: Sleep
     */
    static sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

/**
 * Serviço de Autenticação Local (simula AuthService)
 */
export class LocalAuthService {
    static getCurrentUser() {
        // Sempre retorna usuário "local" para testes
        return {
            email: 'local@test.com',
            uid: 'local_user'
        };
    }

    static async login(email, senha) {
        // Aceita qualquer credencial para testes locais
        return {
            success: true,
            user: this.getCurrentUser()
        };
    }

    static async logout() {
        return { success: true };
    }

    static onAuthStateChanged(callback) {
        // Simula usuário sempre logado
        callback(this.getCurrentUser());
        return () => {}; // unsubscribe function
    }
}
