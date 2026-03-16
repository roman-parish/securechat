/**
 * SecureChat — End-to-End Encrypted Messaging
 * Copyright (c) 2026 Roman Parish
 * Licensed under the MIT License — see LICENSE file for details
 *
 * https://github.com/w5rcp-romanparish/securechat
 */
const API_URL = import.meta.env.VITE_API_URL || '/api';

let accessToken = localStorage.getItem('accessToken');
let refreshToken = localStorage.getItem('refreshToken');
let refreshPromise = null;

export function setTokens(access, refresh) {
  accessToken = access;
  refreshToken = refresh;
  localStorage.setItem('accessToken', access);
  localStorage.setItem('refreshToken', refresh);
}

export function clearTokens() {
  accessToken = null;
  refreshToken = null;
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('userId');
}

export function getAccessToken() {
  return accessToken;
}

// Returns true if the error is a network/connectivity failure (SSL, offline, DNS)
// vs a real HTTP error response. We must NOT clear tokens on network failures —
// that would log the user out just because the cert wasn't trusted yet.
function isNetworkError(err) {
  return err instanceof TypeError && (
    err.message.includes('Failed to fetch') ||
    err.message.includes('NetworkError') ||
    err.message.includes('Network request failed') ||
    err.message.includes('Load failed') // Safari
  );
}

async function refreshAccessToken() {
  if (!refreshToken) throw new Error('No refresh token');

  let res;
  try {
    res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
  } catch (err) {
    // Network error (SSL untrusted, offline) — don't clear tokens, just propagate
    throw err;
  }

  if (res.status === 401 || res.status === 403) {
    // Explicitly rejected by server — token is genuinely invalid, safe to clear
    clearTokens();
    throw new Error('Session expired');
  }

  if (!res.ok) {
    // Server error (5xx) — don't clear tokens, might be temporary
    throw new Error('Refresh failed');
  }

  const data = await res.json();
  setTokens(data.accessToken, data.refreshToken);
  return data.accessToken;
}

export async function apiFetch(path, options = {}) {
  const makeRequest = async (token) => {
    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
    return res;
  };

  let res;
  try {
    res = await makeRequest(accessToken);
  } catch (err) {
    // Network error — rethrow without touching tokens
    throw err;
  }

  if (res.status === 401 && refreshToken) {
    if (!refreshPromise) {
      refreshPromise = refreshAccessToken().finally(() => { refreshPromise = null; });
    }
    try {
      const newToken = await refreshPromise;
      res = await makeRequest(newToken);
    } catch (err) {
      // If refresh failed due to network error, rethrow without clearing
      if (isNetworkError(err)) throw err;
      // If session truly expired, clearTokens already called in refreshAccessToken
      throw err;
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || 'Request failed');
  }

  return res.json();
}

export async function apiUpload(path, formData) {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(err.error || 'Upload failed');
  }

  return res.json();
}
