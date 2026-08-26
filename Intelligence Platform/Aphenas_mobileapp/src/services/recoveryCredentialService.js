import {
  generateRecoveryPhrase,
  hashRecoveryPhrase,
} from './recoveryPhraseService.js';

import {
  createRecoveryCredential,
  findRecoveryCredentialByUserId,
} from '../models/recoveryCredentialModel.js';


/* =========================================
   ISSUE RECOVERY PHRASE
========================================= */

export async function issueRecoveryPhrase(
  userId
) {

  /*
    Prevent generating another phrase
    if this officer already has one.
  */

  const existingCredential =
    await findRecoveryCredentialByUserId(
      userId
    );


  if (existingCredential) {

    throw new Error(
      'Recovery phrase has already been issued for this officer.'
    );
  }


  /*
    Generate genuine 12-word mnemonic.
  */

  const phrase =
    generateRecoveryPhrase();


  /*
    Hash it using our server-side pepper.
  */

  const phraseHash =
    hashRecoveryPhrase(
      phrase
    );


  /*
    Store ONLY the hash.
  */

  const credential =
    await createRecoveryCredential({
      userId,
      phraseHash,
    });


  /*
    The plaintext phrase is returned only
    at the moment it is generated.

    It is NOT stored in PostgreSQL.
  */

  return {
    phrase,
    credential: {
      id: credential.id,
      userId: credential.user_id,
      generatedAt:
        credential.generated_at,
      confirmedAt:
        credential.confirmed_at,
      isActive:
        credential.is_active,
    },
  };
}