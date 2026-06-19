// Optional Supabase client loader. This file keeps Supabase decoupled from the demo bundle.
// Install @supabase/supabase-js when you move to Vite/React, or load it from a controlled bundle.
const CFG_KEY = 'contagest_supabase_config';

const envConfig = () => ({
  url: import.meta?.env?.VITE_SUPABASE_URL || '',
  anonKey: import.meta?.env?.VITE_SUPABASE_ANON_KEY || ''
});

export const SupabaseConfig = {
  get() {
    try {
      const stored = JSON.parse(localStorage.getItem(CFG_KEY) || '{}');
      return { ...envConfig(), ...stored };
    } catch {
      return envConfig();
    }
  },
  set(config) { localStorage.setItem(CFG_KEY, JSON.stringify(config || {})); },
  clear() { localStorage.removeItem(CFG_KEY); },
  isConfigured() { const cfg = this.get(); return Boolean(cfg.url && cfg.anonKey); }
};

export async function createSupabaseBrowserClient() {
  const cfg = SupabaseConfig.get();
  if (!cfg.url || !cfg.anonKey) throw new Error('Configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en frontend/.env o desde Configuración.');
  const mod = await import('https://esm.sh/@supabase/supabase-js@2');
  return mod.createClient(cfg.url, cfg.anonKey);
}
