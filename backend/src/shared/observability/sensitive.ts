import { sanitizeLogValue } from './logger.js';

const INLINE_SENSITIVE_PATTERNS = [
  /\bbearer\s+[^\s,;]+/gi,
  /\b(?:authorization|cookie|password|passphrase|token|secret|api[-_]?key|clientsecret|smtp(?:pass(?:word)?)?|session|signed[-_]?url)\s*[:=]\s*[^\s,;]+/gi,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  /\b[VEJPG]-?\d{5,}(?:-\d)?\b/gi,
  /(?:^|\s)\+?\d[\d\s().-]{7,}\d(?=$|\s)/g
];

export function redactSensitiveText(value: unknown, maxLength = 240) {
  let output = sanitizeLogValue(value, maxLength);
  for (const pattern of INLINE_SENSITIVE_PATTERNS) {
    output = output.replace(pattern, (match) => match.startsWith(' ') ? ' [REDACTED]' : '[REDACTED]');
  }
  return output;
}

export const __test__ = { INLINE_SENSITIVE_PATTERNS };
