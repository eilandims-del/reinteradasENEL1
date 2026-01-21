/**
 * Configuração do Firebase
 * Substitua as credenciais abaixo pelas suas do Firebase Console
 */

// TODO: Configure suas credenciais do Firebase
const firebaseConfig = {
    apiKey: "AIzaSyBjJLveyhydYG8Tpr_OT794W8xWfy2SNck",
    authDomain: "rett-ff48d.firebaseapp.com",
    projectId: "rett-ff48d",
    storageBucket: "rett-ff48d.firebasestorage.app",
    messagingSenderId: "769230640017",
    appId: "1:769230640017:web:b445c5f49a2dbc456d0030",
    measurementId: "G-QW9MQWEQ6G"
  };

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);

// Exportar serviços
export const auth = firebase.auth();
export const db = firebase.firestore();

