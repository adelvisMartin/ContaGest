export function createPageResolver({ registry, modules, moduleRuntimePage, fallbackRoute = 'dashboard' }) {
  if (!registry || typeof registry !== 'object') throw new TypeError('page registry is required');
  if (!modules || typeof modules !== 'object') throw new TypeError('page modules are required');

  const loaded = new Map();

  async function loadPage(route) {
    if (loaded.has(route)) return loaded.get(route);

    const definition = registry[route];
    if (!definition) return null;

    const importer = modules[definition[0]];
    if (!importer) throw new Error(`No se encontró el módulo de ruta: ${route}`);

    const module = await importer();
    const page = module[definition[1]];
    if (!page) throw new Error(`El módulo ${definition[0]} no exporta ${definition[1]}`);

    loaded.set(route, page);
    return page;
  }

  async function resolvePage(route) {
    const page = await loadPage(route);
    if (page) return { page, route };

    if (String(route || '').startsWith('stitch-')) {
      if (!moduleRuntimePage) throw new Error('ModuleRuntimePage is required for stitch routes');
      return {
        page: {
          render: (state) => moduleRuntimePage.render(state, route),
          mount: (state, context) => moduleRuntimePage.mount(state, context, route)
        },
        route
      };
    }

    return { page: await loadPage(fallbackRoute), route: fallbackRoute };
  }

  return { loadPage, resolvePage };
}
