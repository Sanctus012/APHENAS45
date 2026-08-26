import {
  apiRequest,
} from './apiClient';
import { getDeviceId } from './deviceService';


/* =========================================
   OFFICER LOGIN
========================================= */

export async function loginOfficer(
  serviceId,
  password
) {
  const deviceId = await getDeviceId();
  return apiRequest(
    '/auth/login',
    {
      method: 'POST',

      body: JSON.stringify({
        serviceId,
        password,
        deviceId,
      }),
    }
  );
}

export async function refreshSession(refreshToken) {
  const deviceId = await getDeviceId();
  return apiRequest('/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken, deviceId }),
  });
}


/* =========================================
   INITIAL PASSWORD CHANGE
   Uses onboarding token issued after
   first successful login
========================================= */

export async function changeInitialPassword(
  currentPassword,
  newPassword,
  onboardingToken
) {

  return apiRequest(
    '/auth/change-initial-password',
    {
      method: 'POST',

      headers: {
        Authorization:
          `Bearer ${onboardingToken}`,
      },

      body: JSON.stringify({
        currentPassword,
        newPassword,
      }),
    }
  );

}


export async function resetPassword(serviceId, currentPassword, newPassword) {
  return apiRequest('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ serviceId, currentPassword, newPassword }),
  });
}
