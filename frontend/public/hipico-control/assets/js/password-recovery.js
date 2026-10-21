import { CLOUD_CONFIG } from './config.js';
import { signOut } from './supabase.js';
import { toast } from './ui.js';

let recoveryAccessToken = '';
let recoveryError = '';
let recoveryNoticeShown = false;
// A disabled submit button alone does not prevent scripted/queued double submissions.
let recoveryUpdateInFlight = false;
// A request can outlive a click or lose network connectivity. Prevent duplicate emails.
let recoveryRequestInFlight = false;

// Query parameters can be logged by hosting intermediaries. Strip any
// recovery/session material from the visible URL on the first app render,
// including invalid or unexpected callbacks; never reflect token values.
const RECOVERY_URL_PARAMS = Object.freeze([
  'access_token', 'refresh_token', 'provider_token', 'provider_refresh_token',
  'token', 'token_hash', 'code', 'type', 'expires_in', 'expires_at',
  'error', 'error_code', 'error_description'
]);

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
  for (const key of RECOVERY_URL_PARAMS) url.searchParams.delete(key);
  return url;
}
function recoveryRedirectUrl() {
  const url = new URL('./', location.href);
  url.hash = '';
  url.search = '';
  return url.toString();
}
function readRecoveryContext() {
  // Never retain a token from an earlier callback when a subsequent link is invalid.
  recoveryAccessToken = '';
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  const type = String(hash.get('type') || '').toLowerCase();
  const token = String(hash.get('access_token') || '');
  const query = new URLSearchParams(location.search);
  // Even an invalid link can contain sensitive material. Clean it before
  // exposing the login screen and show a generic recovery error.
  const hadAuthMaterial = RECOVERY_URL_PARAMS.some(key => hash.has(key) || query.has(key));
  if (hadAuthMaterial) history.replaceState(history.state, '', cleanAppUrl().toString());
  // A contradictory callback (success token plus provider error) is not
  // authorized recovery. Never activate its token even if type=recovery.
  // Presence of any provider error field vetoes the token, even if its value
  // is empty. A contradictory callback must fail closed.
  const providerHasError = ['error', 'error_description', 'error_code']
    .some(key => hash.has(key) || query.has(key));
  if (type === 'recovery' && token && !providerHasError) {
    recoveryAccessToken = token;
    recoveryError = '';
    return;
  }
  // Error descriptions may carry identities, secrets or arbitrary provider text.
  // Store only a generic classification, never raw callback strings.
  recoveryError = providerHasError || hadAuthMaterial ? 'INVALID_RECOVERY_LINK' : '';
}
// Provider errors may contain emails, tokens or internal details. Never copy their
// messages into an Error retained by the PWA; only the status class is needed.
async function parseError(response) {
  return Number(response?.status) === 429 ? 'RECOVERY_RATE_LIMITED' : 'RECOVERY_PROVIDER_UNAVAILABLE';
}
export async function requestPasswordRecovery(email) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) throw new Error('Escribe un correo válido.');
  if (!CLOUD_CONFIG?.supabaseUrl || !CLOUD_CONFIG?.publishableKey) throw new Error('La recuperación no está configurada en este despliegue.');
  if (recoveryRequestInFlight) throw new Error('RECOVERY_ALREADY_IN_PROGRESS');
  recoveryRequestInFlight = true;
  const controller = new AbortController();
  const timeoutMs = Math.min(30000, Math.max(1000, Number(CLOUD_CONFIG.requestTimeoutMs) || 15000));
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${CLOUD_CONFIG.supabaseUrl}/auth/v1/recover?redirect_to=${encodeURIComponent(recoveryRedirectUrl())}`, {
      method: 'POST', headers: authHeaders(), cache: 'no-store', signal: controller.signal,
      body: JSON.stringify({ email: normalizedEmail })
    });
    if (!response.ok) {
      const error = new Error(await parseError(response));
      error.status = response.status;
      throw error;
    }
    return true;
  } catch (error) {
    // Do not retain or reflect network/provider descriptions that may contain PII.
    if (error?.status) throw error;
    throw new Error('RECOVERY_PROVIDER_UNAVAILABLE');
  } finally {
    clearTimeout(timeout);
    recoveryRequestInFlight = false;
  }
}
async function markCredentialChanged(token) {
  const response = await fetch(`${CLOUD_CONFIG.supabaseUrl}/rest/v1/rpc/hipico_mark_password_changed`, {
    method: 'POST', headers: authHeaders(token), cache: 'no-store', body: '{}'
  });
  if (!response.ok && ![404, 406].includes(response.status)) console.warn('No se pudo sincronizar el estado no secreto de la credencial.');
}
export async function updateRecoveredPassword(password) {
  const nextPassword = String(password || '');
  if (nextPassword.length < 10) throw new Error('La nueva contraseña debe tener al menos 10 caracteres.');
  if (!recoveryAccessToken) throw new Error('El enlace de recuperación no es válido o ya venció.');
  if (recoveryUpdateInFlight) throw new Error('RECOVERY_ALREADY_IN_PROGRESS');
  recoveryUpdateInFlight = true;
  const token = recoveryAccessToken;
  try {
    // Password recovery is a reauthentication boundary. Clear any regular PWA
    // session before changing the credential so a still-valid cached JWT cannot
    // silently reopen Control Hípico after the reset.
    await signOut();

    const response = await fetch(`${CLOUD_CONFIG.supabaseUrl}/auth/v1/user`, {
      method: 'PUT', headers: authHeaders(token), cache: 'no-store', body: JSON.stringify({ password: nextPassword })
    });
    if (!response.ok) {
      const error = new Error(await parseError(response));
      error.status = response.status;
      if ([401, 403].includes(response.status)) recoveryAccessToken = '';
      throw error;
    }
    // One successful PUT consumes the recovery capability. A later optional
    // profile-state RPC failure must never allow a second password change.
    recoveryAccessToken = '';
    await markCredentialChanged(token).catch(() => {});
    return true;
  } finally {
    recoveryUpdateInFlight = false;
  }
}
function passwordScore(value) {
  const text = String(value || '');
  let score = 0;
  if (text.length >= 10) score += 1;
  if (text.length >= 14) score += 1;
  if (/[a-z]/.test(text) && /[A-Z]/.test(text)) score += 1;
  if (/\d/.test(text)) score += 1;
  if (/[^A-Za-z0-9]/.test(text)) score += 1;
  return Math.min(5, score);
}
function recoveryFormMarkup() {
  return `<main class="auth-screen" data-password-recovery><section class="auth-card auth-card--recovery"><div class="auth-panel auth-panel--recovery"><div class="auth-lock" aria-hidden="true">🔐</div><h2>Crear nueva contraseña</h2><p>El enlace fue validado. La contraseña se guardará únicamente en Supabase Auth como credencial protegida; Control Hípico no almacena ni muestra su valor.</p><form id="password-recovery-form" class="form"><div class="field"><label for="recovery-password">Nueva contraseña</label><input id="recovery-password" class="input" name="password" type="password" minlength="10" autocomplete="new-password" required aria-describedby="password-strength-copy"><div class="password-strength" data-password-strength data-level="weak"><div class="password-strength__bar"><i></i></div><small id="password-strength-copy">Mínimo 10 caracteres. Una frase larga es más fácil de recordar y más resistente.</small></div></div><div class="field"><label for="recovery-confirm">Confirmar contraseña</label><input id="recovery-confirm" class="input" name="confirm" type="password" minlength="10" autocomplete="new-password" required></div><button class="button button--primary button--xl" type="submit">Guardar nueva contraseña</button><button class="button button--ghost" type="button" data-action="cancel-password-recovery">Cancelar</button></form></div></section></main>`;
}
function recoverySuccessMarkup() {
  return `<main class="auth-screen" data-password-recovery-success><section class="auth-card auth-card--recovery"><div class="auth-panel auth-panel--recovery"><div class="auth-lock" aria-hidden="true">✓</div><h2>Contraseña actualizada</h2><p>La credencial quedó actualizada en Supabase Auth. Ya puedes iniciar sesión con la nueva contraseña.</p><button class="button button--primary button--xl" type="button" data-action="finish-password-recovery">Volver al acceso</button></div></section></main>`;
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
function updateStrength(input) {
  const box = input.closest('.field')?.querySelector('[data-password-strength]');
  if (!box) return;
  const score = passwordScore(input.value);
  const percent = `${Math.max(8, score * 20)}%`;
  box.style.setProperty('--password-strength', percent);
  box.dataset.level = score >= 4 ? 'good' : 'weak';
  const copy = box.querySelector('small');
  if (copy) copy.textContent = score >= 4 ? 'Buena longitud y variedad. Evita reutilizar esta contraseña en otros servicios.' : 'Usa al menos 10 caracteres; una frase larga con números o símbolos mejora la resistencia.';
}
async function handleRecoveryRequest(button) {
  if (recoveryRequestInFlight) return;
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
    toast('Si el correo pertenece a una cuenta válida, recibirás un enlace para crear una contraseña nueva.', 'success', { title: 'Revisa tu correo', duration: 6500 });
  } catch (error) {
    const rateLimited = Number(error?.status) === 429;
    toast(rateLimited ? 'Se alcanzó el límite temporal de envíos. Intenta nuevamente más tarde.' : 'No se pudo solicitar la recuperación. Verifica la conexión e inténtalo de nuevo.', 'error', { title: 'Recuperación no enviada' });
  } finally { button.disabled = false; button.textContent = original; }
}
async function handleNewPassword(form) {
  if (recoveryUpdateInFlight) return;
  const data = new FormData(form);
  const password = String(data.get('password') || '');
  const confirm = String(data.get('confirm') || '');
  if (password.length < 10) { toast('Usa al menos 10 caracteres.', 'warning', { title: 'Contraseña demasiado corta' }); return; }
  if (password !== confirm) { toast('Las contraseñas no coinciden.', 'warning', { title: 'Revisa la confirmación' }); return; }
  const submit = form.querySelector('button[type="submit"]');
  if (submit) submit.disabled = true;
  try {
    await updateRecoveredPassword(password);
    history.replaceState(history.state, '', cleanAppUrl().toString());
    const root = document.querySelector('#app');
    if (root) root.innerHTML = recoverySuccessMarkup();
  } catch (error) {
    const expired = [401, 403].includes(Number(error?.status));
    toast(expired ? 'El enlace venció o ya fue utilizado. Solicita uno nuevo.' : 'No se pudo actualizar la contraseña. Inténtalo nuevamente.', 'error', { title: 'No se cambió la contraseña' });
  } finally { if (submit) submit.disabled = false; }
}

readRecoveryContext();
document.addEventListener('click', (event) => {
  const target = event.target.closest?.('[data-action]');
  if (!target) return;
  if (target.dataset.action === 'recover-password') { event.preventDefault(); handleRecoveryRequest(target); }
  if (target.dataset.action === 'cancel-password-recovery' || target.dataset.action === 'finish-password-recovery') {
    event.preventDefault(); recoveryAccessToken = ''; const url = cleanAppUrl(); url.hash = ''; location.replace(url.toString());
  }
});
document.addEventListener('input', (event) => { if (event.target?.id === 'recovery-password') updateStrength(event.target); });
document.addEventListener('submit', (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || form.id !== 'password-recovery-form') return;
  event.preventDefault(); handleNewPassword(form);
});
const appRoot = document.querySelector('#app');
if (appRoot) new MutationObserver(decorateAuth).observe(appRoot, { childList: true, subtree: true });
decorateAuth();

export const __test__ = Object.freeze({ cleanAppUrl, recoveryRedirectUrl, readRecoveryContext, passwordScore });
