/**
 * SecureChat — End-to-End Encrypted Messaging
 * Copyright (c) 2026 Roman Parish
 * Licensed under the MIT License — see LICENSE file for details
 *
 * https://github.com/roman-parish/securechat
 */
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiFetch, setTokens, clearTokens, getAccessToken } from '../utils/api.js';
import {
  generateAndWrapKeyPair,
  restoreKeyPair,
  saveKeyPairToSession,
  loadKeyPairFromSession,
} from '../utils/crypto.js';
import { subscribeToPush } from '../utils/push.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // Whether we need the user to enter their password to unlock their keys
  const [needsKeyUnlock, setNeedsKeyUnlock] = useState(false);
  const [pendingKeyMaterial, setPendingKeyMaterial] = useState(null);

  // On page load: restore session from token
  useEffect(() => {
    const token = getAccessToken();
    if (!token) { setLoading(false); return; }

    apiFetch('/users/me/profile')
      .then(async (userData) => {
        setUser(userData);
        // Check if keys are in IndexedDB session cache
        const cached = await loadKeyPairFromSession(userData._id);
        if (!cached && userData.encryptedPrivateKey) {
          // Keys exist on server but not in session — user needs to unlock
          setNeedsKeyUnlock(true);
          setPendingKeyMaterial({
            encryptedPrivateKey: userData.encryptedPrivateKey,
            salt: userData.keyDerivationSalt,
            wrapIv: userData.keyWrapIv,
            publicKey: userData.publicKey,
          });
        }
        // Re-subscribe to push on every app open — iOS subscriptions expire silently
        // Only attempt if permission already granted (don't prompt on page load)
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          subscribeToPush().catch(() => {});
        }
      })
      .catch((err) => {
        // Only clear tokens if the server explicitly rejected them (real 401/403).
        // A network error (SSL cert untrusted, offline) should NOT log the user out —
        // the tokens are still valid, the browser just hasn't trusted the cert yet.
        const isNetworkErr = err instanceof TypeError &&
          (err.message.includes('Failed to fetch') ||
           err.message.includes('Load failed') ||
           err.message.includes('NetworkError'));
        if (!isNetworkErr) clearTokens();
      })
      .finally(() => setLoading(false));

    // iOS PWA: re-subscribe whenever the app returns to foreground
    // visibilitychange is reliable and doesn't misfire on system dialogs
    const handleVisible = () => {
      if (document.visibilityState === 'visible') {
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          subscribeToPush().catch(() => {});
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisible);
    return () => document.removeEventListener('visibilitychange', handleVisible);
  }, []);

  /**
   * Unlock keys with password after page refresh.
   * Called from the KeyUnlockPrompt component.
   */
  const unlockKeys = useCallback(async (password) => {
    if (!pendingKeyMaterial || !user) throw new Error('No key material to unlock');

    const keyPair = await restoreKeyPair(
      pendingKeyMaterial.encryptedPrivateKey,
      pendingKeyMaterial.salt,
      pendingKeyMaterial.wrapIv,
      pendingKeyMaterial.publicKey,
      password,
    );

    await saveKeyPairToSession(user._id, keyPair);
    setNeedsKeyUnlock(false);
    setPendingKeyMaterial(null);
  }, [pendingKeyMaterial, user]);

  const register = useCallback(async ({ username, email, password }) => {
    // Step 1: Create the account (no keys yet — we need the real user ID first)
    const data = await apiFetch('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password }),
    });

    setTokens(data.accessToken, data.refreshToken);
    localStorage.setItem('userId', data.user._id);

    // Step 2: Generate keypair and wrap private key with user's password
    const { keyPair, publicKeyB64, encryptedPrivateKey, salt, wrapIv } =
      await generateAndWrapKeyPair(password);

    // Step 3: Store encrypted key material on server
    await apiFetch('/auth/keys', {
      method: 'POST',
      body: JSON.stringify({ publicKey: publicKeyB64, encryptedPrivateKey, salt, wrapIv }),
    });

    // Step 4: Cache the live keypair in IndexedDB for this session
    await saveKeyPairToSession(data.user._id, keyPair);

    const updatedUser = {
      ...data.user,
      publicKey: publicKeyB64,
      encryptedPrivateKey,
      keyDerivationSalt: salt,
      keyWrapIv: wrapIv,
    };
    setUser(updatedUser);
    setNeedsKeyUnlock(false);

    // Fire-and-forget — never block login on push setup
    setTimeout(() => {
      try {
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          subscribeToPush().catch(() => {});
        }
      } catch {}
    }, 2000);

    return updatedUser;
  }, []);

  const completeTwoFactorLogin = useCallback(async ({ tempToken, code, password, trustDevice }) => {
    const data = await apiFetch('/auth/2fa/authenticate', {
      method: 'POST',
      body: JSON.stringify({ tempToken, code, trustDevice }),
    });

    setTokens(data.accessToken, data.refreshToken);
    localStorage.setItem('userId', data.user._id);

    if (data.keyMaterial) {
      try {
        const keyPair = await restoreKeyPair(
          data.keyMaterial.encryptedPrivateKey,
          data.keyMaterial.salt,
          data.keyMaterial.wrapIv,
          data.keyMaterial.publicKey,
          password,
        );
        await saveKeyPairToSession(data.user._id, keyPair);
      } catch (err) {
        console.error('[auth] Key restore failed:', err);
      }
    }

    setUser(data.user);
    setNeedsKeyUnlock(false);
    setTimeout(() => { subscribeToPush().catch(() => {}); }, 2000);
    return data; // return full response so caller can read trustedToken, recoveryCodeUsed etc.
  }, []);

  const login = useCallback(async ({ username, password, trustedToken }) => {
    const data = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password, trustedToken }),
    });

    // 2FA required — return flag so UI can show the TOTP screen
    if (data.requiresTwoFactor) {
      return { requiresTwoFactor: true, tempToken: data.tempToken, password };
    }

    setTokens(data.accessToken, data.refreshToken);
    localStorage.setItem('userId', data.user._id);

    if (data.keyMaterial) {
      // Restore keypair from server-stored encrypted key material
      let keyPair;
      try {
        keyPair = await restoreKeyPair(
          data.keyMaterial.encryptedPrivateKey,
          data.keyMaterial.salt,
          data.keyMaterial.wrapIv,
          data.keyMaterial.publicKey,
          password,
        );
        await saveKeyPairToSession(data.user._id, keyPair);
      } catch (err) {
        // Wrong password for key (shouldn't happen since login password = wrap password)
        console.error('[auth] Key restore failed:', err);
      }
    } else {
      // First login on new account — no keys yet, generate them
      const { keyPair, publicKeyB64, encryptedPrivateKey, salt, wrapIv } =
        await generateAndWrapKeyPair(password);

      await apiFetch('/auth/keys', {
        method: 'POST',
        body: JSON.stringify({ publicKey: publicKeyB64, encryptedPrivateKey, salt, wrapIv }),
      });

      await saveKeyPairToSession(data.user._id, keyPair);
      data.user.publicKey = publicKeyB64;
    }

    setUser(data.user);
    setNeedsKeyUnlock(false);

    // Fire-and-forget with delay — never block login on push setup
    setTimeout(() => {
      subscribeToPush().catch(() => {});
    }, 2000);

    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiFetch('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: localStorage.getItem('refreshToken') }),
      });
    } catch {}
    clearTokens();
    setUser(null);
    setNeedsKeyUnlock(false);
    setPendingKeyMaterial(null);
  }, []);

  const updateProfile = useCallback(async (profileData) => {
    const updated = await apiFetch('/users/me/profile', {
      method: 'PUT',
      body: JSON.stringify(profileData),
    });
    setUser(updated);
    return updated;
  }, []);

  return (
    <AuthContext.Provider value={{
      user, loading, needsKeyUnlock,
      register, login, completeTwoFactorLogin, logout, updateProfile, unlockKeys, setUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
