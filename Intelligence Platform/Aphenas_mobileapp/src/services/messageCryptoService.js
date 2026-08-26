import crypto from 'crypto';

const ENVELOPE_PREFIX = 'aphenas:v1';
const KEY_ALGORITHM = 'aes-256-gcm';

function messageKey() {
  const configured = process.env.MESSAGE_CONTENT_KEY || process.env.MESSAGE_ENCRYPTION_KEY;
  const environment = process.env.NODE_ENV || 'development';

  if (!configured && environment !== 'development' && environment !== 'test') {
    throw new Error('MESSAGE_CONTENT_KEY must be configured outside development.');
  }

  if (!configured) {
    return crypto.createHash('sha256').update('aphenas-local-message-content-key').digest();
  }

  const value = configured.trim();
  const hex = /^[a-f0-9]{64}$/i.test(value) ? Buffer.from(value, 'hex') : null;
  if (hex?.length === 32) return hex;

  const base64 = Buffer.from(value, 'base64');
  if (base64.length === 32) return base64;

  return crypto.createHash('sha256').update(value).digest();
}

const key = messageKey();

export function isEncryptedMessageContent(value) {
  return String(value || '').startsWith(`${ENVELOPE_PREFIX}:`);
}

export function encryptMessageContent(plaintext) {
  const text = String(plaintext || '');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(KEY_ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    ENVELOPE_PREFIX,
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(':');
}

export function decryptMessageContent(storedValue) {
  const value = String(storedValue || '');
  if (!isEncryptedMessageContent(value)) return value;
  const [, version, ivText, tagText, ciphertextText] = value.split(':');
  if (version !== 'v1' || !ivText || !tagText || !ciphertextText) {
    throw new Error('Invalid encrypted message envelope');
  }
  const decipher = crypto.createDecipheriv(
    KEY_ALGORITHM,
    key,
    Buffer.from(ivText, 'base64url')
  );
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextText, 'base64url')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}

export function redactMessageContent(row, replacement = '') {
  if (!row) return row;
  return { ...row, content: replacement };
}
