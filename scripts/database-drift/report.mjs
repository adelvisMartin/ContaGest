const ORDER = ['P0', 'P1', 'P2', 'INFO'];

function md(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function objectLabel(object) {
  const parent = object.table ? `${object.schema}.${object.table}` : object.schema;
  return `${object.kind}:${parent ? `${parent}.` : ''}${object.name}`;
}

export function renderHumanReport(manifest) {
  const lines = [
    '# Production schema drift audit',
    '',
    `- Repo SHA: \`${manifest.source.repoSha}\``,
    `- Supabase project ref: \`${manifest.source.projectRef}\``,
    `- Generated at: \`${manifest.generatedAt}\``,
    `- Deterministic digest: \`${manifest.deterministicDigest}\``,
    `- Prisma: \`${manifest.source.prismaVersion ?? 'unknown'}\``,
    `- Expected PostgreSQL: \`${manifest.source.expectedPostgresVersion ?? 'unknown'}\``,
    `- Actual PostgreSQL: \`${manifest.source.actualPostgresVersion ?? 'unknown'}\``,
    `- Migration chain: ${manifest.authority.migrationChain?.count ?? 0} migrations / \`${manifest.authority.migrationChain?.digest ?? 'n/a'}\``,
    '',
    '## Summary',
    '',
    `Total classified differences: **${manifest.summary.total}**.`,
    '',
  ];
  for (const severity of ORDER) lines.push(`- ${severity}: ${manifest.summary.bySeverity[severity] ?? 0}`);
  lines.push('', '## Findings', '', '| Severity | Category | Object | Expected | Actual | Follow-up |', '|---|---|---|---|---|---|');
  for (const finding of manifest.findings) {
    const followup = finding.remediation ? `${finding.remediation.tickets.join(', ')} — ${finding.remediation.action}` : 'Platform-managed / no app migration step';
    lines.push(`| ${finding.severity} | ${finding.category} | \`${md(objectLabel(finding.object))}\` | \`${md(JSON.stringify(finding.expected))}\` | \`${md(JSON.stringify(finding.actual))}\` | ${md(followup)} |`);
  }
  lines.push('', '## Authority gaps', '');
  if (!manifest.authority.gaps.length) lines.push('No Prisma ↔ expected-physical authority gaps detected.');
  else for (const gap of manifest.authority.gaps) lines.push(`- **${gap.kind}**: \`${gap.schema}.${gap.name}\``);
  lines.push('', '## Safety', '', '- Production introspection is catalog-only and runs inside `BEGIN READ ONLY`.', '- No application row values, connection URLs, passwords, JWTs or database credentials are written to the manifest.', '- `EXPECTED_PLATFORM_OBJECT` is informational and must not be translated into DROP statements.', '- Every P0/P1 migration step requires human review and the forward-only rehearsal/convergence tickets before production DDL.', '');
  return lines.join('\n');
}
