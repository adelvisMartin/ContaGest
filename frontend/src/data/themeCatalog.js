export const THEME_OPTIONS = Object.freeze([
  { key:'sector', name:'Adaptativo por sector', description:'Usa la identidad visual del sector activo sin perder el sistema ERP común.' },
  { key:'light', name:'Claro empresarial', description:'Alta legibilidad para operación diaria y oficinas iluminadas.' },
  { key:'dark', name:'Oscuro empresarial', description:'Superficies oscuras equilibradas para trabajo prolongado.' },
  { key:'sky', name:'Azul cielo', description:'Azules limpios con contraste corporativo.' },
  { key:'soft-blue', name:'Azul suave', description:'Azules desaturados para una lectura más calmada.' },
  { key:'ocean', name:'Océano profesional', description:'Azules profundos y superficies grises inspirados en Faded Blues de ColorKit.' },
  { key:'forest', name:'Bosque sereno', description:'Verde grisáceo y azul pizarra para una experiencia natural y sobria.' },
  { key:'celestial', name:'Celestial suave', description:'Azul, menta y neutros suaves para áreas de atención y planificación.' },
  { key:'spectrum', name:'Espectro', description:'Acentos violetas y azules para módulos creativos y analíticos.' },
  { key:'executive', name:'Ejecutivo', description:'Azul marino sobrio orientado a dirección y administración.' },
  { key:'finance', name:'Finanzas', description:'Verdes contenidos para contabilidad, tesorería y control.' },
  { key:'enterprise', name:'Enterprise oscuro', description:'Mayor profundidad y contraste para operación intensiva.' }
]);

export const SUPPORT_WIDGET_OPTIONS = Object.freeze([
  { value:'peek', label:'Discreto al borde' },
  { value:'visible', label:'Visible' },
  { value:'hidden', label:'Oculto' }
]);

export const themeSelectOptions = () => THEME_OPTIONS.map(({ key, name }) => ({ value:key, label:name }));
