import {
  issueRecoveryPhrase,
} from '../services/recoveryCredentialService.js';


import {
  confirmRecoveryCredential,
} from '../models/recoveryCredentialModel.js';

import {
  findOfficerByUserId,
} from '../models/authModel.js';

import {
  createSessionPair,
} from '../services/sessionTokenService.js';
import { requestContext } from '../services/requestSecurityService.js';
import { writeAuditLog } from '../services/auditLogService.js';


import pool from '../config/db.js';




/* =========================================
   GENERATE RECOVERY PHRASE
========================================= */

export async function generateRecoveryPhrase(
  req,
  res
) {

  try {


    const userId =
      req.onboardingOfficer.userId;



    const result =
      await issueRecoveryPhrase(
        userId
      );

    return res.status(200).json({

      success: true,

      message:
        'Recovery phrase generated successfully.',


      recoveryPhrase:
        result.phrase,


      generatedAt:
        result.credential.generatedAt,

    });



  } catch (error) {


    console.error(
      'Recovery phrase generation error:',
      error
    );


    return res.status(400).json({

      success: false,

      message:
        error.message ||
        'Unable to generate recovery phrase.',

    });

  }

}







/* =========================================
   CONFIRM RECOVERY PHRASE
========================================= */

export async function confirmRecoveryPhrase(
  req,
  res
) {

  try {


    const userId =
      req.onboardingOfficer.userId;




    const credential =
      await confirmRecoveryCredential(
        userId
      );



    if (!credential) {

      return res.status(404).json({

        success:false,

        message:
          'Recovery credential not found.'

      });

    }




    /*
      Mark onboarding as completed
    */

    await pool.query(
      `
      UPDATE accounts_profile

      SET onboarding_completed = TRUE,
          updated_at = NOW()

      WHERE user_id = $1
      `,
      [
        userId
      ]
    );


    const officer =
      await findOfficerByUserId(
        userId
      );


    if (!officer) {

      return res.status(404).json({

        success:false,

        message:
          'Officer profile not found.'

      });

    }


    const context = requestContext(req);
    const sessionPair = await createSessionPair({
      userId: officer.user_id,
      serviceId: officer.service_id,
      role: officer.role,
      deviceId: context.deviceId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    await writeAuditLog({
      eventType: 'login_success',
      actorUserId: officer.user_id,
      targetUserId: officer.user_id,
      req,
      metadata: { nextStep: 'APP', sessionId: sessionPair.sessionId, source: 'recovery_confirm' },
    });




    return res.status(200).json({

      success:true,

      message:
        'Recovery phrase confirmed successfully.',


      confirmedAt:
        credential.confirmed_at,


      authToken:
        sessionPair.authToken,

      refreshToken:
        sessionPair.refreshToken,

      sessionId:
        sessionPair.sessionId,

      accessExpiresAt:
        sessionPair.accessExpiresAt,

      refreshExpiresAt:
        sessionPair.refreshExpiresAt,


      officer: {

        userId:
          officer.user_id,

        serviceId:
          officer.service_id,

        displayName:
          officer.display_name,

        secureId:
          officer.secure_id,

        rank:
          officer.rank_title,

        unit:
          officer.unit,

        role:
          officer.role,

        clearance:
          officer.clearance,

        hasChatPin:
          Boolean(officer.has_chat_pin),

      },

    });



  } catch(error) {


    console.error(
      'Recovery confirmation error:',
      error
    );


    return res.status(500).json({

      success:false,

      message:
        'Unable to confirm recovery phrase.'

    });

  }

}
