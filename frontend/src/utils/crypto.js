/**
 * SecureChat — End-to-End Encrypted Messaging
 * Copyright (c) 2026 Roman Parish
 * Licensed under the MIT License — see LICENSE file for details
 *
 * https://github.com/roman-parish/securechat
 */
/**
 * SecureChat E2E Encryption
 * 
 * KEY MANAGEMENT APPROACH:
 * 
 * The core problem: RSA private keys stored only in IndexedDB are lost when
 * the user clears browser data, uses a new device, or opens incognito mode.
 * 
 * Solution: Password-Protected Key Backup
 * ─────────────────────────────────────────
 * 1. Generate RSA-OAEP keypair (2048-bit)
 * 2. Derive an AES-256-GCM "wrapping key" from user's password using PBKDF2
 *    (100,000 iterations, random salt)
 * 3. Wrap (encrypt) the RSA private key with that AES wrapping key
 * 4. Store { encryptedPrivateKey, salt, iv, publicKey } on the server
 *    → Server never sees the private key in plaintext
 *    → Without the password, the encrypted blob is useless
 * 5. On any device: password → derive wrapping key → unwrap private key → done
 * 6. Also cache the unwrapped keypair in IndexedDB for the session so we
 *    don't need to re-derive on every message
 * 
 * Message Encryption:
 * ───────────────────
 * - Generate random AES-256-GCM key per message
 * - Encrypt plaintext with that key
 * - Wrap the AES key with each participant's RSA public key
 * - Server stores: { ciphertext, iv, encryptedKeys[] }
 * - Only participants with their private key can unwrap and decrypt
 */

const DB_NAME = 'securechat_keys';
const DB_VERSION = 1;
const STORE = 'keypairs';
const PBKDF2_ITERATIONS = 100_000;

// ─── IndexedDB session cache ────────────────────────────────────────────────

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => e.target.result.createObjectStore(STORE);
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveKeyPairToSession(userId, keyPair) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(keyPair, String(userId));
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadKeyPairFromSession(userId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(String(userId));
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

// ─── Password-based key derivation ──────────────────────────────────────────

/**
 * Derive an AES-256-GCM wrapping key from a password + salt using PBKDF2.
 * This key is used only to encrypt/decrypt the RSA private key.
 */
async function deriveWrappingKey(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey'],
  );
}

// ─── Key generation & export ─────────────────────────────────────────────────

/**
 * Generate a new RSA keypair and wrap the private key with the user's password.
 * Returns everything needed to store on the server + cache locally.
 */
export async function generateAndWrapKeyPair(password) {
  if (!window.isSecureContext) {
    throw new Error('HTTPS is required for encryption. Access via https:// or use an SSH tunnel.');
  }

  const keyPair = await crypto.subtle.generateKey(
    { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['encrypt', 'decrypt'],
  );

  // Export public key (sent to server in plaintext — it's public)
  const publicKeySpki = await crypto.subtle.exportKey('spki', keyPair.publicKey);
  const publicKeyB64 = bufToB64(publicKeySpki);

  // Wrap private key with password-derived key
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const wrapIv = crypto.getRandomValues(new Uint8Array(12));
  const wrappingKey = await deriveWrappingKey(password, salt);

  const wrappedPrivateKey = await crypto.subtle.wrapKey(
    'pkcs8', keyPair.privateKey, wrappingKey, { name: 'AES-GCM', iv: wrapIv },
  );

  return {
    keyPair,                                    // cache in IndexedDB for this session
    publicKeyB64,                               // store on server (plaintext)
    encryptedPrivateKey: bufToB64(wrappedPrivateKey), // store on server (encrypted)
    salt: bufToB64(salt),                       // store on server (not secret)
    wrapIv: bufToB64(wrapIv),                   // store on server (not secret)
  };
}

/**
 * Unwrap a stored private key using the user's password.
 * Called on login, or when IndexedDB cache is empty (new device).
 */
export async function unwrapPrivateKey(encryptedPrivateKeyB64, saltB64, wrapIvB64, password) {
  const salt = b64ToBuf(saltB64);
  const wrapIv = b64ToBuf(wrapIvB64);
  const wrappingKey = await deriveWrappingKey(password, salt);

  try {
    const privateKey = await crypto.subtle.unwrapKey(
      'pkcs8',
      b64ToBuf(encryptedPrivateKeyB64),
      wrappingKey,
      { name: 'AES-GCM', iv: wrapIv },
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      true,
      ['decrypt'],
    );
    return privateKey;
  } catch {
    throw new Error('Wrong password — could not decrypt your key');
  }
}

/**
 * Reconstruct the full CryptoKeyPair from the stored encrypted private key + public key.
 * This is called at login time, or when the session cache is empty.
 */
export async function restoreKeyPair(encryptedPrivateKeyB64, saltB64, wrapIvB64, publicKeyB64, password) {
  const [privateKey, publicKey] = await Promise.all([
    unwrapPrivateKey(encryptedPrivateKeyB64, saltB64, wrapIvB64, password),
    crypto.subtle.importKey(
      'spki', b64ToBuf(publicKeyB64),
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      true,
      ['encrypt'],
    ),
  ]);
  return { privateKey, publicKey };
}

/**
 * Re-encrypt the private key with a new password (for password changes).
 */
export async function rewrapPrivateKey(keyPair, newPassword) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const wrapIv = crypto.getRandomValues(new Uint8Array(12));
  const wrappingKey = await deriveWrappingKey(newPassword, salt);
  const wrappedPrivateKey = await crypto.subtle.wrapKey(
    'pkcs8', keyPair.privateKey, wrappingKey, { name: 'AES-GCM', iv: wrapIv },
  );
  return {
    encryptedPrivateKey: bufToB64(wrappedPrivateKey),
    salt: bufToB64(salt),
    wrapIv: bufToB64(wrapIv),
  };
}

// ─── Message encryption / decryption ────────────────────────────────────────

/**
 * Decrypt a message using this user's private key.
 * First checks IndexedDB session cache, falls back to unwrapping from server data.
 */
export async function decryptMessage(encryptedContent, iv, encryptedKey, userId) {
  try {
    const keyPair = await loadKeyPairFromSession(userId);
    if (!keyPair) {
      return '[Session expired — please log in again to decrypt]';
    }

    const rawAes = await crypto.subtle.decrypt(
      { name: 'RSA-OAEP' },
      keyPair.privateKey,
      b64ToBuf(encryptedKey),
    );
    const aesKey = await crypto.subtle.importKey(
      'raw', rawAes, { name: 'AES-GCM' }, false, ['decrypt'],
    );
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b64ToBuf(iv) },
      aesKey,
      b64ToBuf(encryptedContent),
    );
    return new TextDecoder().decode(plain);
  } catch (err) {
    console.error('[crypto] decryptMessage error:', err);
    return '[Unable to decrypt]';
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function bufToB64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  bytes.forEach(b => s += String.fromCharCode(b));
  return btoa(s);
}

export function b64ToBuf(b64) {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}
