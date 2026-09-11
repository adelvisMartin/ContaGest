import { execFile, spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { PdfTextExtractor, ExtractionResult } from './document-engine.js';

const execFileAsync = promisify(execFile);
const MIN_NATIVE_TEXT_CHARS = 32;
const OCR_MAX_PAGES = 40;
const MAX_TOOL_OUTPUT = 12 * 1024 * 1024;
const TOOL_TIMEOUT_MS = 30_000;

type RuntimeEnv = Record<string, string | undefined>;

function enabled(source: RuntimeEnv, name: string) {
  return String(source[name] || '').trim().toLowerCase() === 'true';
}

function binaryAvailable(command: string, args: string[]) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 2500, windowsHide: true });
  return !result.error && (result.status === 0 || result.status === 1);
}

function firstVersionLine(command: string, args: string[]) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 2500, windowsHide: true });
  const text = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
  return text.split(/\r?\n/).find(Boolean)?.trim().slice(0, 120) || command;
}

function ocrLanguage(source: RuntimeEnv) {
  const value = String(source.HIPICO_DOCUMENT_OCR_LANGUAGE || 'eng').trim().toLowerCase();
  if (!/^[a-z]{3}(?:\+[a-z]{3})*$/.test(value)) {
    throw Object.assign(new Error('HIPICO_DOCUMENT_OCR_LANGUAGE_INVALID'), { code: 'HIPICO_DOCUMENT_OCR_LANGUAGE_INVALID' });
  }
  return value;
}

export function documentExtractorCapability(source: RuntimeEnv = process.env) {
  const pdftotext = binaryAvailable('pdftotext', ['-v']);
  const pdfinfo = binaryAvailable('pdfinfo', ['-v']);
  const nativeText = pdftotext && pdfinfo;
  const ocrRequested = enabled(source, 'HIPICO_DOCUMENT_OCR_ENABLED');
  const pdftoppm = binaryAvailable('pdftoppm', ['-v']);
  const tesseract = binaryAvailable('tesseract', ['--version']);
  const ocr = nativeText && ocrRequested && pdftoppm && tesseract;
  return {
    configured: nativeText,
    nativeText,
    ocr,
    parserVersion: nativeText ? `${firstVersionLine('pdftotext', ['-v'])}; ${firstVersionLine('pdfinfo', ['-v'])}` : null,
    reason: !nativeText
      ? 'POPPLER_NOT_INSTALLED'
      : ocrRequested && (!pdftoppm || !tesseract)
        ? 'OCR_RUNTIME_NOT_INSTALLED'
        : null
  };
}

function toolOptions(signal: AbortSignal) {
  return {
    encoding: 'utf8' as const,
    maxBuffer: MAX_TOOL_OUTPUT,
    timeout: TOOL_TIMEOUT_MS,
    signal,
    windowsHide: true,
    env: { ...process.env, LC_ALL: 'C', LANG: 'C' }
  };
}

async function pageCount(pdfPath: string, signal: AbortSignal) {
  const { stdout } = await execFileAsync('pdfinfo', [pdfPath], toolOptions(signal));
  const pages = Number(String(stdout).match(/^Pages:\s+(\d+)\s*$/mi)?.[1] || 0);
  if (!Number.isInteger(pages) || pages < 1) {
    throw Object.assign(new Error('HIPICO_DOCUMENT_PAGE_COUNT_FAILED'), { code: 'HIPICO_DOCUMENT_PAGE_COUNT_FAILED' });
  }
  return pages;
}

async function nativeText(pdfPath: string, signal: AbortSignal) {
  const { stdout } = await execFileAsync('pdftotext', ['-layout', '-enc', 'UTF-8', pdfPath, '-'], toolOptions(signal));
  return String(stdout || '').replace(/\u0000/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

async function ocrPdf(pdfPath: string, pages: number, language: string, directory: string, signal: AbortSignal) {
  if (pages > OCR_MAX_PAGES) {
    throw Object.assign(new Error('HIPICO_DOCUMENT_OCR_PAGE_LIMIT'), { code: 'HIPICO_DOCUMENT_OCR_PAGE_LIMIT' });
  }
  const output: string[] = [];
  for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) {
    if (signal.aborted) throw Object.assign(new Error('AbortError'), { name: 'AbortError' });
    const prefix = path.join(directory, `page-${pageNumber}`);
    await execFileAsync('pdftoppm', ['-f', String(pageNumber), '-singlefile', '-png', '-r', '160', pdfPath, prefix], toolOptions(signal));
    const imagePath = `${prefix}.png`;
    const { stdout } = await execFileAsync('tesseract', [imagePath, 'stdout', '-l', language, '--psm', '6'], toolOptions(signal));
    output.push(String(stdout || '').replace(/\u0000/g, '').trim());
    await fs.rm(imagePath, { force: true });
  }
  return output.join('\n').trim();
}

function normalizeToolError(error: any) {
  if (error?.name === 'AbortError') return Object.assign(new Error('AbortError'), { name: 'AbortError' });
  if (error?.killed || error?.signal === 'SIGTERM' || error?.code === 'ETIMEDOUT') {
    return Object.assign(new Error('HIPICO_DOCUMENT_TOOL_TIMEOUT'), { code: 'HIPICO_DOCUMENT_TOOL_TIMEOUT' });
  }
  return error;
}

export function createPdfJsDocumentExtractor(source: RuntimeEnv = process.env): PdfTextExtractor | null {
  const capability = documentExtractorCapability(source);
  if (!capability.configured) return null;

  return {
    capability: () => ({ configured: capability.configured, nativeText: capability.nativeText, ocr: capability.ocr, parserVersion: capability.parserVersion }),
    async extract(pdf: Buffer, signal: AbortSignal): Promise<ExtractionResult> {
      const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'hipico-pdf-'));
      const pdfPath = path.join(directory, 'document.pdf');
      try {
        await fs.writeFile(pdfPath, pdf, { flag: 'wx', mode: 0o600 });
        const pages = await pageCount(pdfPath, signal);
        const text = await nativeText(pdfPath, signal);
        if (text.replace(/\s/g, '').length >= MIN_NATIVE_TEXT_CHARS) {
          return { text, method: 'native_text', parserVersion: capability.parserVersion || 'poppler', pageCount: pages };
        }
        if (!capability.ocr) {
          throw Object.assign(new Error('HIPICO_DOCUMENT_OCR_NOT_CONFIGURED'), { code: 'HIPICO_DOCUMENT_OCR_NOT_CONFIGURED' });
        }
        const language = ocrLanguage(source);
        const extracted = await ocrPdf(pdfPath, pages, language, directory, signal);
        return {
          text: extracted,
          method: 'ocr',
          parserVersion: `${capability.parserVersion || 'poppler'}; ${firstVersionLine('tesseract', ['--version'])}`,
          pageCount: pages
        };
      } catch (error) {
        throw normalizeToolError(error);
      } finally {
        await fs.rm(directory, { recursive: true, force: true });
      }
    }
  };
}
