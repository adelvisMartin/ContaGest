import { PageHeader, Badge } from '../components/ui/index.js';
import { MODULE_CATALOG, MODULE_TIERS } from '../data/moduleCatalog.js';

export const ModuleMaturityPage = {
  render() {
    const groups = Object.entries(MODULE_TIERS).map(([tier, meta]) => {
      const modules = MODULE_CATALOG.filter((m) => m.tier === tier);
      return `<article class="surface p-5 rounded-[1.5rem]"><div class="flex items-start justify-between gap-3"><div><h3 class="text-2xl font-black">${meta.label}</h3><p class="subtitle">${meta.description}</p></div>${Badge(String(modules.length), meta.tone)}</div><div class="mt-4 grid gap-2">${modules.map((m) => `<div class="cg-feature-pill"><i class="fa-solid fa-cube"></i><strong>${m.name}</strong><span>${m.area}</span></div>`).join('')}</div></article>`;
    }).join('');
    return `<section class="cg-page-stack">${PageHeader({eyebrowKey:'moduleMaturityEyebrow', titleKey:'moduleMaturityTitle', descKey:'moduleMaturityDesc'})}<div class="pl-grid pl-grid-3">${groups}</div></section>`;
  }
};
