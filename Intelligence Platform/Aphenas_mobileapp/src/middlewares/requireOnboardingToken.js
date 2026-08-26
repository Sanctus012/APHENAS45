import {
  verifyOnboardingToken,
} from '../services/onboardingTokenService.js';


export function requireOnboardingToken(
  req,
  res,
  next
) {

  const authorization =
    req.headers.authorization;


  if (
    !authorization ||
    !authorization.startsWith('Bearer ')
  ) {

    return res.status(401).json({
      success: false,
      message:
        'Onboarding authentication required.',
    });
  }


  const token =
    authorization.substring(7);


  try {

    const officer =
      verifyOnboardingToken(
        token
      );


    req.onboardingOfficer =
      officer;


    next();

  } catch {

    return res.status(401).json({
      success: false,
      message:
        'Invalid or expired onboarding session.',
    });
  }
}
