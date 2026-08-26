import crypto from 'crypto';


/* =========================================
   VERIFY DJANGO PASSWORD
========================================= */

export function verifyDjangoPassword(
  plainPassword,
  encodedPassword
) {
  try {
    if (
      !plainPassword ||
      !encodedPassword ||
      encodedPassword.startsWith('!')
    ) {
      return false;
    }

    const parts =
      encodedPassword.split('$');

    if (parts.length !== 4) {
      return false;
    }

    const [
      algorithm,
      iterationsString,
      salt,
      expectedHash,
    ] = parts;

    if (algorithm !== 'pbkdf2_sha256') {
      return false;
    }

    const iterations =
      Number(iterationsString);

    if (
      !Number.isInteger(iterations) ||
      iterations <= 0
    ) {
      return false;
    }

    const calculatedHash =
      crypto.pbkdf2Sync(
        plainPassword,
        salt,
        iterations,
        32,
        'sha256'
      );

    const expectedBuffer =
      Buffer.from(
        expectedHash,
        'base64'
      );

    if (
      expectedBuffer.length !==
      calculatedHash.length
    ) {
      return false;
    }

    return crypto.timingSafeEqual(
      expectedBuffer,
      calculatedHash
    );

  } catch (error) {
    return false;
  }
}


/* =========================================
   CREATE DJANGO-COMPATIBLE PASSWORD
========================================= */

export function hashDjangoPassword(
  plainPassword
) {
  if (
    typeof plainPassword !== 'string' ||
    !plainPassword
  ) {
    throw new Error(
      'Password is required'
    );
  }

  const algorithm =
    'pbkdf2_sha256';

  const iterations =
    1000000;

  const salt =
    crypto
      .randomBytes(16)
      .toString('base64url');

  const hash =
    crypto.pbkdf2Sync(
      plainPassword,
      salt,
      iterations,
      32,
      'sha256'
    ).toString('base64');

  return [
    algorithm,
    iterations,
    salt,
    hash,
  ].join('$');
}