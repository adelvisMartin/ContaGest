// Playwright grep tests the full searchable title, including project/file context.
// Route names from the canonical catalog are deliberately restricted to safe IDs.
export function createCrossBrowserRouteGrep(routes) {
  if (!Array.isArray(routes) || routes.length === 0) throw new Error('Cross-browser route scope is empty');
  for (const route of routes) {
    if (typeof route !== 'string' || !/^[a-z0-9-]+$/.test(route)) {
      throw new Error(`Invalid route for Playwright grep: ${String(route)}`);
    }
  }
  // Space-delimited route names prevent "ventas" accidentally matching "libro-ventas".
  // Unlike a ^-anchored grep, this also matches titles prefixed by project/file.
  return String.raw`(?:^|\s)(?:${routes.join('|')}) · deep desktop/mobile light/dark audit(?:$|\s)`;
}
