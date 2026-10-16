// Pure release decision for Hípico #839: source-only backup tooling is not a DR drill.
// The input must be produced by the existing isolated-restore evidence producer.
// A caller's environment flag never substitutes for an exact-SHA artifact.
const SHA40=/^[a-f0-9]{40}$/i;
const SHA64=/^[a-f0-9]{64}$/i;

export function validHipicoDrRestoreEvidence(data, expectedInventorySha256, canonicalTables) {
  if (!data || data.schema!=='hipico-schema-backup-evidence.v17' ||
      data.status!=='PASS' || data.restoreVerified!==true ||
      !SHA40.test(String(data.candidateSha||'')) ||
      !SHA64.test(String(expectedInventorySha256||'')) ||
      !Array.isArray(canonicalTables) || canonicalTables.length!==25 ||
      new Set(canonicalTables).size!==25 ||
      data.tableManifestSha256!==expectedInventorySha256 ||
      data.scope!=='hipico-canonical-v12-v27' ||
      data.migrationChain!=='v12-v27' ||
      data.mode!=='STEADY_STATE' ||
      data.canonicalTableCount!==25 ||
      data.sourceTableCount!==25 ||
      data.tableCount!==25 ||
      data.orphanForeignKeys!==0 ||
      !String(data.backupId||'').trim() ||
      !String(data.restoreTestId||'').trim() ||
      !String(data.targetDatabase||'').trim() ||
      !Number.isFinite(Date.parse(String(data.checkedAt||''))) ||
      Date.parse(data.checkedAt)>Date.now()+60000 ||
      !Array.isArray(data.presentTables) ||
      data.presentTables.length!==25 ||
      new Set(data.presentTables).size!==25 ||
      data.presentTables.some(t=>!canonicalTables.includes(t)) ||
      data.presentTables.some(t=>!/^hipico_[a-z0-9_]+$/.test(t)) ||
      !Array.isArray(data.deferredTables) ||
      data.deferredTables.length!==0 ||
      !Array.isArray(data.reasons) ||
      data.reasons.length!==0) return false;
  return true;
}
