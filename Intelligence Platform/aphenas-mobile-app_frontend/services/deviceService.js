import AsyncStorage from '@react-native-async-storage/async-storage';

const DEVICE_ID_KEY = 'aphenasDeviceId';
let cachedDeviceId = null;

function makeDeviceId() {
  return `aphenas-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export async function getDeviceId() {
  if (cachedDeviceId) return cachedDeviceId;
  const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (existing) {
    cachedDeviceId = existing;
    return existing;
  }
  const created = makeDeviceId();
  await AsyncStorage.setItem(DEVICE_ID_KEY, created);
  cachedDeviceId = created;
  return created;
}

export function getCachedDeviceId() {
  return cachedDeviceId;
}
