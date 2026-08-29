export function detectHipicoLayoutIssues({ touch = false } = {}) {
  const issues = [];
  const viewportWidth = document.documentElement.clientWidth;
  const explicitOverflowOwner = (node) => Boolean(node.closest('.table-wrap, .race-switcher__scroll, .tabs, .group-switcher, [data-qa-allow-overflow]'));
  const visible = (node) => {
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0 && rect.width > 0 && rect.height > 0;
  };
  const intersects = (a, b) => a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5;

  const documentOverflow = Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0) - viewportWidth;
  if (documentOverflow > 1) {
    issues.push({ type: 'document-overflow-x', detail: `${documentOverflow}px beyond viewport` });
  }

  for (const node of document.querySelectorAll('body *')) {
    if (!visible(node) || explicitOverflowOwner(node)) continue;
    const rect = node.getBoundingClientRect();
    if (rect.right > viewportWidth + 1 || rect.left < -1) {
      issues.push({
        type: 'element-outside-viewport',
        selector: node.id ? `#${node.id}` : node.className ? `.${String(node.className).trim().split(/\s+/).join('.')}` : node.tagName.toLowerCase(),
        detail: `left=${rect.left.toFixed(1)} right=${rect.right.toFixed(1)} viewport=${viewportWidth}`
      });
    }
  }

  for (const button of document.querySelectorAll('button')) {
    if (!visible(button)) continue;
    const rect = button.getBoundingClientRect();
    const isSubmit = String(button.type || '').toLowerCase() === 'submit' || button.closest('form');
    const hasWorkflowMarker = button.dataset.action || button.dataset.view || button.dataset.tab || isSubmit;
    if (!hasWorkflowMarker) {
      issues.push({ type: 'button-without-workflow', detail: button.textContent.trim().slice(0, 80) || button.getAttribute('aria-label') || '(sin texto)' });
    }

    if (touch && !button.disabled && rect.height < 43.5) {
      issues.push({ type: 'touch-target-too-small', detail: `${button.textContent.trim().slice(0, 60) || button.getAttribute('aria-label') || 'button'}: ${rect.height.toFixed(1)}px` });
    }

    const icon = button.querySelector('svg, .icon, [aria-hidden="true"]');
    const label = button.querySelector('span, strong');
    if (icon && label && visible(icon) && visible(label) && intersects(icon.getBoundingClientRect(), label.getBoundingClientRect())) {
      issues.push({ type: 'icon-label-overlap', detail: button.textContent.trim().slice(0, 80) });
    }
  }

  const duplicateIds = [...document.querySelectorAll('[id]')]
    .map((node) => node.id)
    .filter((id, index, all) => id && all.indexOf(id) !== index);
  for (const id of [...new Set(duplicateIds)]) issues.push({ type: 'duplicate-id', detail: id });

  return issues;
}
