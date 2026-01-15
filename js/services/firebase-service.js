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
}

