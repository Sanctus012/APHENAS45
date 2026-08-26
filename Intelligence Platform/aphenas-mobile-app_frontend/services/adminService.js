import { apiRequest } from './apiClient';

export async function provisionOfficerAccount(authToken, details) {
  return apiRequest('/admin/officers', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify(details),
  });
}

export async function generateOfficerSecureId(authToken) {
  return apiRequest('/admin/secure-id', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${authToken}`,
    },
  });
}
