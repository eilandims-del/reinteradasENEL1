// js/login.js
import { AuthService } from './services/firebase-service.js';

const ROLE_KEY = 'enel_role_selected'; // "ADMIN" | "INSPETOR"
const DEFAULT_ROLE = 'INSPETOR';

// destinos
const ROUTE = {
  ADMIN: 'admin.html',
  INSPETOR: 'inspetor.html'
};

function $(id){ return document.getElementById(id); }

function setError(msg) {
  const el = $('loginError');
  if (!el) return;
  if (!msg) {
    el.textContent = '';
    el.classList.remove('show');
    return;
  }
  el.textContent = msg;
  el.classList.add('show');
}

function setRole(role) {
  const r = (role === 'ADMIN' || role === 'INSPETOR') ? role : DEFAULT_ROLE;
  localStorage.setItem(ROLE_KEY, r);

  const btnA = $('roleAdmin');
  const btnI = $('roleInspetor');

  if (btnA) {
    btnA.classList.toggle('active', r === 'ADMIN');
    btnA.setAttribute('aria-pressed', String(r === 'ADMIN'));
  }
  if (btnI) {
    btnI.classList.toggle('active', r === 'INSPETOR');
    btnI.setAttribute('aria-pressed', String(r === 'INSPETOR'));
  }

  setError('');
}

function getRole() {
  const r = (localStorage.getItem(ROLE_KEY) || '').toUpperCase().trim();
  return (r === 'ADMIN' || r === 'INSPETOR') ? r : DEFAULT_ROLE;
}

function redirectByRole(role) {
  const dest = ROUTE[role] || ROUTE[DEFAULT_ROLE];
  window.location.href = dest;
}

async function autoRedirectIfLoggedIn() {
  // Se já tiver autenticado, manda direto para o painel do perfil selecionado
  AuthService.onAuthStateChanged((user) => {
    if (user) {
      const role = getRole();
      redirectByRole(role);
    }
  });
}

function initUI() {
  setRole(getRole());

  $('roleAdmin')?.addEventListener('click', () => setRole('ADMIN'));
  $('roleInspetor')?.addEventListener('click', () => setRole('INSPETOR'));

  $('btnLimpar')?.addEventListener('click', () => {
    $('email').value = '';
    $('senha').value = '';
    $('email')?.focus();
    setError('');
  });

  $('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    setError('');

    const email = String($('email')?.value || '').trim();
    const senha = String($('senha')?.value || '').trim();
    const role = getRole();

    if (!role) {
      setError('Selecione um perfil (ADMIN ou INSPETOR).');
      return;
    }
    if (!email || !senha) {
      setError('Informe e-mail e senha.');
      return;
    }

    // trava botão
    const btn = $('btnEntrar');
    const oldTxt = btn?.textContent;
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Entrando...';
    }

    const res = await AuthService.login(email, senha);

    if (btn) {
      btn.disabled = false;
      btn.textContent = oldTxt || 'Entrar';
    }

    if (!res?.success) {
      setError(res?.error || 'Falha ao fazer login. Verifique as credenciais.');
      return;
    }

    redirectByRole(role);
  });
}

function init(){
  initUI();
  autoRedirectIfLoggedIn();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}