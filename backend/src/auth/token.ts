import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const createToken = () => randomBytes(32).toString('base64url');
export const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

export function tokensEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}
