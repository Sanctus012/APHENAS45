import {
  apiRequest,
} from './apiClient';



/* =========================================
   GENERATE RECOVERY PHRASE
========================================= */

export async function generateRecoveryPhrase(
  onboardingToken
) {

  return apiRequest(
    '/onboarding/recovery/generate',
    {

      method: 'POST',

      headers: {
        Authorization:
          `Bearer ${onboardingToken}`,
      },

    }
  );

}