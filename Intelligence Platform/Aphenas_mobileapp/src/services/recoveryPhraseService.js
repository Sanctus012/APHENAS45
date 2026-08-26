import 'dotenv/config';
import crypto from 'crypto';
import {
  generateMnemonic,
  validateMnemonic,
} from '@scure/bip39';

import {
  wordlist,
} from '@scure/bip39/wordlists/english.js';


/* =========================================
   GENERATE 12-WORD RECOVERY PHRASE
========================================= */

export function generateRecoveryPhrase() {

  /*
    128-bit strength produces
    a standard 12-word BIP-39 mnemonic.
  */

  return generateMnemonic(
    wordlist,
    128
  );
}


/* =========================================
   NORMALIZE RECOVERY PHRASE
========================================= */

export function normalizeRecoveryPhrase(
  phrase
) {

  return String(
    phrase || ''
  )
    .normalize('NFKD')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}


/* =========================================
   VALIDATE RECOVERY PHRASE
========================================= */

export function isValidRecoveryPhrase(
  phrase
) {

  const normalized =
    normalizeRecoveryPhrase(
      phrase
    );


  return validateMnemonic(
    normalized,
    wordlist
  );
}


/* =========================================
   SPLIT INTO WORDS
========================================= */

export function recoveryPhraseToWords(
  phrase
) {

  const normalized =
    normalizeRecoveryPhrase(
      phrase
    );


  if (
    !isValidRecoveryPhrase(
      normalized
    )
  ) {

    throw new Error(
      'Invalid recovery phrase'
    );
  }


  return normalized.split(' ');
}
/* =========================================
   HASH RECOVERY PHRASE
========================================= */

/* =========================================
   HASH RECOVERY PHRASE
   Uses server-side pepper
========================================= */

export function hashRecoveryPhrase(
  phrase
) {
  const normalized =
    normalizeRecoveryPhrase(
      phrase
    );

  const pepper =
    process.env.RECOVERY_PHRASE_PEPPER;


  if (!pepper) {
    throw new Error(
      'RECOVERY_PHRASE_PEPPER is not configured'
    );
  }


  return crypto
    .createHmac(
      'sha256',
      pepper
    )
    .update(normalized)
    .digest('hex');
}


/* =========================================
   VERIFY RECOVERY PHRASE AGAINST HASH
========================================= */

export function verifyRecoveryPhrase(
  phrase,
  storedHash
) {
  if (!phrase || !storedHash) {
    return false;
  }

  const calculatedHash =
    hashRecoveryPhrase(
      phrase
    );

  const calculatedBuffer =
    Buffer.from(
      calculatedHash,
      'hex'
    );

  const storedBuffer =
    Buffer.from(
      storedHash,
      'hex'
    );

  if (
    calculatedBuffer.length !==
    storedBuffer.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    calculatedBuffer,
    storedBuffer
  );
}