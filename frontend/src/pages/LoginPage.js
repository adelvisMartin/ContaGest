import { AuthService } from '../services/authService.js';
import { BackendApi } from '../services/backendApi.js';
import { Field, Button } from '../components/ui/index.js';

function input({ name, label, type = 'text', value = '', autocomplete = '', required = true, placeholder = '' }) {
  return Field({ name, labelKey: label, type, value, required, placeholder, attrs: autocomplete ? `autocomplete="${autocomplete}"` : '' });
}

function captchaBlock(id) {
  return `<section class="login-captcha" data-captcha-box="${id}" aria-labelledby="captchaTitle-${id}">
    <input type="hidden" name="captchaToken" data-captcha-token>
    <header class="login-captcha-head">
      <span class="login-captcha-icon"><i class="fa-solid fa-shield-halved"></i></span>
      <div><strong id="captchaTitle-${id}">Verificación humana</strong><small>Reto firmado y temporal</small></div>
      <button type="button" class="login-captcha-refresh" data-captcha-refresh aria-label="Generar nuevo reto" title="Generar nuevo reto"><i class="fa-solid fa-rotate"></i></button>
    </header>
    <div class="login-captcha-body">
      <div class="login-captcha-question"><small>Resuelve</small><strong data-captcha-question>cargando…</strong></div>
      <label class="login-captcha-answer"><span>Resultado</span><input name="captchaAnswer" type="text" inputmode="numeric" autocomplete="off" pattern="-?[0-9]+" placeholder="Escribe el resultado" required></label>
    </div>
    <footer><span><i class="fa-solid fa-lock"></i> No se envía la respuesta dentro del token</span><span data-captcha-expiry>Válido por 5 minutos</span></footer>
  </section>`;
}

export const LoginPage = {
  standalone: true,
  render() {
    return `<main class="login-shell login-shell-v111">
      <section class="login-card">
        <button type="button" class="login-brand" data-route="login" aria-label="Ir al inicio de sesión"><div class="login-mark">C</div><div><h1>ContaGest-VE</h1><p>Enterprise ERP / CRM</p></div></button>
        <div class="login-copy"><h2>Acceso seguro al sistema</h2><p>Ingresa con las credenciales asignadas por el administrador de tu empresa.</p></div>

        <form id="loginForm" class="login-form" data-auth-panel="login">
          ${input({ name:'tenantRif', label:'RIF empresa', value:'', placeholder:'Ej: 00000000', autocomplete:'organization' })}
          ${input({ name:'email', label:'Correo electrónico', type:'email', value:'', placeholder:'usuario@empresa.com', autocomplete:'email' })}
          ${input({ name:'password', label:'Contraseña', type:'password', value:'', placeholder:'••••••••', autocomplete:'current-password' })}
          <details class="login-license-details">
            <summary><span><i class="fa-solid fa-key"></i> Acceso de cliente con licencia</span><small>Solo para credenciales de prueba o planes controlados</small></summary>
            <div class="login-license-body">
              ${input({ name:'licenseKey', label:'Clave de licencia', type:'password', value:'', required:false, placeholder:'CGVE-GYM-…', autocomplete:'off' })}
              <p><i class="fa-solid fa-building-shield"></i> La licencia debe coincidir con este RIF, el correo y el dispositivo actual.</p>
            </div>
          </details>
          ${captchaBlock('login')}
          ${Button({ label:'Entrar al sistema', iconName:'fa-arrow-right-to-bracket', variant:'primary', type:'submit', className:'w-full login-submit' })}
        </form>

        <details class="login-note login-tech-note">
          <summary>Acceso técnico / pruebas internas</summary>
          <div class="login-tech-body">
            <p>Usuario administrador local creado por seed:</p>
            <code>RIF: 00000000</code><br>
            <code>Email: admin@erp.local</code><br>
            <code>Clave: Adm1n$2026</code>
            <div class="mt-3 flex gap-2 flex-wrap">
              ${Button({ id:'btnFillAdmin', label:'Rellenar admin local', iconName:'fa-key', variant:'secondary', type:'button' })}
              ${Button({ id:'btnDemoLogin', label:'Entrar demo sin Supabase', iconName:'fa-flask', variant:'secondary', type:'button' })}
            </div>
            <p class="mt-3"><strong>Backend:</strong> <span id="loginApiUrl">${BackendApi.baseUrl}</span></p>
          </div>
        </details>
      </section>
      <section class="login-panel" aria-label="Resumen de plataforma">
        <div>
          <p class="pl-eyebrow">ERP empresarial</p>
          <h2>Operación, administración y verticales especializados en una sola plataforma.</h2>
          <ul>
            <li>Acceso por empresa, usuario, rol, licencia y dispositivo.</li>
            <li>Backend, Supabase, auditoría y aislamiento multitenant.</li>
            <li>Comercio, servicios, salud, veterinaria y gimnasios.</li>
            <li>Experiencia responsive para escritorio, tablet y móvil.</li>
          </ul>
        </div>
      </section>
    </main>`;
  },

  mount(_state, { Store, Toast, navigate, SupabaseSyncService }) {
    const failedKey = 'contagest_login_captcha_failures';
    const lockKey = 'contagest_login_captcha_locked_until';

    const captchaLocked = () => Number(localStorage.getItem(lockKey) || 0) > Date.now();
    const registerFailure = () => {
      const attempts = Number(localStorage.getItem(failedKey) || 0) + 1;
      localStorage.setItem(failedKey, String(attempts));
      if (attempts >= 3) {
        localStorage.setItem(lockKey, String(Date.now() + 60000));
        localStorage.setItem(failedKey, '0');
      }
    };
    const clearFailures = () => {
      localStorage.removeItem(failedKey);
      localStorage.removeItem(lockKey);
    };

    const loadCaptcha = async (form) => {
      if (!form) return;
      const question = form.querySelector('[data-captcha-question]');
      const token = form.querySelector('[data-captcha-token]');
      const answer = form.querySelector('[name="captchaAnswer"]');
      const expiry = form.querySelector('[data-captcha-expiry]');
      const box = form.querySelector('[data-captcha-box]');
      box?.classList.add('is-loading');
      try {
        const captcha = await AuthService.captcha();
        if (question) question.textContent = `${captcha.question} = ?`;
        if (question) question.setAttribute('aria-label', captcha.prompt || captcha.question);
        if (token) token.value = captcha.token;
        if (answer) { answer.value = ''; answer.removeAttribute('disabled'); }
        if (expiry) expiry.textContent = `Válido hasta ${new Date(captcha.expiresAt).toLocaleTimeString('es-VE', { hour:'2-digit', minute:'2-digit' })}`;
        box?.classList.remove('is-error');
      } catch {
        if (question) question.textContent = 'Servicio no disponible';
        if (answer) answer.setAttribute('disabled', 'disabled');
        box?.classList.add('is-error');
      } finally {
        box?.classList.remove('is-loading');
      }
    };

    const setSessionState = (session) => {
      const licenseMode = session.license?.businessSector;
      Store.set({
        route: 'dashboard',
        profile: {
          name: session.user?.fullName || session.user?.name || 'Usuario',
          email: session.user?.email || '',
          role: session.user?.role || 'admin',
          branch: session.tenant?.name || 'Empresa',
          plan: session.license?.plan || session.tenant?.plan || 'Enterprise',
          avatarDataUrl: Store.get().profile?.avatarDataUrl || ''
        },
        activeLicense: session.license || null,
        settings: {
          ...Store.get().settings,
          companyName: session.tenant?.name || Store.get().settings.companyName,
          companyRif: session.tenant?.rif || Store.get().settings.companyRif,
          ...(licenseMode ? { businessMode:licenseMode } : {})
        }
      });
    };

    const loginForm = document.getElementById('loginForm');
    loadCaptcha(loginForm);
    document.querySelectorAll('[data-captcha-refresh]').forEach((button) => {
      button.addEventListener('click', () => loadCaptcha(button.closest('form')));
    });

    document.getElementById('btnFillAdmin')?.addEventListener('click', () => {
      loginForm.querySelector('[name="tenantRif"]').value = '00000000';
      loginForm.querySelector('[name="email"]').value = 'admin@erp.local';
      loginForm.querySelector('[name="password"]').value = 'Adm1n$2026';
      loginForm.querySelector('[name="licenseKey"]').value = '';
      Toast.show('Credenciales administrativas cargadas.', 'success');
    });

    loginForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (captchaLocked()) {
        Toast.show('Verificación bloqueada temporalmente por intentos fallidos. Espera 1 minuto.', 'error');
        return;
      }
      const data = Object.fromEntries(new FormData(event.currentTarget));
      const submit = event.currentTarget.querySelector('[type="submit"]');
      submit?.setAttribute('disabled', 'disabled');
      try {
        const session = await AuthService.login({
          email:data.email,
          password:data.password,
          tenantRif:data.tenantRif,
          licenseKey:data.licenseKey,
          captchaToken:data.captchaToken,
          captchaAnswer:data.captchaAnswer,
          mode:'api'
        });
        clearFailures();
        setSessionState(session);
        Toast.show(session.license ? 'Licencia validada. Sesión iniciada.' : 'Sesión administrativa iniciada.', 'success');
        await SupabaseSyncService?.syncCore?.({ Store, Toast, force:true, silent:true });
        navigate('dashboard');
      } catch (error) {
        registerFailure();
        Toast.show(error.message || 'No se pudo iniciar sesión.', 'error');
        await loadCaptcha(event.currentTarget);
      } finally {
        submit?.removeAttribute('disabled');
      }
    });

    document.getElementById('btnDemoLogin')?.addEventListener('click', async () => {
      const session = await AuthService.login({ email:'admin@erp.local', password:'Adm1n$2026', tenantRif:'00000000', mode:'demo' });
      setSessionState(session);
      Toast.show('Demo local iniciado. No escribe en Supabase.', 'warning');
      navigate('dashboard');
    });
  }
};
