import { createRequire } from 'node:module';
import type { PdfTextExtractor, ExtractionResult } from './document-engine.js';

const require = createRequire(import.meta.url);
const MIN_NATIVE_TEXT_CHARS = 32;
const OCR_MAX_PAGES = 40;

type RuntimeEnv = Record<string, string | undefined>;
type DynamicImport = (specifier: string) => Promise<any>;
const dynamicImport: DynamicImport = new Function('specifier', 'return import(specifier)') as DynamicImport;

function packageAvailable(specifier: string) {
  try { require.resolve(specifier); return true; } catch { return false; }
}

function enabled(source: RuntimeEnv, name: string) {
  return String(source[name] || '').trim().toLowerCase() === 'true';
}

export function documentExtractorCapability(source: RuntimeEnv = process.env) {
  const pdfjs = packageAvailable('pdfjs-dist/legacy/build/pdf.mjs');
  const ocrRequested = enabled(source, 'HIPICO_DOCUMENT_OCR_ENABLED');
  const tesseract = packageAvailable('tesseract.js');
  const canvas = packageAvailable('@napi-rs/canvas');
  return {
    configured: pdfjs,
    nativeText: pdfjs,
    ocr: pdfjs && ocrRequested && tesseract && canvas,
    parserVersion: pdfjs ? 'pdfjs-dist:6.3.289' : null,
    reason: !pdfjs
      ? 'PDFJS_NOT_INSTALLED'
      : ocrRequested && (!tesseract || !canvas)
        ? 'OCR_DEPENDENCY_NOT_INSTALLED'
        : null
  };
}

async function loadPdf(pdf: Buffer, signal: AbortSignal) {
  if (signal.aborted) throw Object.assign(new Error('AbortError'), { name: 'AbortError' });
  const pdfjs = await dynamicImport('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({
    data: new Uint8Array(pdf),
    disableFontFace: true,
    isEvalSupported: false,
    useSystemFonts: false,
    stopEventLoop: true
  });
  const abort = () => task.destroy().catch(() => {});
  signal.addEventListener('abort', abort, { once: true });
  try { return await task.promise; }
  finally { signal.removeEventListener('abort', abort); }
}

async function pageNativeText(document: any, pageNumber: number) {
  const page = await document.getPage(pageNumber);
  const content = await page.getTextContent({ disableNormalization: false });
  return (content.items || [])
    .map((item: any) => typeof item?.str === 'string' ? item.str : '')
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function ocrPage(document: any, pageNumber: number, worker: any) {
  const { createCanvas } = await dynamicImport('@napi-rs/canvas');
  const page = await document.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1.75 });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const context = canvas.getContext('2d');
  await page.render({ canvasContext: context, viewport }).promise;
  const png = canvas.toBuffer('image/png');
  const result = await worker.recognize(png);
  return String(result?.data?.text || '').trim();
}

export function createPdfJsDocumentExtractor(source: RuntimeEnv = process.env): PdfTextExtractor | null {
  const capability = documentExtractorCapability(source);
  if (!capability.configured) return null;

  return {
    capability: () => ({
      configured: capability.configured,
      nativeText: capability.nativeText,
      ocr: capability.ocr,
      parserVersion: capability.parserVersion
    }),
    async extract(pdf: Buffer, signal: AbortSignal): Promise<ExtractionResult> {
      const document = await loadPdf(pdf, signal);
      try {
        const native: string[] = [];
        for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
          if (signal.aborted) throw Object.assign(new Error('AbortError'), { name: 'AbortError' });
          native.push(await pageNativeText(document, pageNumber));
        }
        const nativeText = native.join('\n').trim();
        if (nativeText.replace(/\s/g, '').length >= MIN_NATIVE_TEXT_CHARS) {
          return { text: nativeText, method: 'native_text', parserVersion: capability.parserVersion || 'pdfjs-dist', pageCount: document.numPages };
        }
        if (!capability.ocr) {
          throw Object.assign(new Error('HIPICO_DOCUMENT_OCR_NOT_CONFIGURED'), { code: 'HIPICO_DOCUMENT_OCR_NOT_CONFIGURED' });
        }
        if (document.numPages > OCR_MAX_PAGES) {
          throw Object.assign(new Error('HIPICO_DOCUMENT_OCR_PAGE_LIMIT'), { code: 'HIPICO_DOCUMENT_OCR_PAGE_LIMIT' });
        }
        const tesseract = await dynamicImport('tesseract.js');
        const language = String(source.HIPICO_DOCUMENT_OCR_LANGUAGE || 'spa+eng').trim();
        const worker = await tesseract.createWorker(language);
        try {
          const pages: string[] = [];
          for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
            if (signal.aborted) throw Object.assign(new Error('AbortError'), { name: 'AbortError' });
            pages.push(await ocrPage(document, pageNumber, worker));
          }
          return { text: pages.join('\n').trim(), method: 'ocr', parserVersion: `${capability.parserVersion}+tesseract.js:7`, pageCount: document.numPages };
        } finally {
          await worker.terminate();
        }
      } finally {
        await document.destroy();
      }
    }
  };
}
