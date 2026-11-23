import * as jose from 'jose';
import { PayloadSchema, type Payload } from '@owox/idp-protocol';

export async function signAccessToken(
  payload: Payload,
  secret: string,
  expiresInSeconds: number
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new jose.SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${expiresInSeconds}s`)
    .setIssuer('owox-one-os')
    .sign(key);
}

export async function verifyAccessToken(token: string, secret: string): Promise<Payload | null> {
  try {
    const key = new TextEncoder().encode(secret);
    const { payload } = await jose.jwtVerify(token, key, { issuer: 'owox-one-os' });
    const parsed = PayloadSchema.safeParse(payload);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}