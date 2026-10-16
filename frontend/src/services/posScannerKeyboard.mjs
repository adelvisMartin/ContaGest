// @ts-check
/**
 * Decide which POS scanner shortcut is safe. This is only a keyboard UX
 * helper: it never invents barcode scans, posts a sale or stores credentials.
 * The caller must scope the keydown handler to its own POS section.
 *
 * Slash: focus scanner, only while a non-editable control has focus.
 * Escape: clear scanner, only if the scanner itself has focus.
 * Enter: native form submit (no synthetic submits or duplicate request).
 */
/** @typedef {'focus'|'clear'|'ignore'} PosScannerKeyAction */

/**
 * @param {unknown} value
 * @returns {PosScannerKeyAction}
 */
export function decidePosScannerKey(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'ignore';
  const input = /** @type {{
   * key?:unknown,ctrlKey?:unknown,altKey?:unknown,metaKey?:unknown,
   * repeat?:unknown,isComposing?:unknown,busy?:unknown,
   * targetIsScanner?:unknown,targetIsEditable?:unknown,modalOpen?:unknown
   * }} */ (value);
  if (input.busy === true || input.modalOpen === true
      || input.ctrlKey === true || input.altKey === true || input.metaKey === true
      || input.repeat === true || input.isComposing === true) return 'ignore';
  if (input.key === 'Escape' && input.targetIsScanner === true) return 'clear';
  if (input.key === '/' && input.targetIsEditable !== true) return 'focus';
  return 'ignore';
}
