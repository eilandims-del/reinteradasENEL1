// js/login.js
import { AuthService } from './services/firebase-service.js';
import { showToast } from './utils/helpers.js';

const ADMIN_TARGET = 'admin.html';
const INSPETOR_TARGET = 'inspetor.html';

// (opcional) lista simples para forçar rota admin, se quiser.
// Se vazio, a rota depende do perfil selecionado.
const ADMIN_EMAILS = new Set([
  // 'eneladmin@enel.com'
]);

function pickDefaultRole() {
  // padrão: INSPETOR
  return 'INSPETOR';
}

function setRoleUI(role) {
  document.querySelectorAll('.role-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.role === role);
  });
  document.body.dataset.role = role;
}

function getSelectedRole() {
  return document.body.dataset.role || pickDefaultRole();
}

function resolveTargetByEmail(email, selectedRole) {
  const e = String(email || '').trim().toLowerCase();
  if (ADMIN_EMAILS.has(e)) return ADMIN_TARGET;

  // heurística: se escolher ADMIN, vai admin.
  if (selectedRole === 'ADMIN') return ADMIN_TARGET;
  return INSPETOR_TARGET;
}

async function redirectIfLoggedIn() {
  const u = AuthService.getCurrentUser();
  if (!u) return;

  // se já logado, manda pro inspetor por padrão (ou admin se cair na lista)
  const target = resolveTargetByEmail(u.email, 'INSPETOR');
  window.location.href = target;
}

async function handleLogin(e) {
  e?.preventDefault();

  const email = document.getElementById('email')?.value || '';
  const senha = document.getElementById('senha')?.value || '';
  const errorDiv = document.getElementById('loginError');

  errorDiv?.classList.remove('show');
  if (errorDiv) errorDiv.textContent = '';

  const role = getSelectedRole();

  try {
    const result = await AuthService.login(email, senha);

    if (!result?.success) {
      const msg = result?.error || 'Erro ao fazer login';
      if (errorDiv) {
        errorDiv.textContent = msg;
        errorDiv.classList.add('show');
      }
      showToast('Erro ao fazer login. Verifique suas credenciais.', 'error');
      return;
    }

    showToast('Login realizado com sucesso!', 'success');

    const target = resolveTargetByEmail(email, role);
    window.location.href = target;
  } catch (err) {
    const msg = err?.message || String(err);
    if (errorDiv) {
      errorDiv.textContent = msg;
      errorDiv.classList.add('show');
    }
    showToast('Falha no login.', 'error');
  }
}

function init() {
  // role ui
  setRoleUI(pickDefaultRole());
  document.querySelectorAll('.role-btn').forEach(btn => {
    btn.addEventListener('click', () => setRoleUI(btn.dataset.role));
  });

  document.getElementById('loginForm')?.addEventListener('submit', handleLogin);

  // se já estiver logado, redireciona
  AuthService.onAuthStateChanged(() => {
    redirectIfLoggedIn();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
