import { PageHeader, Field, Select, Button, StatCard } from '../components/ui/index.js';
import { mountSubmit } from '../utils/dom.js';

export const ProfilePage = {
  render(state) {
    const p = state.profile || {};
    return `<section class="surface rounded-[1.75rem] p-5 sm:p-7">${PageHeader({ eyebrowKey:'profileEyebrow', titleKey:'profileTitle', descKey:'profileDesc' })}
      <div class="mb-5 grid gap-4 md:grid-cols-4">${StatCard({label:'Usuario', value:p.name || 'Admin User', icon:'fa-user'})}${StatCard({label:'Rol', value:p.role || 'Administrador', icon:'fa-shield-halved'})}${StatCard({label:'Sucursal', value:p.branch || 'Central', icon:'fa-building'})}${StatCard({label:'Plan', value:p.plan || 'Enterprise', icon:'fa-layer-group', tone:'accent'})}</div>
      <form id="profileForm" class="panel-soft grid gap-4 rounded-[1.5rem] p-4 sm:grid-cols-2">${Field({labelKey:'name', name:'name', value:p.name || ''})}${Field({labelKey:'email', name:'email', type:'email', value:p.email || ''})}${Select({labelKey:'role', name:'role', value:p.role || 'Administrador', options:[{value:'Administrador',label:'Administrador'}, {value:'Analista',label:'Analista'}, {value:'Auditor',label:'Auditor'}, {value:'Consultor',label:'Consultor'}]})}${Field({labelKey:'branch', name:'branch', value:p.branch || 'Sucursal Central'})}${Select({labelKey:'plan', name:'plan', value:p.plan || 'Enterprise', options:[{value:'Essential',label:'Essential'}, {value:'Professional',label:'Professional'}, {value:'Enterprise',label:'Enterprise'}]})}<div class="sm:col-span-2">${Button({ text:'Guardar perfil', i18n:'save', icon:'fa-user-check' })}</div></form>
    </section>`;
  },
  mount(state, { Store, Toast }) { mountSubmit('#profileForm', (data) => { Store.set({ profile:data }); Toast.show('Perfil actualizado.', 'success'); }); }
};
