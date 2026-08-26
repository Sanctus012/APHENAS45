import crypto from 'crypto';
import pool from '../config/db.js';


/* =========================================
   FIND OFFICER BY SERVICE ID
========================================= */

export async function findOfficerByServiceId(
  serviceId
) {
  const query = `
    SELECT
      u.id AS user_id,
      u.username,
      u.password,
      u.email,
      u.is_active,
      u.last_login,
      u.failed_attempts,
      u.locked_until,

      p.id AS profile_id,
      p.service_id,
      p.secure_id,
      p.display_name,
      p.rank_title,
      p.unit,
      p.role,
      p.clearance,
      p.status,
      p.biometric_required,
      p.enrollment_permitted,
      p.must_change_password,
      p.onboarding_completed,
      cs.user_id IS NOT NULL AS has_chat_pin

    FROM auth_user u

    INNER JOIN accounts_profile p
      ON p.user_id = u.id

    LEFT JOIN chat_settings cs
      ON cs.user_id = u.id

    WHERE LOWER(p.service_id) =
          LOWER($1)

    LIMIT 1
  `;

  const result = await pool.query(
    query,
    [serviceId]
  );

  return result.rows[0] || null;
}

export async function findOfficerByUserId(userId) {
  const result = await pool.query(
    `
    SELECT
      u.id AS user_id,
      u.username,
      u.is_active,
      u.failed_attempts,
      u.locked_until,
      p.service_id,
      p.secure_id,
      p.display_name,
      p.rank_title,
      p.unit,
      p.role,
      p.clearance,
      p.status,
      p.must_change_password,
      p.onboarding_completed,
      cs.user_id IS NOT NULL AS has_chat_pin
    FROM auth_user u
    INNER JOIN accounts_profile p ON p.user_id = u.id
    LEFT JOIN chat_settings cs ON cs.user_id = u.id
    WHERE u.id = $1
    LIMIT 1
    `,
    [userId]
  );

  return result.rows[0] || null;
}


/* =========================================
   GENERATE SECURE ID
========================================= */

function generateSecureId() {
  const raw =
    crypto
      .randomBytes(4)
      .toString('hex')
      .toUpperCase();

  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

export async function generateAvailableSecureId(client = pool) {
  let secureId;
  let secureIdAvailable = false;

  while (!secureIdAvailable) {
    secureId = generateSecureId();

    const existing = await client.query(
      `
      SELECT id
      FROM accounts_profile
      WHERE secure_id = $1
      LIMIT 1
      `,
      [secureId]
    );

    secureIdAvailable = existing.rowCount === 0;
  }

  return secureId;
}


/* =========================================
   CREATE OFFICER ACCOUNT
========================================= */

export async function createOfficerAccount({
  serviceId,
  passwordHash,
  displayName = '',
  rankTitle = '',
  unit = '',
  role = 'user',
  clearance = 'standard',
  mustChangePassword = true,
  onboardingCompleted = false,
  secureId = '',
}) {
  const client =
    await pool.connect();

  try {
    await client.query('BEGIN');


    /* =========================================
       CREATE AUTH USER
    ========================================= */

    const userResult =
      await client.query(
        `
        INSERT INTO auth_user (
          password,
          last_login,
          is_superuser,
          username,
          first_name,
          last_name,
          email,
          is_staff,
          is_active,
          date_joined
        )
        VALUES (
          $1,
          NULL,
          FALSE,
          $2,
          '',
          '',
          '',
          $3,
          TRUE,
          NOW()
        )
        RETURNING
          id,
      username,
      is_active,
      failed_attempts,
      locked_until
        `,
        [
          passwordHash,
          serviceId,
          role === 'admin',
        ]
      );

    const user =
      userResult.rows[0];


    /* =========================================
       GENERATE UNIQUE SECURE ID
    ========================================= */

    const normalizedSecureId = String(secureId || '').trim().toUpperCase();

    if (normalizedSecureId) {
      if (!/^[A-F0-9]{4}-[A-F0-9]{4}$/.test(normalizedSecureId)) {
        const error = new Error('Secure ID format is invalid');
        error.code = 'APHENAS_SECURE_ID_FORMAT';
        throw error;
      }

      const existing =
        await client.query(
          `
          SELECT id
          FROM accounts_profile
          WHERE secure_id = $1
          LIMIT 1
          `,
          [normalizedSecureId]
        );

      if (existing.rowCount > 0) {
        const error = new Error('Secure ID already exists');
        error.code = 'APHENAS_SECURE_ID_DUPLICATE';
        throw error;
      }
    }

    const assignedSecureId =
      normalizedSecureId || await generateAvailableSecureId(client);


    /* =========================================
       CREATE OFFICER PROFILE
    ========================================= */

    const profileResult =
      await client.query(
        `
        INSERT INTO accounts_profile (
          service_id,
          secure_id,
          display_name,
          rank_title,
          unit,
          role,
          clearance,
          status,
          public_identity_key,
          created_at,
          updated_at,
          user_id,
          biometric_required,
          enrollment_permitted,
          -- Vestigial column from removed MFA. Keep false until a schema migration drops it.
          otp_required,
          must_change_password,
          onboarding_completed
        )
        VALUES (
          $1,
          $2,
          $4,
          $5,
          $6,
          $7,
          $8,
          'active',
          '',
          NOW(),
          NOW(),
          $3,
          FALSE,
          FALSE,
          TRUE,
          $9,
          $10
        )
        RETURNING
          id,
          service_id,
          secure_id,
          display_name,
          rank_title,
          unit,
          role,
          clearance,
          status,
          must_change_password,
          onboarding_completed
        `,
        [
          serviceId,
          assignedSecureId,
          user.id,
          displayName || serviceId,
          rankTitle,
          unit,
          role,
          clearance,
          mustChangePassword,
          onboardingCompleted,
        ]
      );


    await client.query('COMMIT');


    return {
      user,
      profile:
        profileResult.rows[0],
    };

  } catch (error) {

    await client.query('ROLLBACK');

    throw error;

  } finally {

    client.release();

  }
}


/* =========================================
   UPDATE OFFICER PASSWORD
========================================= */

export async function updateOfficerPassword({
  userId,
  passwordHash,
}) {
  const client =
    await pool.connect();

  try {
    await client.query('BEGIN');


    /* =========================================
       UPDATE PASSWORD
    ========================================= */

    const userResult =
      await client.query(
        `
        UPDATE auth_user

        SET password = $1

        WHERE id = $2

        RETURNING
          id,
          username,
          is_active
        `,
        [
          passwordHash,
          userId,
        ]
      );


    if (userResult.rowCount === 0) {
      throw new Error(
        'Officer account not found'
      );
    }


    /* =========================================
       REMOVE FIRST-LOGIN PASSWORD FLAG
    ========================================= */

    const profileResult =
      await client.query(
        `
        UPDATE accounts_profile

        SET
          must_change_password = FALSE,
          updated_at = NOW()

        WHERE user_id = $1

        RETURNING
          user_id,
          service_id,
          secure_id,
          display_name,
          role,
          must_change_password,
          onboarding_completed
        `,
        [userId]
      );


    if (profileResult.rowCount === 0) {
      throw new Error(
        'Officer profile not found'
      );
    }


    await client.query('COMMIT');


    return {
      user:
        userResult.rows[0],

      profile:
        profileResult.rows[0],
    };

  } catch (error) {

    await client.query('ROLLBACK');

    throw error;

  } finally {

    client.release();

  }
}

export async function recordLoginFailure(userId, maxAttempts = 5, cooldownMinutes = 15) {
  if (!userId) return null;
  const result = await pool.query(
    `UPDATE auth_user
        SET failed_attempts = failed_attempts + 1,
            locked_until = CASE
              WHEN failed_attempts + 1 >= $2 THEN NOW() + ($3 || ' minutes')::interval
              ELSE locked_until
            END
      WHERE id = $1
      RETURNING id, failed_attempts, locked_until`,
    [userId, maxAttempts, cooldownMinutes]
  );
  return result.rows[0] || null;
}

export async function resetLoginFailures(userId) {
  if (!userId) return null;
  const result = await pool.query(
    `UPDATE auth_user
        SET failed_attempts = 0,
            locked_until = NULL,
            last_login = NOW()
      WHERE id = $1
      RETURNING id, failed_attempts, locked_until`,
    [userId]
  );
  return result.rows[0] || null;
}
