import {
  createOfficerAccount,
  generateAvailableSecureId,
} from '../models/authModel.js';

import {
  hashDjangoPassword,
} from '../services/passwordService.js';
import { writeAuditLog } from '../services/auditLogService.js';


export async function provisionOfficer(req, res) {
  try {
    const {
      serviceId,
      temporaryPassword,
      displayName,
      rankTitle,
      unit,
      clearance,
      secureId,
    } = req.body;


    /* =========================================
       VALIDATE INPUT
    ========================================= */

    if (
      typeof serviceId !== 'string' ||
      typeof temporaryPassword !== 'string' ||
      !serviceId.trim() ||
      !temporaryPassword
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Service ID and temporary password are required.',
      });
    }


    const normalizedServiceId =
      serviceId.trim().toUpperCase();


    if (normalizedServiceId.length > 32) {
      return res.status(400).json({
        success: false,
        message:
          'Service ID must not exceed 32 characters.',
      });
    }


    if (temporaryPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message:
          'Temporary password must contain at least 8 characters.',
      });
    }


    /* =========================================
       HASH TEMPORARY PASSWORD
    ========================================= */

    const passwordHash =
      hashDjangoPassword(
        temporaryPassword
      );


    /* =========================================
       CREATE OFFICER ACCOUNT
    ========================================= */

    const result =
      await createOfficerAccount({
        serviceId:
          normalizedServiceId,

        passwordHash,
        displayName:
          typeof displayName === 'string' ? displayName.trim() : '',
        rankTitle:
          typeof rankTitle === 'string' ? rankTitle.trim() : '',
        unit:
          typeof unit === 'string' ? unit.trim() : '',
        clearance:
          typeof clearance === 'string' && clearance.trim() ? clearance.trim() : 'standard',
        secureId:
          typeof secureId === 'string' ? secureId.trim().toUpperCase() : '',
        role:
          'user',
        mustChangePassword:
          true,
        onboardingCompleted:
          false,
      });

    await writeAuditLog({
      eventType: 'admin_provision_officer',
      actorUserId: req.adminOfficer?.user_id || req.user?.id || null,
      targetUserId: result.user.id,
      targetType: 'officer',
      targetId: result.profile.service_id,
      req,
      metadata: { role: result.profile.role, clearance: result.profile.clearance },
    });


    return res.status(201).json({
      success: true,

      message:
        'Officer account provisioned successfully.',

      officer: {
        userId:
          result.user.id,

        serviceId:
          result.profile.service_id,

        secureId:
          result.profile.secure_id,
        watermarkId:
          result.profile.secure_id,

        displayName:
          result.profile.display_name,

        rank:
          result.profile.rank_title,

        unit:
          result.profile.unit,

        clearance:
          result.profile.clearance,

        status:
          result.profile.status,

        mustChangePassword:
          result.profile.must_change_password,

        onboardingCompleted:
          result.profile.onboarding_completed,
      },
    });

  } catch (error) {

    /*
      PostgreSQL unique violation.
      Handles duplicate Service ID / username.
    */
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        message:
          'An officer with this Service ID already exists.',
      });
    }

    if (error.code === 'APHENAS_SECURE_ID_DUPLICATE') {
      return res.status(409).json({
        success: false,
        message:
          'This generated Watermark ID was already used. Generate another ID and try again.',
      });
    }

    if (error.code === 'APHENAS_SECURE_ID_FORMAT') {
      return res.status(400).json({
        success: false,
        message:
          'Watermark ID format is invalid.',
      });
    }


    console.error(
      'Officer provisioning error:',
      error
    );


    return res.status(500).json({
      success: false,
      message:
        'Unable to provision officer account.',
    });
  }
}

export async function previewSecureId(req, res) {
  try {
    const secureId =
      await generateAvailableSecureId();

    return res.status(200).json({
      success: true,
      secureId,
      watermarkId: secureId,
    });
  } catch (error) {
    console.error(
      'Secure ID preview error:',
      error
    );

    return res.status(500).json({
      success: false,
      message:
        'Unable to generate Watermark ID.',
    });
  }
}
