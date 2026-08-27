import { APP_VERSION } from './config.js';
import { deliverJsonBackup, exportEncryptedCurrentWorkspace, restorePortableBackup } from './backup.js';

function filename() { return `hipico-control-secure-${new Date().toISOString().slice(0,10)}.json`; }
function strongPassphrase(promptText) {
  const value = globalThis.prompt?.(promptText) ?? '';
  if (!value) return null;
  if (value.length < 12) throw new Error('La contraseña debe tener al menos 12 caracteres.');
  return value;
}
function notify(message) {
  const node = document.createElement('div'); node.className = 'offline-banner'; node.setAttribute('role','status'); node.textContent = message;
  (document.querySelector('.content') || document.body).prepend(node); setTimeout(()=>node.remove(),7000);
}

async function secureExport(event) {
  const target = event.target?.closest?.('[data-action="export-json"]');
  if (!target) return false;
  event.preventDefault(); event.stopImmediatePropagation();
  try {
    const passphrase = strongPassphrase('Crea una contraseña para cifrar el respaldo (mínimo 12 caracteres). No podremos recuperarla si la pierdes.');
    if (!passphrase) return true;
    const encrypted = await exportEncryptedCurrentWorkspace({ passphrase, productVersion: APP_VERSION });
    const result = await deliverJsonBackup(filename(), encrypted);
    notify(result.ok ? 'Respaldo cifrado generado. Guarda también la contraseña en un lugar seguro.' : 'No se pudo entregar el archivo; no se exportó un respaldo plano.');
  } catch (error) { notify(`Respaldo bloqueado: ${error.message}`); }
  return true;
}

async function readImportForm(form) {
  const data = new FormData(form); const file = data.get('file'); const pasted = String(data.get('jsonText') || '').trim();
  return file && Number(file.size || 0) > 0 ? file.text() : pasted;
}

async function secureRestore(event) {
  const form = event.target?.closest?.('#import-form');
  if (!form) return false;
  event.preventDefault(); event.stopImmediatePropagation();
  try {
    const raw = await readImportForm(form); if (!raw) throw new Error('Selecciona un archivo o pega el respaldo.');
    let parsed; try { parsed = JSON.parse(raw); } catch { throw new Error('El archivo no es JSON válido.'); }
    const encrypted = Boolean(parsed?._encryptedBackup);
    const passphrase = encrypted ? strongPassphrase('Escribe la contraseña del respaldo cifrado.') : undefined;
    if (encrypted && !passphrase) return true;
    if (!encrypted && !parsed?._backup) {
      const legacy = globalThis.confirm?.('Este es un respaldo legacy sin hash criptográfico. ¿Deseas migrarlo bajo validación estructural?');
      if (!legacy) return true;
    }
    if (!globalThis.confirm?.('Se creará una copia local previa y luego se reemplazará el workspace actual. ¿Continuar?')) return true;
    const result = await restorePortableBackup(raw, { passphrase, confirmReplace: true });
    notify(result.legacy ? 'Respaldo legacy migrado. Se recomienda crear de inmediato uno cifrado v2.' : 'Restore validado y reconciliado. Recargando…');
    setTimeout(()=>globalThis.location?.reload?.(),700);
  } catch (error) { notify(`Restore rechazado: ${error.message}`); }
  return true;
}

document.addEventListener('click', (event) => { secureExport(event); }, true);
document.addEventListener('submit', (event) => { secureRestore(event); }, true);
