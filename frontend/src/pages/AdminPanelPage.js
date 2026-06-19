import { PageHeader, Button, Badge, Field, Select } from '../components/ui/index.js';
import { escapeHtml } from '../utils/dom.js';
import { AccessControlService } from '../services/accessControlService.js';
import { RbacService } from '../services/rbacService.js';
import { FailureLogService } from '../services/failureLogService.js';

const toneBadge = (tone) => ({ danger:'danger', brand:'slate', success:'success', warning:'warning', slate:'slate', accent:'warning' }[tone] || 'slate');
const fmtDate = (date) => date ? new Date(date).toLocaleString('es-VE', { dateStyle:'short', timeStyle:'short' }) : 'Sin vencimiento';
const daysLeft = (user) => AccessControlService.remaining(user);
const roleOptions = (roles) => roles.map((role) => ({ value: role.id, label: role.name }));

function roleModules(role) {
  const set = new Set(role.modules || []);
  return AccessControlService.modules.map((module) => `<label class="cg-permission-pill ${set.has(module.route) ? 'is-on' : ''}">
    <input type="checkbox" data-role-module="${role.id}" value="${module.route}" ${set.has(module.route) ? 'checked' : ''} ${role.id === 'role-admin' ? 'disabled' : ''} />
    <span>${escapeHtml(module.label)}</span>
  </label>`).join('');
}

function roleCard(role, users) {
  const roleUsers = users.filter((u) => u.roleId === role.id);
  return `<article class="cg-rbac-role-card cg-enterprise-card">
    <div class="cg-rbac-role-head">
      <div><h3>${escapeHtml(role.name)}</h3><p>${escapeHtml(role.description || '')}</p><small class="cg-role-scope">${escapeHtml(role.scope || 'Alcance pendiente de definir.')}</small></div>
      ${Badge(`${roleUsers.length} usuario(s)`, toneBadge(role.tone))}
    </div>
    <div class="cg-rbac-permission-grid">${roleModules(role)}</div>
    <div class="cg-rbac-role-actions">
      <button class="btn btn-secondary" type="button" data-save-role="${role.id}"><i class="fa-solid fa-cloud-arrow-up"></i> Guardar permisos</button>
    </div>
  </article>`;
}


function roleScopeRows(rbac) {
  return (rbac.roles || []).map((role) => {
    const fixedUsers = (rbac.users || []).filter((user) => user.roleId === role.id && !user.demo).length;
    const demoUsers = (rbac.users || []).filter((user) => user.roleId === role.id && user.demo).length;
    const modules = role.modules || [];
    return `<tr>
      <td><strong>${escapeHtml(role.name)}</strong><br><small>${escapeHtml(role.description || '')}</small></td>
      <td>${escapeHtml(role.scope || 'Alcance pendiente.')}</td>
      <td><strong>${modules.length}</strong><br><small>${modules.slice(0, 8).join(', ')}${modules.length > 8 ? '…' : ''}</small></td>
      <td>${Badge(`${fixedUsers} fijo(s)`, 'slate')} ${Badge(`${demoUsers} demo(s)`, demoUsers ? 'warning' : 'slate')}</td>
    </tr>`;
  }).join('');
}

function adminMonitoring(state, rbac) {
  const logSummary = FailureLogService.summary(state.failureLog);
  const demoUsers = (rbac.users || []).filter((user) => user.demo);
  const expired = demoUsers.filter((user) => AccessControlService.remaining(user).expired).length;
  const expiring = demoUsers.filter((user) => { const remaining = AccessControlService.remaining(user); return !remaining.expired && Number(remaining.days ?? 99) <= Number(rbac.demoPolicy?.warningDays || 3); }).length;
  const enabledRoutes = new Set((rbac.roles || []).flatMap((role) => role.modules || []));
  return `<section class="cg-rbac-section cg-enterprise-card cg-admin-monitor">
    <div class="cg-rbac-section-head"><div><h3>Monitoreo interno del administrador</h3><p>Visión rápida de demos, fallas abiertas, cobertura de módulos y salud del proyecto.</p></div><button class="btn btn-secondary" type="button" data-route="auditoria"><i class="fa-solid fa-clipboard-list"></i> Abrir bitácora</button></div>
    <div class="cg-admin-monitor-grid">
      <article><span>Demos activos</span><strong>${demoUsers.length}</strong><small>${expired} expirado(s) · ${expiring} por vencer</small></article>
      <article><span>Fallas abiertas</span><strong>${logSummary.open}</strong><small>${logSummary.critical} críticas · score ${logSummary.healthScore}/100</small></article>
      <article><span>Rutas habilitadas</span><strong>${enabledRoutes.size}</strong><small>${AccessControlService.modules.length} rutas mapeadas en RBAC</small></article>
      <article><span>Perfiles definidos</span><strong>${(rbac.roles || []).length}</strong><small>${(rbac.users || []).length} usuarios semilla/prueba</small></article>
    </div>
  </section>`;
}

function userRows(rbac) {
  return rbac.users.map((user) => {
    const role = rbac.roles.find((item) => item.id === user.roleId) || rbac.roles[0];
    const remaining = daysLeft(user);
    const allowedModules = AccessControlService.modulesForUser(user, role);
    return `<tr>
      <td><strong>${escapeHtml(user.fullName)}</strong><br><small>${escapeHtml(user.email)}</small></td>
      <td>${Badge(role?.name || 'Sin rol', toneBadge(role?.tone))}</td>
      <td>${allowedModules.slice(0, 6).map((m) => `<code>${m}</code>`).join(' ')}${allowedModules.length > 6 ? ' …' : ''}<br><small>Límite: ${user.demo ? `${allowedModules.length}/${role?.modules?.length || 0}` : 'sin límite'}</small></td>
      <td>${user.demo ? Badge(`Demo · ${remaining.label}`, remaining.expired ? 'danger' : remaining.days <= 3 ? 'warning' : 'success') : Badge('Usuario fijo','slate')}</td>
      <td>${fmtDate(user.demoExpiresAt)}</td>
      <td class="cg-actions-cell"><div class="cg-row-actions"><button class="btn btn-secondary !p-2" type="button" data-edit-user="${user.id}" title="Editar usuario"><i class="fa-solid fa-pen"></i></button><button class="btn btn-secondary !p-2" type="button" data-switch-user="${user.id}" title="Simular sesión"><i class="fa-solid fa-user-check"></i></button></div></td>
    </tr>`;
  }).join('');
}

function editableDemoRows(rbac) {
  const roles = rbac.roles || [];
  const demos = rbac.users.filter((user) => user.demo);
  return demos.length ? demos.map((user) => {
    const remaining = daysLeft(user);
    const role = roles.find((item) => item.id === user.roleId) || roles[0];
    return `<tr>
      <td><input class="input cg-admin-inline-input" name="fullName" value="${escapeHtml(user.fullName)}" form="editDemo-${user.id}" /></td>
      <td><input class="input cg-admin-inline-input" name="email" type="email" value="${escapeHtml(user.email)}" form="editDemo-${user.id}" /></td>
      <td><select class="select cg-admin-inline-input" name="roleId" form="editDemo-${user.id}">${roles.map((r) => `<option value="${r.id}" ${r.id === user.roleId ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('')}</select></td>
      <td><input class="input cg-admin-inline-input" name="days" type="number" min="1" max="365" value="14" form="editDemo-${user.id}" /></td>
      <td><input class="input cg-admin-inline-input" name="maxModules" type="number" min="1" max="${role?.modules?.length || 30}" value="${Number(user.maxModules || rbac.demoPolicy.maxModules || 7)}" form="editDemo-${user.id}" /></td>
      <td>${Badge(remaining.label, remaining.expired ? 'danger' : remaining.days <= 3 ? 'warning' : 'success')}</td>
      <td class="cg-actions-cell"><form id="editDemo-${user.id}" data-edit-demo-user="${user.id}" class="cg-row-actions"><button class="btn btn-secondary !p-2" type="submit" title="Guardar usuario demo"><i class="fa-solid fa-floppy-disk"></i></button></form></td>
    </tr>`;
  }).join('') : '<tr><td colspan="7" class="text-center">Sin usuarios demo editables.</td></tr>';
}

export const AdminPanelPage = {
  render(state) {
    const rbac = AccessControlService.ensure(state.rbac);
    const activeUser = rbac.users.find((u) => u.id === rbac.activeUserId) || rbac.users[0];
    const activeRole = rbac.roles.find((r) => r.id === activeUser?.roleId) || rbac.roles[0];
    const activeRemaining = AccessControlService.remaining(activeUser);
    const userOptions = rbac.users.map((u) => ({ value:u.id, label:`${u.fullName} · ${u.email}` }));
    const roles = rbac.roles || [];
    return `<section class="cg-page-stack cg-rbac-page cg-executive-admin">
      ${PageHeader({ eyebrowKey:'admin', titleKey:'Panel de roles, perfiles y demos', descKey:'Define módulos por perfil, crea usuarios demo editables y controla límites por tiempo/módulos.', actions: Button({ id:'btnBootstrapRbac', text:'Crear usuarios demo en Supabase', icon:'fa-users-gear', variant:'primary', attrs:'type="button"' }) + Button({ id:'btnSyncRbac', text:'Sincronizar RBAC', icon:'fa-cloud-arrow-down', variant:'secondary', attrs:'type="button"' }) })}

      <div class="cg-rbac-dashboard cg-admin-command-grid">
        <article class="cg-rbac-active-card cg-enterprise-card">
          <span class="cg-rbac-kicker">Usuario simulado activo</span>
          <h3>${escapeHtml(activeUser?.fullName || 'Sin usuario')}</h3>
          <p>${escapeHtml(activeUser?.email || '')}</p>
          <div class="cg-rbac-active-meta">
            ${Badge(activeRole?.name || 'Sin rol', toneBadge(activeRole?.tone))}
            ${activeUser?.demo ? Badge(`Demo: ${activeRemaining.label}`, activeRemaining.expired ? 'danger' : 'warning') : Badge('Sin límite de tiempo','success')}
          </div>
        </article>
        <article class="cg-rbac-switch-card cg-enterprise-card">
          <form id="rbacActiveUserForm" class="cg-rbac-switch-form">
            ${Select({ labelKey:'Usuario para probar límites', name:'activeUserId', value:rbac.activeUserId, options:userOptions })}
            ${Button({ text:'Aplicar usuario', icon:'fa-user-check', variant:'primary', type:'submit' })}
          </form>
          <p>Al cambiar el usuario, los módulos bloqueados quedan con candado en el menú. Panel admin, demos, licencias y backend quedan reservados para perfiles autorizados.</p>
        </article>
      </div>

      ${adminMonitoring(state, rbac)}

      <section class="cg-rbac-section cg-enterprise-card">
        <div class="cg-rbac-section-head"><h3>Crear usuario demo editable</h3><p>Define nombre, email, rol, días de prueba, límite de módulos y contraseña. Luego puedes ajustar permisos por rol debajo.</p></div>
        <form id="createDemoUserForm" class="cg-demo-user-form">
          ${Field({ labelKey:'Nombre de usuario', name:'fullName', value:'Demo Cliente Nuevo', required:true })}
          ${Field({ labelKey:'Email demo', name:'email', type:'email', value:`demo-${Date.now().toString(36)}@empresa.com`, required:true })}
          ${Select({ labelKey:'Perfil / rol', name:'roleId', value:'role-demo', options:roleOptions(roles) })}
          ${Field({ labelKey:'Días de acceso', name:'days', type:'number', value:String(rbac.demoPolicy?.defaultDays || 14), attrs:'min="1" max="365"' })}
          ${Field({ labelKey:'Máx. módulos', name:'maxModules', type:'number', value:String(rbac.demoPolicy?.maxModules || 7), attrs:'min="1" max="30"' })}
          ${Field({ labelKey:'Contraseña', name:'password', type:'text', value:'demo1234' })}
          <div class="cg-demo-user-actions">${Button({ text:'Crear demo', icon:'fa-user-plus', type:'submit' })}</div>
        </form>
      </section>

      <section class="cg-rbac-section cg-enterprise-card">
        <div class="cg-rbac-section-head"><h3>Editar demos existentes</h3><p>Cambia nombre, email, rol, días y máximo de módulos de forma directa.</p></div>
        <div class="pl-table-wrap"><table class="pl-table"><thead><tr><th>Nombre</th><th>Email</th><th>Rol</th><th>Días nuevos</th><th>Máx. módulos</th><th>Restante</th><th>Guardar</th></tr></thead><tbody>${editableDemoRows(rbac)}</tbody></table></div>
      </section>

      <section class="cg-rbac-section cg-enterprise-card">
        <div class="cg-rbac-section-head"><h3>Matriz de alcance por rol</h3><p>Resumen explícito para saber qué puede hacer cada perfil y qué usuarios quedan bajo ese alcance.</p></div>
        <div class="pl-table-wrap"><table class="pl-table"><thead><tr><th>Rol</th><th>Alcance operativo</th><th>Módulos</th><th>Usuarios</th></tr></thead><tbody>${roleScopeRows(rbac)}</tbody></table></div>
      </section>

      <section class="cg-rbac-section cg-enterprise-card">
        <div class="cg-rbac-section-head"><h3>Perfiles y módulos puntuales</h3><p>Marca/desmarca módulos por rol. Para demos, el campo Máx. módulos limita cuántos módulos del rol quedan habilitados.</p></div>
        <div class="cg-rbac-role-grid">${rbac.roles.map((role) => roleCard(role, rbac.users)).join('')}</div>
      </section>

      <section class="cg-rbac-section cg-enterprise-card">
        <div class="cg-rbac-section-head"><h3>Usuarios de prueba por perfil</h3><p>Todos pueden usar <code>demo1234</code> en desarrollo si no tienen hash. Los usuarios creados desde aquí se sincronizan con backend cuando esté disponible.</p></div>
        <div class="pl-table-wrap"><table class="pl-table"><thead><tr><th>Usuario</th><th>Rol</th><th>Módulos habilitados</th><th>Tipo</th><th>Vence</th><th>Acciones</th></tr></thead><tbody>${userRows(rbac)}</tbody></table></div>
      </section>
    </section>`;
  },
  mount(_state, { Store, Toast, render }) {
    const commit = (rbac, message = 'Permisos actualizados.') => {
      Store.update((draft) => { draft.rbac = rbac; });
      Toast.show(message, 'success');
      render?.();
    };

    const roleNameForId = (roleId) => AccessControlService.ensure(Store.get().rbac).roles.find((role) => role.id === roleId)?.name || 'Demo limitado';

    document.getElementById('rbacActiveUserForm')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget));
      commit(AccessControlService.setActiveUser(Store.get().rbac, data.activeUserId), 'Usuario activo cambiado. Revisa el menú y los candados.');
    });

    document.getElementById('createDemoUserForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget));
      const payload = { ...data, roleName: roleNameForId(data.roleId), activate:true };
      const localRbac = AccessControlService.upsertDemoUser(Store.get().rbac, payload);
      Store.update((draft) => { draft.rbac = localRbac; });
      try {
        await RbacService.createDemoUser(payload);
        Toast.show('Usuario demo creado en backend/Supabase.', 'success');
      } catch (error) {
        Toast.show(`Usuario demo creado localmente. Backend: ${error.message}`, 'warning');
      }
      render?.();
    });

    document.querySelectorAll('[data-edit-demo-user]').forEach((form) => form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const userId = form.dataset.editDemoUser;
      const data = Object.fromEntries(new FormData(form));
      const payload = { ...data, roleName: roleNameForId(data.roleId), id:userId };
      Store.update((draft) => { draft.rbac = AccessControlService.updateUser(draft.rbac, userId, payload); });
      const updated = AccessControlService.ensure(Store.get().rbac).users.find((user) => user.id === userId);
      try {
        await RbacService.updateDemoUser(updated?.email || userId, { ...payload, email: updated?.email || payload.email });
        Toast.show('Usuario demo actualizado en backend/Supabase.', 'success');
      } catch (error) {
        Toast.show(`Usuario demo actualizado localmente. Backend: ${error.message}`, 'warning');
      }
      render?.();
    }));

    document.querySelectorAll('[data-edit-user]').forEach((button) => button.addEventListener('click', () => {
      const rbac = AccessControlService.ensure(Store.get().rbac);
      const user = rbac.users.find((item) => item.id === button.dataset.editUser);
      if (!user?.demo) return Toast.show('Los usuarios fijos se editan desde registro/autenticación. Crea una copia demo para pruebas.', 'info');
      document.querySelector(`[data-edit-demo-user="${user.id}"] input[name="fullName"]`)?.focus();
    }));

    document.querySelectorAll('[data-switch-user]').forEach((button) => button.addEventListener('click', () => {
      commit(AccessControlService.setActiveUser(Store.get().rbac, button.dataset.switchUser), 'Sesión simulada cambiada.');
    }));

    document.querySelectorAll('[data-role-module]').forEach((input) => input.addEventListener('change', () => {
      Store.update((draft) => { draft.rbac = AccessControlService.toggleModule(draft.rbac, input.dataset.roleModule, input.value); });
      Toast.show('Módulo actualizado localmente. Usa Guardar permisos para enviarlo al backend.', 'info');
      render?.();
    }));

    document.querySelectorAll('[data-save-role]').forEach((button) => button.addEventListener('click', async () => {
      const rbac = AccessControlService.ensure(Store.get().rbac);
      const role = rbac.roles.find((item) => item.id === button.dataset.saveRole);
      if (!role) return;
      try {
        await RbacService.saveRoleModules(role);
        Toast.show(`Permisos de ${role.name} guardados en backend/Supabase.`, 'success');
      } catch (error) {
        Toast.show(`Permisos guardados localmente. Backend: ${error.message}`, 'warning');
      }
    }));

    document.getElementById('btnBootstrapRbac')?.addEventListener('click', async () => {
      const rbac = AccessControlService.defaultState();
      Store.update((draft) => { draft.rbac = rbac; });
      try {
        await RbacService.bootstrap();
        Toast.show('Roles, permisos y usuarios demo creados/actualizados en Supabase.', 'success');
      } catch (error) {
        Toast.show(`RBAC preparado localmente. Backend: ${error.message}`, 'warning');
      }
      render?.();
    });

    document.getElementById('btnSyncRbac')?.addEventListener('click', async () => {
      try {
        const summary = await RbacService.summary();
        Toast.show(`RBAC backend OK: ${summary.roles?.length || 0} roles, ${summary.users?.length || 0} usuarios.`, 'success');
      } catch (error) {
        Toast.show(`No se pudo sincronizar RBAC: ${error.message}`, 'warning');
      }
    });
  }
};
