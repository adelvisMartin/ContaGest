/**
 * Recognize ordinary Markdown reference links without resolving paths, running
 * commands or following URLs. Callers retain repository-root path enforcement.
 * Fenced and inline code samples are excluded to avoid noisy doc findings.
 */
export function collectReferenceLinks(markdown) {
  const definitions = new Map();
  const uses = [];
  const lines = markdown.split(/\r?\n/);
  let fenceChar = null;
  let fenceLength = 0;

  const normalize = (label) => label.trim().replace(/\s+/g, ' ').toLowerCase();

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const fence = /^[ \t]{0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      const marker = fence[1];
      if (!fenceChar) {
        fenceChar = marker[0];
        fenceLength = marker.length;
      } else if (marker[0] === fenceChar && marker.length >= fenceLength &&
                 line.slice(fence[0].length).trim() === '') {
        fenceChar = null;
      }
      continue;
    }
    if (fenceChar) continue;

    // Literal inline examples are not Markdown links. Preserve all other text.
    const visible = line.replace(/`+[^`\n]*`+/g, '');
    const definition = /^[ \t]{0,3}\[([^\]\n]+)\]:[ \t]*(<[^>\n]+>|[^ \t\n]+)(?:[ \t]+(?:"[^"\n]*"|'[^'\n]*'|\([^\)\n]*\)))?[ \t]*$/.exec(visible);
    if (definition && !definition[1].startsWith('^')) {
      const key = normalize(definition[1]);
      if (!definitions.has(key)) {
        definitions.set(key, { line: index + 1, target: definition[2] });
      }
      continue;
    }
    for (const match of visible.matchAll(/(?<!!)\[([^\]\n]+)\]\[([^\]\n]*)\]/g)) {
      // An odd number of backslashes escapes the opening bracket in Markdown.
      // Two backslashes encode a literal slash, leaving the link operative.
      let precedingSlashes = 0;
      for (let cursor = match.index - 1; cursor >= 0 && visible[cursor] === '\\'; cursor--) {
        precedingSlashes++;
      }
      if (precedingSlashes % 2 === 1) continue;
      const label = normalize(match[2] || match[1]);
      uses.push({ line: index + 1, label });
    }
  }

  const results = [];
  const seen = new Set();
  for (const use of uses) {
    const definition = definitions.get(use.label);
    if (!definition) {
      results.push({ kind: 'undefined', line: use.line, reference: use.label });
    } else if (!seen.has(use.label)) {
      // Test a shared definition's target only once, at its actual source line.
      results.push({ kind: 'target', line: definition.line, reference: definition.target });
      seen.add(use.label);
    }
  }
  return results;
}
