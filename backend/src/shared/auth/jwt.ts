import jwt, { type JwtPayload } from 'jsonwebtoken';
import { env } from '../../config/env.js';

export const JWT_ISSUER = 'contagest-api';
export const JWT_AUDIENCE = 'contagest-web';
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

export type ContaGestAccessClaims = JwtPayload & {
  sub: string;
  tenantId: string;
  email: string;
  authMode: 'backend-jwt';
  tokenType: 'access';
  sid?: string;
};

export function signAccessToken(user: { id: string; email: string }, tenantId: string, sessionId?: string) {
  return jwt.sign(
    {
      sub: user.id,
      tenantId,
      email: user.email,
      authMode: 'backend-jwt',
      tokenType: 'access',
      ...(sessionId ? { sid:sessionId } : {})
    },
    env.JWT_SECRET,
    {
      algorithm: 'HS256',
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS
    }
  );
}

export function verifyAccessToken(token: string): ContaGestAccessClaims {
  const decoded = jwt.verify(token, env.JWT_SECRET, {
    algorithms: ['HS256'],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE
  }) as ContaGestAccessClaims;

  if (!decoded?.sub || !decoded?.tenantId || decoded.tokenType !== 'access') {
    throw new Error('JWT de acceso incompleto.');
  }
  return decoded;
}

export function tokenExpiresAt(token: string) {
  const decoded = jwt.decode(token) as JwtPayload | null;
  return decoded?.exp ? decoded.exp * 1000 : Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000;
}
