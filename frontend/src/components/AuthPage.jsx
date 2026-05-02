/**
 * SecureChat — End-to-End Encrypted Messaging
 * Copyright (c) 2026 Roman Parish
 * Licensed under the MIT License — see LICENSE file for details
 *
 * https://github.com/roman-parish/securechat
 */
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';

function isSslOrNetworkError(err) {
  if (!(err instanceof TypeError)) return false;
  const msg = err.message || '';
  return (
    msg.includes('Failed to fetch') ||
    msg.includes('Load failed') ||
    msg.includes('NetworkError') ||
    msg.includes('Network request failed')
  );
}

export default function AuthPage() {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [sslError, setSslError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [twoFactorState, setTwoFactorState] = useState(null); // { tempToken, password }
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const { login, completeTwoFactorLogin, register } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSslError(false);
    setLoading(true);
    try {
      if (mode === 'login') {
        const result = await login({ username: form.username, password: form.password });
        if (result?.requiresTwoFactor) {
          setTwoFactorState({ tempToken: result.tempToken, password: form.password });
          setLoading(false);
          return;
        }
      } else {
        if (form.password.length < 8) {
          setError('Password must be at least 8 characters');
          setLoading(false);
          return;
        }
        await register(form);
      }
    } catch (err) {
      if (isSslOrNetworkError(err)) {
        setSslError(true);
      } else {
        setError(err.message || 'Something went wrong');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleTwoFactor = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await completeTwoFactorLogin({
        tempToken: twoFactorState.tempToken,
        code: twoFactorCode.replace(/\s/g, ''),
        password: twoFactorState.password,
      });
    } catch (err) {
      setError(err.message || 'Invalid code');
    } finally {
      setLoading(false);
    }
  };

  if (twoFactorState) {
    return (
      <div className="auth-page">
        <div className="auth-glow" />
        <div className="auth-card">
          <div className="auth-logo">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="11" width="18" height="11" rx="3" fill="var(--accent)" opacity="0.2"/>
              <rect x="3" y="11" width="18" height="11" rx="3" stroke="var(--accent)" strokeWidth="1.5"/>
              <path d="M7 11V7a5 5 0 0110 0v4" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round"/>
              <circle cx="12" cy="16.5" r="1.5" fill="var(--accent)"/>
            </svg>
            <h1>SecureChat</h1>
            <p>Two-factor authentication</p>
          </div>
          <form className="auth-form" onSubmit={handleTwoFactor}>
            <p style={{ fontSize: 14, color: 'var(--text-2)', marginBottom: 8 }}>
              Enter the 6-digit code from your authenticator app.
            </p>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000 000"
              value={twoFactorCode}
              onChange={e => setTwoFactorCode(e.target.value)}
              maxLength={7}
              autoFocus
              style={{ textAlign: 'center', fontSize: 24, letterSpacing: 6 }}
            />
            {error && <div className="auth-error"><span>{error}</span></div>}
            <button type="submit" className="auth-submit" disabled={loading || twoFactorCode.replace(/\s/g, '').length < 6}>
              {loading ? <span className="spinner" /> : 'Verify'}
            </button>
            <button type="button" style={{ background: 'none', color: 'var(--text-3)', fontSize: 13, marginTop: 4 }}
              onClick={() => { setTwoFactorState(null); setTwoFactorCode(''); setError(''); }}>
              Back to login
            </button>
          </form>
        </div>
        <style>{`.auth-page{min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg-0);padding:16px}.auth-glow{position:fixed;top:-200px;left:50%;transform:translateX(-50%);width:600px;height:600px;background:radial-gradient(circle,rgba(99,102,241,.12) 0%,transparent 70%);pointer-events:none}.auth-card{width:100%;max-width:380px;background:var(--bg-1);border:1px solid var(--border);border-radius:var(--radius-xl);padding:32px;display:flex;flex-direction:column;gap:24px}.auth-logo{display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center}.auth-logo h1{font-size:22px;font-weight:700;color:var(--text-0)}.auth-logo p{font-size:13px;color:var(--text-3)}.auth-form{display:flex;flex-direction:column;gap:12px}.auth-form input{width:100%;padding:10px 12px;background:var(--bg-2);border:1px solid var(--border);border-radius:var(--radius-md);font-size:15px;color:var(--text-0);box-sizing:border-box}.auth-submit{width:100%;padding:11px;background:var(--accent);color:white;border-radius:var(--radius-md);font-size:15px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px}.auth-submit:disabled{opacity:.6;cursor:default}.auth-error{background:var(--red-dim);border:1px solid var(--red);border-radius:var(--radius-md);padding:10px 12px;display:flex;align-items:flex-start;gap:8px;font-size:13px;color:var(--red)}`}</style>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-glow" />
      <div className="auth-card">
        <div className="auth-logo">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="11" width="18" height="11" rx="3" fill="var(--accent)" opacity="0.2"/>
            <rect x="3" y="11" width="18" height="11" rx="3" stroke="var(--accent)" strokeWidth="1.5"/>
            <path d="M7 11V7a5 5 0 0110 0v4" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round"/>
            <circle cx="12" cy="16.5" r="1.5" fill="var(--accent)"/>
          </svg>
          <h1>SecureChat</h1>
          <p>End-to-end encrypted messaging</p>
        </div>

        {sslError ? (
          <div className="ssl-error-box">
            <div className="ssl-icon">🔒</div>
            <h3>Certificate not trusted yet</h3>
            <p>
              SecureChat uses a self-signed SSL certificate. Your browser needs to trust it before it can connect.
            </p>
            <ol>
              <li>
                <strong>Desktop Safari / Chrome:</strong> Visit{' '}
                <a href={window.location.origin} target="_blank" rel="noopener noreferrer">
                  {window.location.origin}
                </a>{' '}
                — click <em>Advanced</em> then <em>Proceed</em> (Safari: <em>Visit Website</em>).
              </li>
              <li>
                <strong>iPhone / iPad:</strong> Visit the link above in Safari, tap <em>Show Details</em> → <em>Visit this website</em> → enter your passcode.
              </li>
            </ol>
            <p>Once trusted, come back here and try logging in again.</p>
            <button className="ssl-reload-btn" onClick={() => { setSslError(false); window.location.reload(); }}>
              Try again
            </button>
          </div>
        ) : (
          <>
            <div className="auth-tabs">
              <button className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError(''); }}>
                Sign in
              </button>
              <button className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setError(''); }}>
                Create account
              </button>
            </div>

            <form className="auth-form" onSubmit={handleSubmit}>
              <div className="field">
                <label>Username or email</label>
                <input
                  type="text"
                  placeholder={mode === 'login' ? 'Username or email' : 'Choose a username'}
                  value={form.username}
                  onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                  required
                  autoComplete={mode === 'login' ? 'username' : 'username'}
                />
              </div>

              {mode === 'register' && (
                <div className="field">
                  <label>Email</label>
                  <input
                    type="email"
                    placeholder="your@email.com"
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    required
                    autoComplete="email"
                  />
                </div>
              )}

              <div className="field">
                <label>Password</label>
                <input
                  type="password"
                  placeholder={mode === 'register' ? 'Min. 8 characters' : 'Your password'}
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  required
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
                {mode === 'register' && (
                  <span className="field-hint">
                    Your password also encrypts your keys — don't forget it.
                  </span>
                )}
              </div>

              {error && (
                <div className="auth-error">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="9" stroke="var(--red)" strokeWidth="1.5"/>
                    <path d="M12 8v5M12 16.5v.5" stroke="var(--red)" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  {error}
                </div>
              )}

              <button type="submit" className="auth-submit" disabled={loading}>
                {loading
                  ? <span className="spinner" />
                  : mode === 'login' ? 'Sign in' : 'Create account'
                }
              </button>
            </form>

            {mode === 'register' && (
              <div className="auth-notice">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                  <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M7 11V7a5 5 0 0110 0v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                Your encryption keys are generated on this device and protected by your password.
                You can log in from any device — just enter your password.
              </div>
            )}
          </>
        )}
      </div>

      <style>{`
        .auth-page {
          display: flex; align-items: center; justify-content: center;
          flex: 1; background: var(--bg-0);
          padding: 24px; position: relative; overflow: hidden;
        }
        .auth-glow {
          position: absolute; width: 600px; height: 600px; border-radius: 50%;
          background: radial-gradient(circle, rgba(108,99,255,0.12) 0%, transparent 70%);
          top: 50%; left: 50%; transform: translate(-50%, -50%); pointer-events: none;
        }
        .auth-card {
          width: 100%; max-width: 400px; background: var(--bg-2);
          border: 1px solid var(--border); border-radius: var(--radius-xl);
          padding: 40px 32px; animation: slideUp 0.4s ease; position: relative; z-index: 1;
        }
        .auth-logo { text-align: center; margin-bottom: 32px; }
        .auth-logo h1 { font-size: 24px; font-weight: 600; margin-top: 12px; letter-spacing: -0.5px; }
        .auth-logo p { font-size: 13px; color: var(--text-2); margin-top: 4px; }
        .auth-tabs {
          display: grid; grid-template-columns: 1fr 1fr;
          background: var(--bg-3); border-radius: var(--radius);
          padding: 4px; margin-bottom: 28px;
        }
        .auth-tabs button {
          padding: 8px; border-radius: calc(var(--radius) - 2px);
          font-size: 14px; font-weight: 500; color: var(--text-2);
          transition: all var(--transition);
        }
        .auth-tabs button.active { background: var(--bg-4); color: var(--text-0); }
        .auth-form { display: flex; flex-direction: column; gap: 16px; }
        .field { display: flex; flex-direction: column; gap: 6px; }
        .field label { font-size: 13px; color: var(--text-2); font-weight: 500; }
        .field input {
          background: var(--bg-3); border: 1px solid var(--border);
          border-radius: var(--radius); padding: 12px 14px;
          font-size: 16px; color: var(--text-0);
          transition: border-color var(--transition);
        }
        .field input:focus { border-color: var(--accent); }
        .field input::placeholder { color: var(--text-3); }
        .field-hint { font-size: 12px; color: var(--text-3); }
        .auth-error {
          display: flex; align-items: center; gap: 8px;
          background: var(--red-dim); border: 1px solid rgba(255,87,87,0.2);
          border-radius: var(--radius); padding: 10px 12px;
          font-size: 13px; color: var(--red);
        }
        .auth-submit {
          background: var(--accent); color: white;
          border-radius: var(--radius); padding: 13px;
          font-size: 16px; font-weight: 500; margin-top: 4px;
          transition: all var(--transition);
          display: flex; align-items: center; justify-content: center;
        }
        .auth-submit:hover:not(:disabled) { background: var(--accent-light); transform: translateY(-1px); }
        .auth-submit:disabled { opacity: 0.6; cursor: default; }
        .spinner {
          width: 18px; height: 18px; border: 2px solid rgba(255,255,255,0.3);
          border-top-color: white; border-radius: 50%;
          animation: spin 0.6s linear infinite;
        }
        .auth-notice {
          display: flex; align-items: flex-start; gap: 7px;
          margin-top: 16px; font-size: 12px; color: var(--text-3); line-height: 1.5;
        }
        .auth-notice svg { flex-shrink: 0; margin-top: 1px; }
        /* SSL error state */
        .ssl-error-box {
          background: rgba(255,193,7,0.08); border: 1px solid rgba(255,193,7,0.3);
          border-radius: var(--radius); padding: 20px;
          display: flex; flex-direction: column; gap: 12px;
        }
        .ssl-icon { font-size: 32px; text-align: center; }
        .ssl-error-box h3 { font-size: 15px; font-weight: 600; color: var(--text-0); text-align: center; }
        .ssl-error-box p { font-size: 13px; color: var(--text-2); line-height: 1.6; }
        .ssl-error-box ol { padding-left: 18px; display: flex; flex-direction: column; gap: 8px; }
        .ssl-error-box li { font-size: 13px; color: var(--text-2); line-height: 1.6; }
        .ssl-error-box a { color: var(--accent); text-decoration: underline; word-break: break-all; }
        .ssl-reload-btn {
          background: var(--accent); color: white; border-radius: var(--radius);
          padding: 10px; font-size: 14px; font-weight: 500; margin-top: 4px;
          transition: all var(--transition);
        }
        .ssl-reload-btn:hover { background: var(--accent-light); }
      `}</style>
    </div>
  );
}
