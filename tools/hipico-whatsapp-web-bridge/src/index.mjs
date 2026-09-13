import { chromium } from 'playwright-core';
import { installDocumentRuntimeHook } from './document-runtime-hook.mjs';

installDocumentRuntimeHook(chromium);
await import('./runtime-core.mjs');
