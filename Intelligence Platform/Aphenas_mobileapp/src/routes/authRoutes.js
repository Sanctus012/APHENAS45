import express from 'express';
import {
  requireOnboardingToken,
} from '../middlewares/requireOnboardingToken.js';
import {
  loginOfficer,
  changeInitialPassword,
  refreshOfficerSession,
} from '../controllers/authController.js';
import { resetPassword } from '../controllers/resetPasswordController.js';
import { createRateLimiter } from '../middlewares/rateLimit.js';
import { findOfficerByServiceId, recordLoginFailure } from '../models/authModel.js';

const loginLimiter = createRateLimiter({
  name: 'login',
  max: 5,
  windowMs: 15 * 60 * 1000,
  cooldownMs: 15 * 60 * 1000,
  keyGenerator: (req) => `${String(req.body?.serviceId || '').trim().toLowerCase()}:${req.ip}`,
  auditEvent: 'login_rate_limit_exceeded',
  onLimit: async (req) => {
    const officer = await findOfficerByServiceId(String(req.body?.serviceId || '').trim());
    if (officer?.user_id) await recordLoginFailure(officer.user_id, 1, 15);
  },
});

const passwordResetLimiter = createRateLimiter({
  name: 'password_reset',
  max: 5,
  windowMs: 15 * 60 * 1000,
  cooldownMs: 15 * 60 * 1000,
  keyGenerator: (req) => `${String(req.body?.serviceId || '').trim().toLowerCase()}:${req.ip}`,
  auditEvent: 'password_reset_rate_limit_exceeded',
  onLimit: async (req) => {
    const officer = await findOfficerByServiceId(String(req.body?.serviceId || '').trim());
    if (officer?.user_id) await recordLoginFailure(officer.user_id, 1, 15);
  },
});


const router =
  express.Router();


/* =========================================
   OFFICER LOGIN
========================================= */

router.post(
  '/login',
  loginLimiter,
  loginOfficer
);

router.post(
  '/refresh',
  refreshOfficerSession
);


/* =========================================
   FIRST LOGIN PASSWORD CHANGE
========================================= */

router.post(
  '/change-initial-password',
  requireOnboardingToken,
  changeInitialPassword
);

router.post(
  '/reset-password',
  passwordResetLimiter,
  resetPassword
);


export default router;
