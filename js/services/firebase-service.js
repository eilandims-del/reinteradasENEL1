/**
 * Serviços Firebase - Autenticação e Firestore
 */

import { auth, db } from '../firebase-config.js';

/**
 * Serviço de Autenticação
 */
export class AuthService {
    /**
     * Fazer login com email e senha
     */
    static async login(email, senha) {
        try {
            const userCredential = await auth.signInWithEmailAndPassword(email, senha);
            return {
                success: true,
                user: userCredential.user
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Fazer logout
     */
    static async logout() {
        try {
            await auth.signOut();
            return { success: true };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Verificar se usuário está autenticado
     */
    static getCurrentUser() {
        return auth.currentUser;
    }

    /**
     * Observar mudanças no estado de autenticação
     */
    static onAuthStateChanged(callback) {
        return auth.onAuthStateChanged(callback);
    }
}

/**
 * Serviço de Dados - Firestore
 */
export class DataService {
    static COLLECTION_NAME = 'reinteradas';
    static UPLOADS_COLLECTION = 'uploads';

    /**
     * Salvar dados processados no Firestore
     */
    static async saveData(data, metadata = {}) {
        try {
            const timestamp = firebase.firestore.FieldValue.serverTimestamp();

            // Limitar batch a 500 documentos (limite do Firestore)
            const batchLimit = 500;
            let currentBatch = db.batch();
            let batchCount = 0;

            for (let i = 0; i < data.length; i++) {
                const item = data[i];
                const docRef = db.collection(this.COLLECTION_NAME).doc();
                
                // Manter DATA como string ISO (YYYY-MM-DD) para facilitar filtros
                // Não converter para Timestamp, manter como string para filtros mais simples
                const itemData = { ...item };
                // DATA já deve estar no formato ISO (YYYY-MM-DD) após parseDate
                // Manter como string para facilitar filtros no cliente

                currentBatch.set(docRef, {
                    ...itemData,
                    createdAt: timestamp,
                    uploadId: metadata.uploadId || null
                });

                batchCount++;

                // Se atingir o limite ou for o último item, commitar e criar novo batch
                if (batchCount >= batchLimit || i === data.length - 1) {
                    await currentBatch.commit();
                    if (i < data.length - 1) {
                        currentBatch = db.batch();
                        batchCount = 0;
                    }
                }
            }

            // Salvar metadata do upload
            if (metadata.uploadId) {
                await db.collection(this.UPLOADS_COLLECTION).doc(metadata.uploadId).set({
                    ...metadata,
                    totalRecords: data.length,
                    uploadedAt: timestamp,
                    uploadedBy: auth.currentUser?.email || 'unknown'
                });
            }

            return { success: true, count: data.length };
        } catch (error) {
            console.error('Erro ao salvar dados:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Buscar todos os dados
     * Nota: Filtros de data são aplicados no cliente para maior flexibilidade
     */
    static async getData(filters = {}) {
        try {
            let query = db.collection(this.COLLECTION_NAME).orderBy('DATA', 'desc');

            const snapshot = await query.get();
            const data = [];

            snapshot.forEach(doc => {
                const docData = doc.data();
                
                // Converter Timestamp do Firestore para string ISO se necessário
                if (docData.DATA) {
                    if (docData.DATA.toDate && typeof docData.DATA.toDate === 'function') {
                        // É Timestamp do Firestore
                        const date = docData.DATA.toDate();
                        docData.DATA = date.toISOString().split('T')[0];
                    } else if (docData.DATA instanceof Date) {
                        // É objeto Date
                        docData.DATA = docData.DATA.toISOString().split('T')[0];
                    } else if (typeof docData.DATA === 'string') {
                        // Já é string, garantir formato ISO
                        if (!/^\d{4}-\d{2}-\d{2}$/.test(docData.DATA)) {
                            // Tentar converter para ISO
                            const parsed = new Date(docData.DATA);
                            if (!isNaN(parsed.getTime())) {
                                docData.DATA = parsed.toISOString().split('T')[0];
                            }
                        }
                    }
                }
                
                data.push({
                    id: doc.id,
                    ...docData
                });
            });

            return { success: true, data };
        } catch (error) {
            console.error('Erro ao buscar dados:', error);
            // Se erro de índice, tenta sem orderBy
            try {
                const snapshot = await db.collection(this.COLLECTION_NAME).get();
                const data = [];

                snapshot.forEach(doc => {
                    const docData = doc.data();
                    
                    // Converter Timestamp do Firestore para string ISO se necessário
                    if (docData.DATA) {
                        if (docData.DATA.toDate && typeof docData.DATA.toDate === 'function') {
                            // É Timestamp do Firestore
                            const date = docData.DATA.toDate();
                            docData.DATA = date.toISOString().split('T')[0];
                        } else if (docData.DATA instanceof Date) {
                            // É objeto Date
                            docData.DATA = docData.DATA.toISOString().split('T')[0];
                        } else if (typeof docData.DATA === 'string') {
                            // Já é string, garantir formato ISO
                            if (!/^\d{4}-\d{2}-\d{2}$/.test(docData.DATA)) {
                                // Tentar converter para ISO
                                const parsed = new Date(docData.DATA);
                                if (!isNaN(parsed.getTime())) {
                                    docData.DATA = parsed.toISOString().split('T')[0];
                                }
                            }
                        }
                    }
                    
                    data.push({
                        id: doc.id,
                        ...docData
                    });
                });

                return { success: true, data };
            } catch (retryError) {
                return {
                    success: false,
                    error: retryError.message,
                    data: []
                };
            }
        }
    }

    /**
     * Buscar histórico de uploads
     */
    static async getUploadHistory() {
        try {
            const snapshot = await db.collection(this.UPLOADS_COLLECTION)
                .orderBy('uploadedAt', 'desc')
                .limit(20)
                .get();

            const history = [];
            snapshot.forEach(doc => {
                history.push({
                    id: doc.id,
                    ...doc.data()
                });
            });

            return { success: true, history };
        } catch (error) {
            console.error('Erro ao buscar histórico:', error);
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
        return db.collection(this.UPLOADS_COLLECTION).doc().id;
    }

    /**
     * Excluir dados de um upload específico
     * Implementação robusta com verificação e fallback
     */
    static async deleteUpload(uploadId) {
        if (!uploadId) {
            return {
                success: false,
                error: 'UploadId não fornecido'
            };
        }

        console.log('[DELETE] Iniciando exclusão do upload:', uploadId);

        try {
            let snapshot;
            let queryMethod = 'indexed';

            // Tentar buscar usando query com índice (método preferido)
            try {
                snapshot = await db.collection(this.COLLECTION_NAME)
                    .where('uploadId', '==', uploadId)
                    .get();
                console.log('[DELETE] Query indexada encontrou:', snapshot.size, 'registros');
            } catch (queryError) {
                // Se a query falhar (provavelmente falta de índice), usar fallback
                console.warn('[DELETE] Query indexada falhou, usando método alternativo:', queryError.message);
                
                // Fallback: Buscar todos os registros e filtrar no cliente
                // ATENÇÃO: Isso pode ser lento para grandes volumes
                const allSnapshot = await db.collection(this.COLLECTION_NAME).get();
                const filteredDocs = [];
                
                allSnapshot.forEach(doc => {
                    const data = doc.data();
                    if (data.uploadId === uploadId) {
                        filteredDocs.push(doc);
                    }
                });

                // Criar um QuerySnapshot simulado
                snapshot = {
                    size: filteredDocs.length,
                    empty: filteredDocs.length === 0,
                    forEach: (callback) => {
                        filteredDocs.forEach(callback);
                    },
                    docs: filteredDocs
                };

                queryMethod = 'fallback';
                console.log('[DELETE] Método alternativo encontrou:', snapshot.size, 'registros');
            }

            // Verificar se há registros para excluir
            if (snapshot.empty || snapshot.size === 0) {
                console.log('[DELETE] Nenhum registro encontrado para uploadId:', uploadId);
                
                // Mesmo sem registros, deletar o registro do upload (limpeza)
                try {
                    await db.collection(this.UPLOADS_COLLECTION).doc(uploadId).delete();
                    console.log('[DELETE] Registro de upload removido da coleção uploads');
                } catch (deleteError) {
                    console.warn('[DELETE] Erro ao remover registro de upload:', deleteError.message);
                }

                return {
                    success: true,
                    deletedCount: 0,
                    method: queryMethod
                };
            }

            // Processar exclusão em batches
            const batchLimit = 500;
            let deletedCount = 0;
            const batches = [];
            let currentBatch = db.batch();
            let batchCount = 0;
            let docIndex = 0;

            snapshot.forEach((doc) => {
                currentBatch.delete(doc.ref);
                batchCount++;
                deletedCount++;
                docIndex++;

                // Se atingir o limite ou for o último item, adicionar ao array de batches
                if (batchCount >= batchLimit || docIndex === snapshot.size) {
                    batches.push(currentBatch);
                    if (docIndex < snapshot.size) {
                        currentBatch = db.batch();
                        batchCount = 0;
                    }
                }
            });

            console.log('[DELETE] Preparados', batches.length, 'batches para excluir', deletedCount, 'registros');

            // Executar todos os batches sequencialmente (mais seguro)
            for (let i = 0; i < batches.length; i++) {
                await batches[i].commit();
                console.log(`[DELETE] Batch ${i + 1}/${batches.length} commitado`);
            }

            // Verificar se a exclusão foi bem-sucedida
            // Aguardar um pouco para garantir propagação
            await new Promise(resolve => setTimeout(resolve, 500));

            // Verificar se ainda existem registros (verificação opcional)
            let verificationSnapshot;
            try {
                verificationSnapshot = await db.collection(this.COLLECTION_NAME)
                    .where('uploadId', '==', uploadId)
                    .limit(1)
                    .get();
            } catch (e) {
                // Se a verificação falhar (falta de índice), pular
                verificationSnapshot = { size: 0 };
            }

            if (verificationSnapshot.size > 0) {
                console.warn('[DELETE] AVISO: Ainda existem', verificationSnapshot.size, 'registros após exclusão');
                return {
                    success: false,
                    error: `Exclusão parcial: ${verificationSnapshot.size} registros ainda existem`,
                    deletedCount: deletedCount,
                    remainingCount: verificationSnapshot.size
                };
            }

            // Deletar o registro do upload na coleção uploads
            try {
                await db.collection(this.UPLOADS_COLLECTION).doc(uploadId).delete();
                console.log('[DELETE] Registro de upload removido da coleção uploads');
            } catch (deleteError) {
                console.warn('[DELETE] Erro ao remover registro de upload:', deleteError.message);
                // Não falhar a operação se apenas o registro de upload não for deletado
            }

            console.log('[DELETE] Exclusão concluída com sucesso:', deletedCount, 'registros removidos');

            return {
                success: true,
                deletedCount: deletedCount,
                method: queryMethod
            };

        } catch (error) {
            console.error('[DELETE] Erro ao excluir upload:', error);
            console.error('[DELETE] Stack trace:', error.stack);
            
            return {
                success: false,
                error: error.message,
                errorCode: error.code || 'UNKNOWN',
                deletedCount: 0
            };
        }
    }
}

