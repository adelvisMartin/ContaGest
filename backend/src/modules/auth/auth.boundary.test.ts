import test from 'node:test';
import assert from 'node:assert/strict';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { assertSupabaseBridgeConfiguration, classifyPresentedTokenAuthority } from '../../shared/auth/authBoundary.js';
import { JWT_AUDIENCE, JWT_ISSUER, signAccessToken, verifyAccessToken } from '../../shared/auth/jwt.js';

const testToken=(payload:Record<string,unknown>,options:SignOptions={})=>jwt.sign(payload,env.JWT_SECRET,{algorithm:'HS256',noTimestamp:true,...options});

test('ContaGest-looking token cannot verifier-hop to Supabase after backend verification failure',()=>{
  const forged=jwt.sign({sub:'attacker',tenantId:'tenant-b',email:'attacker@example.test',authMode:'backend-jwt',tokenType:'access'},'wrong-signature-secret-32-characters-min',{algorithm:'HS256',issuer:JWT_ISSUER,audience:JWT_AUDIENCE});
  assert.equal(classifyPresentedTokenAuthority(forged,{backendIssuer:JWT_ISSUER,supabaseBridgeEnabled:true}),'backend-jwt');
  assert.throws(()=>verifyAccessToken(forged));
});

test('Supabase bridge is opt-in and unknown tokens remain backend-owned when disabled',()=>{
  const external=testToken({iss:'https://project.supabase.co/auth/v1',sub:'provider-user'});
  assert.equal(classifyPresentedTokenAuthority(external,{backendIssuer:JWT_ISSUER,supabaseBridgeEnabled:false}),'backend-jwt');
  assert.equal(classifyPresentedTokenAuthority(external,{backendIssuer:JWT_ISSUER,supabaseBridgeEnabled:true}),'supabase');
});

test('Supabase bridge configuration fails closed when explicitly enabled but incomplete',()=>{
  assert.doesNotThrow(()=>assertSupabaseBridgeConfiguration({enabled:false}));
  assert.throws(()=>assertSupabaseBridgeConfiguration({enabled:true,url:'https://project.supabase.co',anonKey:''}),/SUPABASE_AUTH_BRIDGE_MISCONFIGURED/);
  assert.throws(()=>assertSupabaseBridgeConfiguration({enabled:true,url:'',anonKey:'anon'}),/SUPABASE_AUTH_BRIDGE_MISCONFIGURED/);
});

test('backend access token validates signature, issuer, audience, expiry and authority claims',()=>{
  const valid=signAccessToken({id:'user-1',email:'user-1@example.test'},'tenant-a','session-1');
  const claims=verifyAccessToken(valid);
  assert.equal(claims.sub,'user-1');
  assert.equal(claims.tenantId,'tenant-a');
  assert.equal(claims.authMode,'backend-jwt');
  assert.equal(claims.tokenType,'access');

  const base={sub:'user-1',tenantId:'tenant-a',email:'user-1@example.test',authMode:'backend-jwt',tokenType:'access'};
  assert.throws(()=>verifyAccessToken(testToken(base,{issuer:'wrong-issuer',audience:JWT_AUDIENCE,expiresIn:60})));
  assert.throws(()=>verifyAccessToken(testToken(base,{issuer:JWT_ISSUER,audience:'wrong-audience',expiresIn:60})));
  assert.throws(()=>verifyAccessToken(testToken(base,{issuer:JWT_ISSUER,audience:JWT_AUDIENCE,expiresIn:-1})));
  assert.throws(()=>verifyAccessToken(testToken(base,{issuer:JWT_ISSUER,audience:JWT_AUDIENCE})));
  assert.throws(()=>verifyAccessToken(testToken({...base,authMode:'other'},{issuer:JWT_ISSUER,audience:JWT_AUDIENCE,expiresIn:60})));
  assert.throws(()=>verifyAccessToken(testToken({...base,tokenType:'refresh'},{issuer:JWT_ISSUER,audience:JWT_AUDIENCE,expiresIn:60})));
});
