/**
 * Serviços Firebase - MODULAR (Auth + Firestore)
 */

import { auth, db } from "../firebase-config.js";

import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* =========================
   Serviço de Autenticação
========================= */
export class AuthService {
  static async login(email, senha) {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, senha);
      return { success: true, user: userCredential.user };
    } catch (error) {
      return { success: false, error: error?.message || String(error) };
    }
  }

  static async logout() {
    try {
      await signOut(auth);
      return { success: true };
    } catch (error) {
      return { success: false, error: error?.message || String(error) };
    }
  }

  static getCurrentUser() {
    return auth.currentUser;
  }

  static onAuthStateChanged(callback) {
    return onAuthStateChanged(auth, callback);
  }
}

/* =========================
   Serviço de Dados - Firestore
========================= */
export class DataService {
  static COLLECTION_NAME = "reinteradas";
  static UPLOADS_COLLECTION = "uploads";

  static REGIONAIS = {
    ATLANTICO: "ATLANTICO",
    NORTE: "NORTE",
    CENTRO_NORTE: "CENTRO NORTE"
  };

  static normalizeRegional(value) {
    const raw = String(value ?? '')
      .trim()
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  
    // remove tudo que não for letra/número e junta
    // ex: "C. NORTE", "C .NORTE", "C-NORTE" => "CNORTE"
    const compact = raw.replace(/[^A-Z0-9]/g, '');
  
    // ✅ TODOS
    if (compact === 'TODOS' || compact === 'TODAS') return 'TODOS';
  
    // ✅ CENTRO NORTE (todas variações)
    // "CNORTE", "CNORTE", "CENTRONORTE", "CNORTECE" (se alguém inventar) -> ajuste se precisar
    if (compact === 'CNORTE' || compact === 'CENTRONORTE') return 'CENTRO NORTE';
  
    // ✅ NORTE
    if (compact === 'NORTE') return 'NORTE';
  
    // ✅ ATLANTICO
    if (compact === 'ATLANTICO') return 'ATLANTICO';
  
    return '';
  }
  
  static sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  static generateUploadId() {
    // id local (sem gravar nada)
    return doc(collection(db, this.UPLOADS_COLLECTION)).id;
  }
/* =========================
   SAVE DATA (com REGIONAL por LINHA ou por ÁREA)
========================= */
static async saveData(data, metadata = {}, progressCallback = null) {
  try {
    const uploadId = metadata.uploadId;

    // regional padrão (vinda do box) — pode ser vazia no modo “misto”
    const fallbackRegional = this.normalizeRegional(metadata.regional || metadata.REGIONAL);

    if (!uploadId) throw new Error("uploadId é obrigatório");
    if (!Array.isArray(data)) throw new Error("data precisa ser um array");

    // --- helper: acha REGIONAL (ou ÁREA) na linha
const pickRegionalFromRow = (row) => {
  if (!row || typeof row !== 'object') return '';

  // tenta direto
  const direct =
    row['ÁREA'] ?? row['AREA'] ?? row.AREA ?? row.area ??
    row['REGIONAL'] ?? row.REGIONAL ?? row.regional;

  const r1 = this.normalizeRegional(direct);
  if (r1) return r1;

  // varre chaves procurando "AREA" ou "REGIONAL" (normalizando o nome da coluna)
  const keys = Object.keys(row);

  const normKey = (k) => String(k ?? '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\./g, '')
    .replace(/\s+/g, '');

  const kArea = keys.find(k => normKey(k) === 'AREA');
  if (kArea != null) {
    const r2 = this.normalizeRegional(row[kArea]);
    if (r2) return r2;
  }

  const kReg = keys.find(k => normKey(k) === 'REGIONAL');
  if (kReg != null) {
    const r3 = this.normalizeRegional(row[kReg]);
    if (r3) return r3;
  }

  return '';
};



    // validação: precisa existir regional em pelo menos um lugar
    if (!fallbackRegional) {
      const hasAnyRowRegional = (data || []).some((row) => !!pickRegionalFromRow(row));
      if (!hasAnyRowRegional) {
        throw new Error('REGIONAL é obrigatória: inclua a coluna "ÁREA" (ou "REGIONAL") na planilha.');
      }
    }

    const BATCH_SIZE = 200;
    const THROTTLE_MS = 900;

    const MAX_RETRIES = 8;
    const INITIAL_BACKOFF_MS = 2000;

    let totalSaved = 0;
    const totalBatches = Math.ceil(data.length / BATCH_SIZE);

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const startIndex = batchIndex * BATCH_SIZE;
      const endIndex = Math.min(startIndex + BATCH_SIZE, data.length);
      const batchData = data.slice(startIndex, endIndex);

      let retryCount = 0;
      let batchSuccess = false;

      while (!batchSuccess && retryCount < MAX_RETRIES) {
        try {
          const batch = writeBatch(db);

          batchData.forEach((item, index) => {
            const rowIndex = startIndex + index;
            const docId = `${uploadId}_${rowIndex}`;
            const ref = doc(db, this.COLLECTION_NAME, docId);

          // ✅ regional por linha (se existir) senão cai no fallback do box
          const rowRegional = pickRegionalFromRow(item);
          const finalRegional = rowRegional || fallbackRegional;

          // se não achou em lugar nenhum, aí sim não salva (evita contaminar)
          if (!finalRegional) return;

          batch.set(ref, {
            ...item,
            REGIONAL: finalRegional,
            regional: finalRegional,
            uploadId,
            rowIndex,
            createdAt: serverTimestamp()
          }, { merge: true });
          });

          await batch.commit();

          totalSaved += batchData.length;
          batchSuccess = true;

          if (progressCallback) {
            progressCallback({
              batch: batchIndex + 1,
              totalBatches,
              saved: totalSaved,
              total: data.length,
              progress: Math.round((totalSaved / data.length) * 100),
              retrying: false,
              retryCount: 0,
              nextRetryIn: 0
            });
          }
        } catch (error) {
          retryCount++;
          const delay = Math.min(INITIAL_BACKOFF_MS * Math.pow(2, retryCount), 60000);

          if (progressCallback) {
            progressCallback({
              batch: batchIndex + 1,
              totalBatches,
              saved: totalSaved,
              total: data.length,
              progress: Math.round((totalSaved / data.length) * 100),
              retrying: true,
              retryCount,
              nextRetryIn: Math.round(delay / 1000)
            });
          }

          await this.sleep(delay);
          if (retryCount >= MAX_RETRIES) throw error;
        }
      }

      if (batchIndex < totalBatches - 1) {
        await this.sleep(THROTTLE_MS);
      }
    }

    // histórico do upload
    await setDoc(
      doc(db, this.UPLOADS_COLLECTION, uploadId),
      {
        ...metadata,
        REGIONAL: fallbackRegional || "MISTO",
        regional: fallbackRegional || "MISTO",
        totalRecords: data.length,
        uploadedAt: serverTimestamp(),
        uploadedBy: auth.currentUser?.email || "unknown"
      },
      { merge: true }
    );

    return { success: true, count: totalSaved };
  } catch (error) {
    console.error("[UPLOAD]", error);
    return { success: false, error: error?.message || String(error) };
  }
}


  /* =========================
     GET DATA (REGIONAL + DATA)
     DATA: "YYYY-MM-DD"
  ========================= */
  static async getData(filters = {}) {
    try {
      const regional = this.normalizeRegional(filters.regional);
      const di = String(filters.dataInicial || "").trim();
      const df = String(filters.dataFinal || "").trim();
  
      const colRef = collection(db, this.COLLECTION_NAME);
  
      // ✅ TODOS: não filtra REGIONAL
      if (regional === 'TODOS') {
        const clauses = [];
        if (di) clauses.push(where("DATA", ">=", di));
        if (df) clauses.push(where("DATA", "<=", df));
  
        const qAll = query(colRef, ...clauses, orderBy("DATA", "desc"), limit(5000));
        const snap = await getDocs(qAll);
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        return { success: true, data };
      }
  
      // ✅ Regional específica (como já era)
      if (!regional) return { success: true, data: [] };
  
      const clauses = [where("REGIONAL", "==", regional)];
      if (di) clauses.push(where("DATA", ">=", di));
      if (df) clauses.push(where("DATA", "<=", df));
  
      const q1 = query(colRef, ...clauses, orderBy("DATA", "desc"), limit(5000));
      const snap = await getDocs(q1);
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  
      return { success: true, data };
    } catch (error) {
      console.error("[GET DATA]", error);
      return { success: false, error: error?.message || String(error), data: [] };
    }
  }

  /* =========================
     GET UPLOAD HISTORY (REGIONAL)
     fallback se faltar índice
  ========================= */
  static async getUploadHistory(regional = null) {
    try {
      const reg = this.normalizeRegional(regional);
      const colRef = collection(db, this.UPLOADS_COLLECTION);

      if (!reg) {
        const q = query(colRef, orderBy("uploadedAt", "desc"), limit(5000));
        const snap = await getDocs(q);
        const history = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        return { success: true, history };
      }

      // tenta com orderBy
      try {
        const q = query(colRef, where("REGIONAL", "==", reg), orderBy("uploadedAt", "desc"), limit(5000));
        const snap = await getDocs(q);
        const history = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        return { success: true, history };
      } catch {
        // fallback sem orderBy
        const q2 = query(colRef, where("REGIONAL", "==", reg), limit(5000));
        const snap2 = await getDocs(q2);
        const history = snap2.docs.map((d) => ({ id: d.id, ...d.data() }));

        history.sort((a, b) => {
          const ta = a.uploadedAt?.toMillis?.() || 0;
          const tb = b.uploadedAt?.toMillis?.() || 0;
          return tb - ta;
        });

        return { success: true, history };
      }
    } catch (error) {
      console.error("[UPLOAD HISTORY]", error);
      return { success: false, error: error?.message || String(error), history: [] };
    }
  }

  /* =========================
     DELETE UPLOAD
========================= */
  static async deleteUpload(uploadId) {
    try {
      const id = String(uploadId || "").trim();
      if (!id) throw new Error("uploadId inválido");

      let deletedCount = 0;

      // apaga reinteradas por uploadId em lotes
      while (true) {
        const q = query(
          collection(db, this.COLLECTION_NAME),
          where("uploadId", "==", id),
          limit(450)
        );

        const snap = await getDocs(q);
        if (snap.empty) break;

        const batch = writeBatch(db);
        snap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();

        deletedCount += snap.size;
        await this.sleep(250);
      }

      // apaga doc de histórico
      await deleteDoc(doc(db, this.UPLOADS_COLLECTION, id));

      return { success: true, deletedCount };
    } catch (error) {
      console.error("[DELETE UPLOAD]", error);
      return { success: false, error: error?.message || String(error), deletedCount: 0 };
    }
  }

  /* =========================
     CLEAR ALL DATA
========================= */
  static async clearAllData() {
    try {
      let deletedData = 0;
      let deletedUploads = 0;

      // reinteradas
      while (true) {
        const q = query(collection(db, this.COLLECTION_NAME), limit(450));
        const snap = await getDocs(q);
        if (snap.empty) break;

        const batch = writeBatch(db);
        snap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();

        deletedData += snap.size;
        await this.sleep(300);
      }

      // uploads
      while (true) {
        const q = query(collection(db, this.UPLOADS_COLLECTION), limit(450));
        const snap = await getDocs(q);
        if (snap.empty) break;

        const batch = writeBatch(db);
        snap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();

        deletedUploads += snap.size;
        await this.sleep(300);
      }

      return { success: true, deletedData, deletedUploads };
    } catch (error) {
      console.error("[CLEAR ALL]", error);
      return { success: false, error: error?.message || String(error) };
    }
  }
}
