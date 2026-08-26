import { findOfficerByServiceId, updateOfficerPassword } from '../models/authModel.js';
import { hashDjangoPassword, verifyDjangoPassword } from '../services/passwordService.js';
import { writeAuditLog } from '../services/auditLogService.js';

export async function resetPassword(req, res) {
  try {
    const serviceId = String(req.body.serviceId || '').trim();
    const currentPassword = String(req.body.currentPassword || '');
    const newPassword = String(req.body.newPassword || '');

    if (!serviceId || !currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Service number, current password, and new password are required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'New password must contain at least 8 characters' });
    }
    if (currentPassword === newPassword) {
      return res.status(400).json({ success: false, message: 'New password must be different from the current password' });
    }

    const officer = await findOfficerByServiceId(serviceId);
    if (!officer || !verifyDjangoPassword(currentPassword, officer.password)) {
      await writeAuditLog({
        eventType: 'password_reset_failure',
        targetUserId: officer?.user_id || null,
        req,
        metadata: { serviceId },
      });
      return res.status(401).json({ success: false, message: 'Service number or password is incorrect' });
    }

    const updated = await updateOfficerPassword({
      userId: officer.user_id,
      passwordHash: hashDjangoPassword(newPassword),
    });
    await writeAuditLog({
      eventType: 'password_reset_success',
      actorUserId: officer.user_id,
      targetUserId: officer.user_id,
      req,
    });

    return res.json({
      success: true,
      message: 'Password reset successfully',
      officer: {
        userId: updated.user.id,
        serviceId: updated.profile.service_id,
        displayName: updated.profile.display_name,
        mustChangePassword: updated.profile.must_change_password,
        onboardingCompleted: updated.profile.onboarding_completed,
      },
    });
  } catch (error) {
    console.error('Password reset failed:', error);
    return res.status(500).json({ success: false, message: 'Unable to reset password' });
  }
}
