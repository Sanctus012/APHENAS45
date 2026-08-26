import {
  findOfficerByServiceId,
  recordLoginFailure,
  resetLoginFailures,
  updateOfficerPassword,
} from '../models/authModel.js';

import {
  createOnboardingToken,
} from '../services/onboardingTokenService.js';

import {
  createSessionPair,
  refreshSession,
} from '../services/sessionTokenService.js';
import { writeAuditLog } from '../services/auditLogService.js';
import { requestContext } from '../services/requestSecurityService.js';

import {
  verifyDjangoPassword,
  hashDjangoPassword,
} from '../services/passwordService.js';



/* =========================================
   OFFICER LOGIN
========================================= */

export async function loginOfficer(
  req,
  res
) {
  try {

    const {
      serviceId,
      password,
      deviceId,
    } = req.body;



    /* =========================================
       VALIDATE INPUT
    ========================================= */

    if (
      typeof serviceId !== 'string' ||
      typeof password !== 'string' ||
      typeof deviceId !== 'string' ||
      !serviceId.trim() ||
      !password ||
      !deviceId.trim()
    ) {

      return res.status(400).json({

        success: false,

        message:
          'Service ID, password, and device identifier are required.',

      });

    }



    const normalizedServiceId =
      serviceId.trim();



    /* =========================================
       FIND OFFICER
    ========================================= */

    const officer =
      await findOfficerByServiceId(
        normalizedServiceId
      );



    if (!officer) {
      await writeAuditLog({
        eventType: 'login_failure',
        req,
        metadata: { serviceId: normalizedServiceId, reason: 'unknown_service_id' },
      });

      return res.status(401).json({

        success: false,

        message:
          'Invalid Service ID or password.',

      });

    }




    /* =========================================
       CHECK ACCOUNT STATUS
    ========================================= */

    if (
      officer.locked_until &&
      new Date(officer.locked_until) > new Date()
    ) {
      await writeAuditLog({
        eventType: 'login_locked_rejected',
        targetUserId: officer.user_id,
        req,
      });
      return res.status(423).json({
        success: false,
        message: 'Account is temporarily locked. Try again later.',
      });
    }


    if (
      !officer.is_active ||
      officer.status !== 'active'
    ) {

      return res.status(403).json({

        success: false,

        message:
          'This account is not active.',

      });

    }




    /* =========================================
       VERIFY PASSWORD
    ========================================= */

    const passwordValid =
      verifyDjangoPassword(
        password,
        officer.password
      );



    if (!passwordValid) {
      const failure = await recordLoginFailure(officer.user_id);
      await writeAuditLog({
        eventType: failure?.locked_until ? 'account_locked' : 'login_failure',
        targetUserId: officer.user_id,
        req,
        metadata: { failedAttempts: failure?.failed_attempts || null },
      });

      return res.status(401).json({

        success:false,

        message:
          'Invalid Service ID or password.',

      });

    }

    await resetLoginFailures(officer.user_id);




    /* =========================================
       FIRST LOGIN
       TEMPORARY PASSWORD MUST CHANGE
    ========================================= */

    if (
      officer.must_change_password
    ) {


      const onboardingToken =
        createOnboardingToken({

          userId:
            officer.user_id,

          serviceId:
            officer.service_id,

        });



      await writeAuditLog({
        eventType: 'login_success',
        actorUserId: officer.user_id,
        targetUserId: officer.user_id,
        req,
        metadata: { nextStep: 'CHANGE_PASSWORD' },
      });

      return res.status(200).json({

        success:true,

        credentialsVerified:true,

        nextStep:
          'CHANGE_PASSWORD',

        onboardingToken,


        officer: {

          userId:
            officer.user_id,

          serviceId:
            officer.service_id,

          displayName:
            officer.display_name,

          secureId:
            officer.secure_id,

          role:
            officer.role,

          hasChatPin:
            Boolean(officer.has_chat_pin),

        },

      });

    }




    /* =========================================
       PROFILE / ONBOARDING NOT COMPLETE
    ========================================= */

    if (
      !officer.onboarding_completed
    ) {
      await writeAuditLog({
        eventType: 'login_success',
        actorUserId: officer.user_id,
        targetUserId: officer.user_id,
        req,
        metadata: { nextStep: 'COMPLETE_PROFILE' },
      });


      return res.status(200).json({

        success:true,

        credentialsVerified:true,

        nextStep:
          'COMPLETE_PROFILE',


        officer: {

          userId:
            officer.user_id,

          serviceId:
            officer.service_id,

          displayName:
            officer.display_name,

          secureId:
            officer.secure_id,

          role:
            officer.role,

          hasChatPin:
            Boolean(officer.has_chat_pin),

        },

      });

    }




    /* =========================================
       ACCOUNT READY FOR APPLICATION
    ========================================= */


    const context = requestContext(req);
    const sessionPair = await createSessionPair({
      userId: officer.user_id,
      serviceId: officer.service_id,
      role: officer.role,
      deviceId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    await writeAuditLog({
      eventType: 'login_success',
      actorUserId: officer.user_id,
      targetUserId: officer.user_id,
      req,
      metadata: { nextStep: 'APP', sessionId: sessionPair.sessionId },
    });

    return res.status(200).json({

      success:true,

      credentialsVerified:true,

      nextStep:
        'APP',

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
      'Officer login error:',
      error
    );


    return res.status(500).json({

      success:false,

      message:
        'Unable to process login.',

    });

  }

}

export async function refreshOfficerSession(req, res) {
  try {
    const context = requestContext(req);
    const sessionPair = await refreshSession({
      refreshToken: req.body?.refreshToken,
      deviceId: req.body?.deviceId || context.deviceId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
    await writeAuditLog({
      eventType: 'session_refresh',
      req,
      targetType: 'session',
      targetId: sessionPair.sessionId,
    });
    return res.json({ success: true, ...sessionPair });
  } catch (error) {
    return res.status(Number(error.statusCode) || 401).json({
      success: false,
      message: error.message || 'Unable to refresh session',
    });
  }
}





/* =========================================
   FORCED FIRST-LOGIN PASSWORD CHANGE
========================================= */

export async function changeInitialPassword(
  req,
  res
) {

  try {


    const {
      currentPassword,
      newPassword,
    } = req.body;



    const serviceId =
      req.onboardingOfficer.serviceId;



    if (
      typeof currentPassword !== 'string' ||
      typeof newPassword !== 'string' ||
      !currentPassword ||
      !newPassword
    ) {

      return res.status(400).json({

        success:false,

        message:
          'Current password and new password are required.',

      });

    }



    const normalizedServiceId =
      serviceId.trim();




    if (
      newPassword.length < 8
    ) {

      return res.status(400).json({

        success:false,

        message:
          'New password must contain at least 8 characters.',

      });

    }




    if (
      newPassword === currentPassword
    ) {

      return res.status(400).json({

        success:false,

        message:
          'New password must be different from temporary password.',

      });

    }




    const officer =
      await findOfficerByServiceId(
        normalizedServiceId
      );



    if (!officer) {

      return res.status(401).json({

        success:false,

        message:
          'Invalid Service ID or password.',

      });

    }




    const currentPasswordValid =
      verifyDjangoPassword(
        currentPassword,
        officer.password
      );



    if (!currentPasswordValid) {

      return res.status(401).json({

        success:false,

        message:
          'Invalid Service ID or password.',

      });

    }




    if (
      !officer.must_change_password
    ) {

      return res.status(409).json({

        success:false,

        message:
          'Initial password change already completed.',

      });

    }




    const newPasswordHash =
      hashDjangoPassword(
        newPassword
      );




    const result =
      await updateOfficerPassword({

        userId:
          officer.user_id,

        passwordHash:
          newPasswordHash,

      });




    return res.status(200).json({

      success:true,

      message:
        'Password changed successfully.',


      nextStep:
        'COMPLETE_PROFILE',


      officer: {

        userId:
          result.profile.user_id,


        serviceId:
          result.profile.service_id,


        displayName:
          result.profile.display_name,

        secureId:
          result.profile.secure_id,

        role:
          result.profile.role,

        mustChangePassword:
          result.profile.must_change_password,


        onboardingCompleted:
          result.profile.onboarding_completed,

        hasChatPin:
          false,

      },

    });



  } catch(error) {


    console.error(
      'Initial password change error:',
      error
    );


    return res.status(500).json({

      success:false,

      message:
        'Unable to change password.',

    });

  }

}
