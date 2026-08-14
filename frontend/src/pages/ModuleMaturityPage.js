import { PageHeader, Badge, ErpGrid, ErpSection, ErpStack } from '../components/ui/index.js';
import { escapeHtml } from '../utils/dom.js';
import { MODULE_CATALOG, MODULE_TIERS } from '../data/moduleCatalog.js';

const safe = (value) => escapeHtml(String(value ?? ''));

export const ModuleMaturityPage = {
  render() {
    const groups = Object.entries(MODULE_TIERS).map(([tier, meta]) => {
      const modules = MODULE_CATALOG.filter((module) => module.tier === tier);
      const content = ErpStack(modules.map((module) => `
        <div class="cg-ui-key-value">
          <span class="cg-ui-row"><i class="fa-solid fa-cube" aria-hidden="true"></i><strong>${safe(module.name)}</strong></span>
          <span class="cg-ui-muted">${safe(module.area)}</span>
        </div>`).join(''), { gap:'sm' });

      return ErpSection({
        tag:'article',
        title:meta.label,
        description:meta.description,
        actions:Badge(String(modules.length), meta.tone),
        content
      });
    }).join('');

    return `<section class="cg-page-stack">${PageHeader({
      eyebrowKey:'moduleMaturityEyebrow',
      titleKey:'moduleMaturityTitle',
      descKey:'moduleMaturityDesc'
    })}${ErpGrid(groups, { columns:'three' })}</section>`;
  }
};
