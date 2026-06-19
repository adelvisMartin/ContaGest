import { AuthService } from '../services/authService.js';
import { BackendApi } from '../services/backendApi.js';
import { Field, Button } from '../components/ui/index.js';

function input({ name, label, type = 'text', value = '', autocomplete = '', required = true, placeholder = '' }) {
  return Field({ name, labelKey: label, type, value, required, placeholder, attrs: autocomplete ? `autocomplete="${autocomplete}"` : '' });
}

function captchaBlock(id) {
  return `<div class="login-captcha" data-captcha-box="${id}">
    <input type="hidden" name="captchaToken" data-captcha-token>
    <label><span>Verificación de seguridad</span><div class="login-captcha-row"><strong data-captcha-question>cargando...</strong><input name="captchaAnswer" type="text" inputmode="numeric" autocomplete="off" placeholder="Resultado" required>${Button({ label:'', iconName:'fa-rotate', variant:'secondary', attrs:'type="button" data-captcha-refresh aria-label="Actualizar captcha"' })}</div></label>
    <small class="login-captcha-hint">Resuelve la operación. Se bloquea temporalmente tras 3 intentos fallidos.</small>
  </div>`;
}

export const LoginPage = {
  standalone: true,
  render() {
    return `<main class="login-shell login-shell-v111">
      <section class="login-card">
        <div class="login-brand"><div class="login-mark">C</div><div><h1>ContaGest-VE</h1><p>Enterprise ERP / CRM</p></div></div>
        <div class="login-copy"><h2>Acceso seguro al sistema</h2><p>Ingresa con las credenciales asignadas por el administrador de tu empresa.</p></div>

        <form id="loginForm" class="login-form" data-auth-panel="login">
          ${input({ name:'tenantRif', label:'RIF empresa', value:'', placeholder:'Ej: 00000000', autocomplete:'organization' })}
          ${input({ name:'email', label:'Correo electrónico', type:'email', value:'', placeholder:'usuario@empresa.com', autocomplete:'email' })}
          ${input({ name:'password', label:'Contraseña', type:'password', value:'', placeholder:'••••••••', autocomplete:'current-password' })}
          ${captchaBlock('login')}
          ${Button({ label:'Entrar', iconName:'fa-shield-halved', variant:'primary', type:'submit', className:'w-full' })}
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
          <h2>Operación, ventas, inventario, fiscal y reportes en una sola plataforma.</h2>
          <ul>
            <li>Acceso por empresa, usuario, rol y módulo contratado.</li>
            <li>Sincronización con backend, Supabase y auditoría interna.</li>
            <li>Documentos, reportes, QR y bitácora preparados para producción.</li>
            <li>Soporte multiidioma, temas visuales y moneda dual USD/Bs.</li>
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
      try {
        const captcha = await AuthService.captcha();
        if (question) question.textContent = `${captcha.question} =`;
        if (token) token.value = captcha.token;
        if (answer) answer.value = '';
      } catch {
        if (question) question.textContent = 'Backend no disponible';
      }
    };

    const setSessionState = (session) => {
      Store.set({
        route: 'dashboard',
        profile: {
          name: session.user?.fullName || session.user?.name || 'Usuario',
          email: session.user?.email || '',
          role: session.user?.role || 'admin',
          branch: session.tenant?.name || 'Empresa',
          plan: session.tenant?.plan || 'Enterprise',
          avatarDataUrl: Store.get().profile?.avatarDataUrl || ''
        },
        settings: {
          ...Store.get().settings,
          companyName: session.tenant?.name || Store.get().settings.companyName,
          companyRif: session.tenant?.rif || Store.get().settings.companyRif
        }
      });
    };

    const loginForm = document.getElementById('loginForm');
    const registerForm = null; // registro público oculto: la empresa se crea desde administrador/sysadmin
    loadCaptcha(loginForm);
    document.querySelectorAll('[data-captcha-refresh]').forEach((button) => {
      button.addEventListener('click', () => loadCaptcha(button.closest('form')));
    });

    document.getElementById('btnFillAdmin')?.addEventListener('click', () => {
      loginForm.querySelector('[name="tenantRif"]').value = '00000000';
      loginForm.querySelector('[name="email"]').value = 'admin@erp.local';
      loginForm.querySelector('[name="password"]').value = 'Adm1n$2026';
      Toast.show('Credenciales admin local cargadas. Ejecuta npm run seed en backend si la empresa no existe.', 'success');
    });

    loginForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (captchaLocked()) {
        Toast.show('Captcha bloqueado temporalmente por intentos fallidos. Espera 1 minuto.', 'error');
        return;
      }
      const data = Object.fromEntries(new FormData(event.currentTarget));
      try {
        const session = await AuthService.login({ email: data.email, password: data.password, tenantRif: data.tenantRif, captchaToken: data.captchaToken, captchaAnswer: data.captchaAnswer, mode: 'api' });
        clearFailures();
        setSessionState(session);
        Toast.show('Sesión iniciada.', 'success');
        await SupabaseSyncService?.syncCore?.({ Store, Toast, force:true, silent:true });
        navigate('dashboard');
      } catch (error) {
        registerFailure();
        Toast.show(error.message || 'No se pudo iniciar sesión.', 'error');
        await loadCaptcha(event.currentTarget);
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
