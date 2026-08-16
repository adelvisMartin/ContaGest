export const THEME_OPTIONS = Object.freeze([
  { key:'light', name:'Claro empresarial', description:'Tema claro principal con superficies y navegación de alto contraste.' },
  { key:'dark', name:'Oscuro empresarial', description:'Tema oscuro principal para trabajo prolongado y baja iluminación.' }
]);

/* Paletas históricas conservadas como referencia de diseño, no como estados del
   switch global. Si vuelven, deben hacerlo como presets de tokens dentro de
   Configuración y nunca competir con el contrato binario Claro/Oscuro. */
export const LEGACY_THEME_PRESETS = Object.freeze([
  { key:'sector', name:'Adaptativo por sector' },
  { key:'sky', name:'Azul cielo' },
  { key:'soft-blue', name:'Azul suave' },
  { key:'ocean', name:'Océano profesional' },
  { key:'forest', name:'Bosque sereno' },
  { key:'celestial', name:'Celestial suave' },
  { key:'spectrum', name:'Espectro' },
  { key:'executive', name:'Ejecutivo' },
  { key:'finance', name:'Finanzas' },
  { key:'enterprise', name:'Enterprise oscuro' }
]);

export const SUPPORT_WIDGET_OPTIONS = Object.freeze([
  { value:'peek', label:'Discreto al borde' },
  { value:'visible', label:'Visible' },
  { value:'hidden', label:'Oculto' }
]);

export const themeSelectOptions = () => THEME_OPTIONS.map(({ key, name }) => ({ value:key, label:name }));
