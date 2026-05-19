/**
 * AES-256-GCM encryption helpers using the native Web Crypto API.
 *
 * Invite-code format: "{8-char server code}#{base64url(raw AES key)}"
 * Ciphertext layout:  [12-byte IV][AES-GCM ciphertext + 16-byte auth tag]
 *
 * The key is embedded in the invite code (and URL fragment), so it is
 * never transmitted to the server — only the encrypted bytes are stored.
 */

export class CryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CryptoError';
  }
}

export async function generateKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export async function encryptData(data: ArrayBuffer, key: CryptoKey): Promise<ArrayBuffer> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);

  // Prepend the 12-byte IV so the receiver can decrypt without side-channel delivery
  const result = new Uint8Array(12 + ciphertext.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(ciphertext), 12);
  return result.buffer;
}

export async function decryptData(data: ArrayBuffer, key: CryptoKey): Promise<ArrayBuffer> {
  if (data.byteLength < 12 + 16) {
    throw new CryptoError('Data is too short to be valid ciphertext');
  }
  const iv         = new Uint8Array(data, 0, 12);
  const ciphertext = new Uint8Array(data, 12);
  try {
    return await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  } catch {
    throw new CryptoError('Decryption failed — wrong key or corrupted data');
  }
}

export async function exportKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key);
  return uint8ToBase64Url(new Uint8Array(raw));
}

export async function importKey(base64url: string): Promise<CryptoKey> {
  const bytes = base64UrlToUint8(base64url);
  return crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function uint8ToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64UrlToUint8(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = (4 - (b64.length % 4)) % 4;
  const binary = atob(b64 + '='.repeat(pad));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
