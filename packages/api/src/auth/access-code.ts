import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';

function scrypt(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: { N: number; r: number; p: number },
) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}
const SCRYPT_PARAMETERS = { N: 16_384, r: 8, p: 1, keyLength: 64 } as const;

export async function createAccessCodeHash(accessCode: string) {
  const salt = randomBytes(16);
  const derived = await scrypt(accessCode.normalize('NFKC'), salt, SCRYPT_PARAMETERS.keyLength, {
    N: SCRYPT_PARAMETERS.N,
    r: SCRYPT_PARAMETERS.r,
    p: SCRYPT_PARAMETERS.p,
  });

  return [
    'scrypt',
    SCRYPT_PARAMETERS.N,
    SCRYPT_PARAMETERS.r,
    SCRYPT_PARAMETERS.p,
    salt.toString('hex'),
    derived.toString('hex'),
  ].join('$');
}

export async function verifyAccessCode(accessCode: string, storedHash: string) {
  const parts = storedHash.trim().split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = Buffer.from(parts[4], 'hex');
  const expected = Buffer.from(parts[5], 'hex');

  if (
    !Number.isSafeInteger(N) ||
    !Number.isSafeInteger(r) ||
    !Number.isSafeInteger(p) ||
    N < 16_384 ||
    r < 8 ||
    p < 1 ||
    salt.length < 16 ||
    expected.length < 32
  ) {
    return false;
  }

  const derived = await scrypt(accessCode.normalize('NFKC'), salt, expected.length, {
    N,
    r,
    p,
  });

  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
