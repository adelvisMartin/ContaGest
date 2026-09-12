import { APP_VERSION } from './config.js';
import { MAX_PORTABLE_BACKUP_CHARS, deliverJsonBackup, exportEncryptedCurrentWorkspace, restorePortableBackup } from './backup.js';

function filename() { return `hipico-control-secure-${new Date().toISOString().slice(0,10)}.json`; }
function strongPassphrase(promptText) {
  const value = globalThis.prompt?.(promptText) ?? '';
  if (!value) return null;
  if (value.length < 12) throw new Error('La contraseña debe tener al menos 12 caracteres.');
  return value;
}
function newBackupPassphrase() {
  const passphrase = strongPassphrase('Crea una contraseña para cifrar el respaldo (mínimo 12 caracteres). No podremos recuperarla si la pierdes.');
  if (!passphrase) return null;
  const confirmation = globalThis.prompt?.('Repite exactamente la contraseña del respaldo para confirmar.') ?? '';
  if (!confirmation) return null;
  if (confirmation !== passphrase) throw new Error('Las contraseñas del respaldo no coinciden. No se generó ningún archivo.');
  return passphrase;
}
function notify(message) {
  const node = document.createElement('div'); node.className = 'offline-banner'; node.setAttribute('role','status'); node.textContent = message;
  (document.querySelector('.content') || document.body).prepend(node); setTimeout(()=>node.remove(),7000);
}
function assertImportSize(size) {
  if (Number(size || 0) > MAX_PORTABLE_BACKUP_CHARS) {
    throw Object.assign(new Error('El respaldo excede el tamaño máximo permitido.'), { code:'HIPICO_BACKUP_TOO_LARGE' });
  }
}

async function secureExport(event) {
  const target = event.target?.closest?.('[data-action="export-json"]');
  if (!target) return false;
  event.preventDefault(); event.stopImmediatePropagation();
  try {
    const passphrase = newBackupPassphrase();
    if (!passphrase) return true;
    const encrypted = await exportEncryptedCurrentWorkspace({ passphrase, productVersion: APP_VERSION });
    const result = await deliverJsonBackup(filename(), encrypted);
    notify(result.ok ? 'Respaldo cifrado generado. Guarda también la contraseña en un lugar seguro.' : 'No se pudo entregar el archivo; no se exportó un respaldo plano.');
  } catch (error) { notify(`Respaldo bloqueado: ${error.message}`); }
  return true;
}

async function readImportForm(form) {
  const data = new FormData(form); const file = data.get('file'); const pasted = String(data.get('jsonText') || '');
  if (file && Number(file.size || 0) > 0) {
    assertImportSize(file.size);
    const text = await file.text();
    assertImportSize(text.length);
    return text;
  }
  assertImportSize(pasted.length);
  return pasted.trim();
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
    if (!globalThis.confirm?.('Antes de reemplazar el workspace actual, se creará una copia local previa. ¿Continuar?')) return true;
    const result = await restorePortableBackup(raw, { passphrase, confirmReplace: true });
    notify(result.legacy ? 'Respaldo legacy migrado. Se recomienda crear de inmediato uno cifrado v2.' : 'Restore validado y reconciliado. Recargando…');
    setTimeout(()=>globalThis.location?.reload?.(),700);
  } catch (error) { notify(`Restore rechazado: ${error.message}`); }
  return true;
}

document.addEventListener('click', (event) => { secureExport(event); }, true);
document.addEventListener('submit', (event) => { secureRestore(event); }, true);
