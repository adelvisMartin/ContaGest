export const THEME_OPTIONS = Object.freeze([
  { key:'light', name:'Claro empresarial', description:'Tema claro principal con superficies y navegación de alto contraste.' },
  { key:'dark', name:'Oscuro empresarial', description:'Tema oscuro principal para trabajo prolongado y baja iluminación.' }
]);

export const SUPPORT_WIDGET_OPTIONS = Object.freeze([
  { value:'peek', label:'Discreto al borde' },
  { value:'visible', label:'Visible' },
  { value:'hidden', label:'Oculto' }
]);

export const themeSelectOptions = () => THEME_OPTIONS.map(({ key, name }) => ({ value:key, label:name }));
