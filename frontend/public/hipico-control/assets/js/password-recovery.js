import { CLOUD_CONFIG } from './config.js';
import { escapeHtml, toast } from './ui.js';

let recoveryAccessToken = '';
let recoveryError = '';
let recoveryNoticeShown = false;

function authHeaders(token = '') {
  return {
    apikey: CLOUD_CONFIG.publishableKey,
    Authorization: `Bearer ${token || CLOUD_CONFIG.publishableKey}`,
    'Content-Type': 'application/json'
  };
}

function cleanAppUrl() {
  const url = new URL(location.href);
  url.hash = '';
  url.searchParams.delete('error');
  url.searchParams.delete('error_code');
  url.searchParams.delete('error_description');
  return url;
}

function recoveryRedirectUrl() {
  const url = new URL('./', location.href);
  url.hash = '';
  url.search = '';
  return url.toString();
}

function readRecoveryContext() {
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  const type = String(hash.get('type') || '').toLowerCase();
  const token = String(hash.get('access_token') || '');
  const hashError = String(hash.get('error_description') || hash.get('error') || '');
  const query = new URLSearchParams(location.search);
  const queryError = String(query.get('error_description') || query.get('error') || '');

  if (type === 'recovery' && token) {
    recoveryAccessToken = token;
    history.replaceState(history.state, '', cleanAppUrl().toString());
    return;
  }

  recoveryError = hashError || queryError;
  if (recoveryError) history.replaceState(history.state, '', cleanAppUrl().toString());
}

async function parseError(response) {
  try {
    const body = await response.json();
    return String(body?.msg || body?.message || body?.error_description || body?.error || `Error ${response.status}`);
  } catch {
    return `Error ${response.status}`;
  }
}

export async function requestPasswordRecovery(email) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) throw new Error('Escribe un correo válido.');
  if (!CLOUD_CONFIG?.supabaseUrl || !CLOUD_CONFIG?.publishableKey) throw new Error('La recuperación no está configurada en este despliegue.');

  const response = await fetch(
    `${CLOUD_CONFIG.supabaseUrl}/auth/v1/recover?redirect_to=${encodeURIComponent(recoveryRedirectUrl())}`,
    {
      method: 'POST',
      headers: authHeaders(),
      cache: 'no-store',
      body: JSON.stringify({ email: normalizedEmail })
    }
  );

  if (!response.ok) {
    const error = new Error(await parseError(response));
    error.status = response.status;
    throw error;
  }

  return true;
}

export async function updateRecoveredPassword(password) {
  const nextPassword = String(password || '');
  if (nextPassword.length < 10) throw new Error('La nueva contraseña debe tener al menos 10 caracteres.');
  if (!recoveryAccessToken) throw new Error('El enlace de recuperación no es válido o ya venció.');

  const response = await fetch(`${CLOUD_CONFIG.supabaseUrl}/auth/v1/user`, {
    method: 'PUT',
    headers: authHeaders(recoveryAccessToken),
    cache: 'no-store',
    body: JSON.stringify({ password: nextPassword })
  });

  if (!response.ok) {
    const error = new Error(await parseError(response));
    error.status = response.status;
    throw error;
  }

  recoveryAccessToken = '';
  return true;
}

function recoveryFormMarkup() {
  return `<main class="auth-screen" data-password-recovery>
    <section class="auth-card soft-auth auth-card--recovery">
      <div class="auth-panel auth-panel--recovery">
        <div class="auth-lock" aria-hidden="true">🔐</div>
        <h2>Crear nueva contraseña</h2>
        <p>El enlace fue validado. Elige una contraseña nueva para tu cuenta de Control Hípico.</p>
        <form id="password-recovery-form" class="form">
          <div class="field">
            <label for="recovery-password">Nueva contraseña</label>
            <input id="recovery-password" class="input" name="password" type="password" minlength="10" autocomplete="new-password" required>
          </div>
          <div class="field">
            <label for="recovery-confirm">Confirmar contraseña</label>
            <input id="recovery-confirm" class="input" name="confirm" type="password" minlength="10" autocomplete="new-password" required>
          </div>
          <button class="button button--primary button--xl" type="submit">Guardar nueva contraseña</button>
          <button class="button button--ghost" type="button" data-action="cancel-password-recovery">Cancelar</button>
        </form>
      </div>
    </section>
  </main>`;
}

function recoverySuccessMarkup() {
  return `<main class="auth-screen" data-password-recovery-success>
    <section class="auth-card soft-auth auth-card--recovery">
      <div class="auth-panel auth-panel--recovery">
        <div class="auth-lock" aria-hidden="true">✓</div>
        <h2>Contraseña actualizada</h2>
        <p>Ya puedes iniciar sesión con tu nueva contraseña.</p>
        <button class="button button--primary button--xl" type="button" data-action="finish-password-recovery">Volver al acceso</button>
      </div>
    </section>
  </main>`;
}

function renderRecoveryIfNeeded() {
  if (!recoveryAccessToken) return false;
  const root = document.querySelector('#app');
  if (!root) return false;
  if (!root.querySelector('[data-password-recovery]')) root.innerHTML = recoveryFormMarkup();
  return true;
}

function decorateAuth() {
  if (renderRecoveryIfNeeded()) return;

  const form = document.querySelector('#auth-form');
  if (form && !form.querySelector('[data-action="recover-password"]')) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button button--ghost auth-recovery-action';
    button.dataset.action = 'recover-password';
    button.textContent = '¿Olvidaste tu contraseña?';
    form.append(button);
  }

  if (recoveryError && !recoveryNoticeShown && form) {
    recoveryNoticeShown = true;
    toast('El enlace de recuperación no es válido o venció. Solicita uno nuevo.', 'warning', { title: 'Recuperación de acceso' });
  }
}

async function handleRecoveryRequest(button) {
  const form = button.closest('#auth-form');
  const emailInput = form?.querySelector('input[name="email"]');
  const email = String(emailInput?.value || '').trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    toast('Escribe primero el correo de tu cuenta.', 'warning', { title: 'Recuperar acceso' });
    emailInput?.focus();
    return;
  }

  button.disabled = true;
  const original = button.textContent;
  button.textContent = 'Enviando…';
  try {
    await requestPasswordRecovery(email);
    toast(
      'Si el correo pertenece a una cuenta válida, recibirás un enlace para crear una contraseña nueva.',
      'success',
      { title: 'Revisa tu correo', duration: 6500 }
    );
  } catch (error) {
    const rateLimited = Number(error?.status) === 429;
    toast(
      rateLimited ? 'Se alcanzó el límite temporal de envíos. Intenta nuevamente más tarde.' : 'No se pudo solicitar la recuperación. Verifica la conexión e inténtalo de nuevo.',
      'error',
      { title: 'Recuperación no enviada' }
    );
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

async function handleNewPassword(form) {
  const data = new FormData(form);
  const password = String(data.get('password') || '');
  const confirm = String(data.get('confirm') || '');
  if (password.length < 10) {
    toast('Usa al menos 10 caracteres.', 'warning', { title: 'Contraseña demasiado corta' });
    return;
  }
  if (password !== confirm) {
    toast('Las contraseñas no coinciden.', 'warning', { title: 'Revisa la confirmación' });
    return;
  }

  const submit = form.querySelector('button[type="submit"]');
  if (submit) submit.disabled = true;
  try {
    await updateRecoveredPassword(password);
    history.replaceState(history.state, '', cleanAppUrl().toString());
    const root = document.querySelector('#app');
    if (root) root.innerHTML = recoverySuccessMarkup();
  } catch (error) {
    const expired = [401, 403].includes(Number(error?.status));
    toast(
      expired ? 'El enlace venció o ya fue utilizado. Solicita uno nuevo.' : 'No se pudo actualizar la contraseña. Inténtalo nuevamente.',
      'error',
      { title: 'No se cambió la contraseña' }
    );
  } finally {
    if (submit) submit.disabled = false;
  }
}

readRecoveryContext();

document.addEventListener('click', (event) => {
  const target = event.target.closest?.('[data-action]');
  if (!target) return;
  if (target.dataset.action === 'recover-password') {
    event.preventDefault();
    handleRecoveryRequest(target);
  }
  if (target.dataset.action === 'cancel-password-recovery' || target.dataset.action === 'finish-password-recovery') {
    event.preventDefault();
    recoveryAccessToken = '';
    const url = cleanAppUrl();
    url.hash = '';
    location.replace(url.toString());
  }
});

document.addEventListener('submit', (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || form.id !== 'password-recovery-form') return;
  event.preventDefault();
  handleNewPassword(form);
});

const appRoot = document.querySelector('#app');
if (appRoot) {
  new MutationObserver(decorateAuth).observe(appRoot, { childList: true, subtree: true });
}

decorateAuth();

export const __test__ = Object.freeze({
  cleanAppUrl,
  recoveryRedirectUrl,
  readRecoveryContext
});
