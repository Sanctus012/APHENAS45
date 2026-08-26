import 'dotenv/config';

/*
  Interim encryption-at-rest key rotation stub.

  Current Phase 2 uses server-held AES-256-GCM for message.content. True E2E
  encryption remains the target architecture: client-held keys, server never
  sees plaintext, and a revised wire protocol. Key rotation for this interim
  server-held model should:

  1. Start from a verified database backup.
  2. Configure OLD_MESSAGE_CONTENT_KEY and NEW_MESSAGE_CONTENT_KEY.
  3. Stream messages in small batches inside transactions.
  4. Decrypt each envelope with the old key and re-encrypt with the new key.
  5. Verify row counts and random samples before deploying the new key.

  This script intentionally exits until that operator flow is implemented and
  tested with production backup/restore procedures.
*/

console.error('Message content key rotation is not implemented yet. Follow the runbook in this file before production use.');
process.exit(1);
