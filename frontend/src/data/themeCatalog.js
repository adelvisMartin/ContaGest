export const THEME_OPTIONS = Object.freeze([
  { key:'sector', name:'Adaptativo por sector', description:'Usa la identidad contextual de cada vertical sobre una base clara.' },
  { key:'light', name:'Claro empresarial', description:'Superficies claras y contraste sobrio para trabajo diario.' },
  { key:'dark', name:'Oscuro empresarial', description:'Contraste oscuro para jornadas prolongadas o baja iluminación.' },
  { key:'sky', name:'Azul cielo', description:'Paleta fresca con acentos azules.' },
  { key:'soft-blue', name:'Azul suave', description:'Azules desaturados y superficies calmadas.' },
  { key:'spectrum', name:'Espectro', description:'Acentos violeta/índigo para una identidad más dinámica.' },
  { key:'executive', name:'Ejecutivo', description:'Azul profundo y superficies corporativas.' },
  { key:'finance', name:'Finanzas', description:'Paleta sobria enfocada en lectura numérica.' },
  { key:'enterprise', name:'Enterprise oscuro', description:'Modo oscuro de alto contraste para operación empresarial.' }
]);

export const SUPPORT_WIDGET_OPTIONS = Object.freeze([
  { value:'peek', label:'Discreto al borde' },
  { value:'visible', label:'Visible' },
  { value:'hidden', label:'Oculto' }
]);

export const themeSelectOptions = () => THEME_OPTIONS.map(({ key, name }) => ({ value:key, label:name }));
