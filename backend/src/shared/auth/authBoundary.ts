import jwt, { type JwtPayload } from 'jsonwebtoken';

export type PresentedTokenAuthority = 'backend-jwt' | 'supabase';

type TokenAuthorityOptions = {
  backendIssuer: string;
  supabaseBridgeEnabled: boolean;
};

type UntrustedClaims = JwtPayload & {
  authMode?: unknown;
  tokenType?: unknown;
};

/**
 * Routes an already-presented bearer token to exactly one verifier.
 *
 * This function never authenticates the token. It only prevents verifier fallback:
 * a token that claims ContaGest authority is always verified by the ContaGest JWT
 * verifier and can never be retried against Supabase after a signature/claim failure.
 * Every selected verifier must still perform full cryptographic verification.
 */
export function classifyPresentedTokenAuthority(
  token: string,
  options: TokenAuthorityOptions
): PresentedTokenAuthority {
  let decoded: UntrustedClaims | null = null;
  try {
    decoded = jwt.decode(token) as UntrustedClaims | null;
  } catch {
    decoded = null;
  }

  const claimsBackendAuthority = decoded?.iss === options.backendIssuer
    || decoded?.authMode === 'backend-jwt'
    || decoded?.tokenType === 'access';

  if (claimsBackendAuthority) return 'backend-jwt';
  return options.supabaseBridgeEnabled ? 'supabase' : 'backend-jwt';
}

export function assertSupabaseBridgeConfiguration(input: {
  enabled: boolean;
  url?: string | null;
  anonKey?: string | null;
}) {
  if (!input.enabled) return;
  if (!String(input.url || '').trim() || !String(input.anonKey || '').trim()) {
    throw new Error('SUPABASE_AUTH_BRIDGE_MISCONFIGURED');
  }
}
