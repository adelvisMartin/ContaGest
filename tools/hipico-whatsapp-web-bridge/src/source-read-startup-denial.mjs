/**
 * #1011: Must be the FIRST import in every executable that could inspect
 * real WhatsApp Messenger SOURCE data. ESM evaluates dependencies before
 * the importing module's body; this guard aborts before Playwright and the
 * remaining dependency graph have a chance to initialize.
 */
import { assertSourceAutoReadDenied } from './source-read-policy-gate.mjs';
assertSourceAutoReadDenied();
