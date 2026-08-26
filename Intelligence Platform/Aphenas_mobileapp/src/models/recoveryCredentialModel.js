import pool from '../config/db.js';



/* =========================================
   CREATE RECOVERY CREDENTIAL
========================================= */

export async function createRecoveryCredential({
  userId,
  phraseHash,
}) {

  const result =
    await pool.query(
      `
        INSERT INTO accounts_recoverycredential (
          user_id,
          phrase_hash,
          generated_at,
          confirmed_at,
          revoked_at,
          is_active
        )

        VALUES (
          $1,
          $2,
          NOW(),
          NULL,
          NULL,
          TRUE
        )

        RETURNING
          id,
          user_id,
          generated_at,
          confirmed_at,
          is_active
      `,
      [
        userId,
        phraseHash,
      ]
    );


  return result.rows[0];

}




/* =========================================
   FIND RECOVERY CREDENTIAL BY USER
========================================= */

export async function findRecoveryCredentialByUserId(
  userId
) {

  const result =
    await pool.query(
      `
        SELECT
          id,
          user_id,
          phrase_hash,
          generated_at,
          confirmed_at,
          revoked_at,
          is_active

        FROM accounts_recoverycredential

        WHERE user_id = $1

        LIMIT 1
      `,
      [
        userId,
      ]
    );


  return result.rows[0] || null;

}




/* =========================================
   CONFIRM RECOVERY CREDENTIAL
========================================= */

export async function confirmRecoveryCredential(
  userId
) {

  const result =
    await pool.query(
      `
        UPDATE accounts_recoverycredential

        SET confirmed_at = NOW()

        WHERE user_id = $1
          AND is_active = TRUE
          AND revoked_at IS NULL

        RETURNING
          id,
          user_id,
          generated_at,
          confirmed_at,
          is_active
      `,
      [
        userId,
      ]
    );


  return result.rows[0] || null;

}