/**
 * SecureChat — End-to-End Encrypted Messaging
 * Copyright (c) 2026 Roman Parish
 * Licensed under the MIT License — see LICENSE file for details
 *
 * https://github.com/roman-parish/securechat
 */
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { apiFetch, apiUpload, getSessionJti } from '../utils/api.js';
import { subscribeToPush, unsubscribeFromPush, isPushSupported, isStandalone, isPrivateMode } from '../utils/push.js';
import { useTheme } from '../contexts/ThemeContext.jsx';
import Avatar from './Avatar.jsx';

export default function ProfileModal({ onClose }) {
  const { user, logout, updateProfile, setUser } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [tab, setTab] = useState('profile');
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [passwords, setPasswords] = useState({ current: '', newPass: '', confirm: '' });
  const [pwMsg, setPwMsg] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteMsg, setDeleteMsg] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [sessions, setSessions] = useState(null);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [revokingJti, setRevokingJti] = useState(null);

  // Check if there's an actual push subscription on mount
  useEffect(() => {
    if (!isPushSupported()) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    navigator.serviceWorker.ready.then(reg => {
      reg.pushManager.getSubscription().then(sub => {
        setPushEnabled(!!sub);
      }).catch(() => {});
    }).catch(() => {});
  }, []);
  const [pushWorking, setPushWorking] = useState(null);
  const fileRef = useRef();
  const pushBusyRef = useRef(false);
  const standalone = isStandalone();
  const pushSupported = isPushSupported();
  const [isPrivate, setIsPrivate] = useState(false);
  useEffect(() => { isPrivateMode().then(setIsPrivate); }, []);

  // Lock body scroll while modal is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateProfile({ displayName, bio });
      setMsg('Profile saved!');
      setTimeout(() => setMsg(''), 2000);
    } catch (err) {
      setMsg('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword) { setDeleteMsg('Password is required'); return; }
    setDeleting(true);
    setDeleteMsg('');
    try {
      await apiFetch('/auth/account', {
        method: 'DELETE',
        body: JSON.stringify({ password: deletePassword }),
      });
      await logout();
    } catch (err) {
      setDeleteMsg(err.message || 'Failed to delete account');
      setDeleting(false);
    }
  };

  const handleChangePassword = async () => {
    if (!passwords.current || !passwords.newPass || !passwords.confirm) {
      setPwMsg('All fields are required'); return;
    }
    if (passwords.newPass.length < 8) {
      setPwMsg('New password must be at least 8 characters'); return;
    }
    if (passwords.newPass !== passwords.confirm) {
      setPwMsg('New passwords do not match'); return;
    }
    setPwSaving(true);
    setPwMsg('');
    try {
      await apiFetch('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: passwords.current, newPassword: passwords.newPass }),
      });
      setPwMsg('✓ Password changed successfully!');
      setPasswords({ current: '', newPass: '', confirm: '' });
      setTimeout(() => { setPwMsg(''); setShowChangePassword(false); }, 2000);
    } catch (err) {
      setPwMsg(err.message || 'Failed to change password');
    } finally {
      setPwSaving(false);
    }
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append('avatar', file);
    try {
      const data = await apiUpload('/uploads/avatar', form);
      setUser(prev => ({ ...prev, avatar: data.avatar }));
    } catch {
      setMsg('Avatar upload failed');
    }
  };

  // Load sessions when security tab is opened
  useEffect(() => {
    if (tab !== 'security' || sessions !== null) return;
    setSessionsLoading(true);
    apiFetch('/auth/sessions')
      .then(setSessions)
      .catch(() => setSessions([]))
      .finally(() => setSessionsLoading(false));
  }, [tab, sessions]);

  const handleRevokeSession = async (jti) => {
    setRevokingJti(jti);
    try {
      await apiFetch(`/auth/sessions/${jti}`, { method: 'DELETE' });
      setSessions(prev => prev.filter(s => s.jti !== jti));
    } catch {
      // ignore
    } finally {
      setRevokingJti(null);
    }
  };

  /**
   * NOTIFICATION ENABLE FLOW
   *
   * The black screen bug: Notification.requestPermission() causes the OS to
   * show a system dialog. On iOS and Mac PWAs this suspends the compositor
   * and discards GPU layers. When focus returns, the browser does a full
   * repaint — but any React state update queued before the dialog opened
   * causes a render during that repaint window where CSS vars haven't resolved,
   * making everything paint black.
   *
   * Fix: The permission request is NOT called from inside this component.
   * Instead we use a plain <a> tag that opens a tiny helper page in a new
   * tab which requests permission and posts back via BroadcastChannel.
   * The modal never loses focus, never repaints, never goes black.
   *
   * For browsers where permission is already granted (common on re-opens),
   * we skip straight to subscribe() with no dialog needed.
   */
  const handleEnableNotifications = async () => {
    if (pushBusyRef.current) return;
    pushBusyRef.current = true;

    try {
      const currentPerm = typeof Notification !== 'undefined'
        ? Notification.permission : 'default';

      if (currentPerm === 'granted') {
        // No dialog needed — subscribe directly
        const ok = await subscribeToPush();
        if (ok) {
          setPushEnabled(true);
          setPushWorking(true);
          setMsg('Notifications enabled!');
        } else {
          setMsg('Setup failed — check console');
        }
        return;
      }

      if (currentPerm === 'denied') {
        setMsg('Blocked — enable in your device Settings app.');
        return;
      }

      // Permission is 'default' — request it directly.
      // Previously we used a popup workaround for iOS to avoid a "black screen" flash,
      // but window.open() from a standalone PWA opens in regular Safari (a different
      // context), so BroadcastChannel can never communicate back to the PWA.
      // Calling requestPermission() directly is the only reliable approach on iOS.
      try {
        const result = await Notification.requestPermission();
        if (result === 'granted') {
          const ok = await subscribeToPush();
          if (ok) {
            setPushEnabled(true);
            setPushWorking(true);
            setMsg('Notifications enabled!');
          } else {
            setMsg('Setup failed — try again');
          }
        } else {
          setMsg('Permission denied. Enable in Settings → SecureChat → Notifications.');
        }
      } catch (err) {
        setMsg('Error: ' + err.message);
      }
      pushBusyRef.current = false;
      setTimeout(() => setMsg(''), 6000);
    } catch (err) {
      console.error('[push] enable error:', err);
      setMsg('Error: ' + err.message);
      pushBusyRef.current = false;
    }
  };

  const handleDisableNotifications = async () => {
    if (pushBusyRef.current) return;
    pushBusyRef.current = true;
    try {
      await unsubscribeFromPush();
      setPushEnabled(false);
      setPushWorking(null);
      setMsg('Notifications disabled');
      setTimeout(() => setMsg(''), 3000);
    } finally {
      pushBusyRef.current = false;
    }
  };

  const testPush = async () => {
    setMsg('Sending test notification...');
    try {
      // First make sure subscription is fresh
      await subscribeToPush();
      const res = await apiFetch('/push/test', { method: 'POST' });
      if (res.sent > 0) {
        setMsg('✓ Sent! You should see a notification shortly.');
        setPushWorking(true);
      } else if (res.total === 0) {
        setMsg('No subscription found — try disabling and re-enabling notifications.');
        setPushWorking(false);
      } else {
        setMsg('Sent but delivery failed — check VAPID keys in .env');
        setPushWorking(false);
      }
    } catch (err) {
      setMsg('Failed: ' + (err.message || 'Check VAPID keys in .env'));
      setPushWorking(false);
    }
    setTimeout(() => setMsg(''), 8000);
  };

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const notifPermission = typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true">

        <div className="modal-header">
          <h2>Settings</h2>
          <button className="close-btn" onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div className="tab-row">
          {['profile', 'notifications', 'appearance', 'security'].map(t => (
            <button key={t} className={tab === t ? 'active' : ''} onClick={() => { setTab(t); setMsg(''); }}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <div className="modal-body">

          {/* ── Profile ── */}
          {tab === 'profile' && (
            <>
              <div className="avatar-section">
                <div className="avatar-wrap" onClick={() => fileRef.current?.click()}>
                  <Avatar user={user} size={72} />
                  <div className="avatar-overlay">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" stroke="white" strokeWidth="1.5"/>
                      <circle cx="12" cy="13" r="4" stroke="white" strokeWidth="1.5"/>
                    </svg>
                  </div>
                </div>
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarChange} />
                <div>
                  <p className="profile-name">{user?.displayName || user?.username}</p>
                  <p className="profile-handle">@{user?.username}</p>
                </div>
              </div>
              <div className="field">
                <label>Display Name</label>
                <input value={displayName} onChange={e => setDisplayName(e.target.value)} maxLength={50} placeholder="Your name" />
              </div>
              <div className="field">
                <label>Bio</label>
                <textarea value={bio} onChange={e => setBio(e.target.value)} maxLength={200} rows={3} placeholder="Tell others about yourself…" />
              </div>
              {msg && <p className="status-msg">{msg}</p>}
              <button className="primary-btn" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>



            </>
          )}

          {/* ── Notifications ── */}
          {tab === 'notifications' && (
            <>
              {/* iOS non-standalone warning */}
              {isIOS && !standalone && (
                <div className="warn-box">
                  <strong>Add to Home Screen required</strong><br/>
                  iOS push notifications only work when the app is installed as a PWA.
                  Tap Share → "Add to Home Screen", then reopen from there.
                </div>
              )}

              {/* Private/Incognito mode */}
              {isPrivate && (
                <div className="warn-box">
                  🕵️ Private browsing detected — push notifications are blocked by your browser in private/incognito mode. Reopen the app in a normal window to enable them.
                </div>
              )}

              {/* Not supported */}
              {!pushSupported && !isPrivate && !(isIOS && !standalone) && (
                <div className="warn-box">
                  Push notifications aren't supported on this browser.
                  {isIOS ? ' Requires iOS 16.4+ with the app added to your Home Screen.' : ''}
                </div>
              )}

              {/* Supported — show controls */}
              {pushSupported && !isPrivate && (
                <>
                  <div className="setting-row">
                    <div className="setting-text">
                      <p className="setting-label">Push Notifications</p>
                      <p className="setting-desc">
                        {pushEnabled
                          ? "You'll be notified when messages arrive while the app is closed"
                          : "Get notified when messages arrive while the app is closed"}
                      </p>
                    </div>
                    <button
                      className={`toggle ${pushEnabled ? 'on' : ''}`}
                      onClick={pushEnabled ? handleDisableNotifications : handleEnableNotifications}
                      aria-label={pushEnabled ? 'Disable notifications' : 'Enable notifications'}
                    >
                      <span />
                    </button>
                  </div>

                  {notifPermission === 'denied' && (
                    <div className="warn-box">
                      ⚠️ Notifications are blocked.{' '}
                      {isIOS
                        ? 'Go to Settings → [your app] → Notifications to re-enable.'
                        : 'Click the lock/info icon in the address bar to re-enable.'}
                    </div>
                  )}

                  {pushEnabled && (
                    <button className="secondary-btn" onClick={testPush}>
                      Send test notification
                    </button>
                  )}

                  {pushWorking === false && (
                    <div className="warn-box">
                      ⚠️ Subscribed but delivery failed. Check VAPID keys in server .env
                    </div>
                  )}
                </>
              )}

              {msg && <p className="status-msg">{msg}</p>}
            </>
          )}

          {/* ── Appearance ── */}
          {tab === 'appearance' && (
            <>
              <div className="setting-row">
                <div className="setting-text">
                  <p className="setting-label">Theme</p>
                  <p className="setting-desc">Choose between dark and light mode</p>
                </div>
              </div>
              <div className="theme-options">
                <button
                  className={`theme-option ${theme === 'dark' ? 'active' : ''}`}
                  onClick={() => theme !== 'dark' && toggleTheme()}
                >
                  <div className="theme-preview dark-preview">
                    <div className="tp-sidebar" />
                    <div className="tp-main">
                      <div className="tp-bubble tp-bubble-in" />
                      <div className="tp-bubble tp-bubble-out" />
                    </div>
                  </div>
                  <span>Dark</span>
                  {theme === 'dark' && <span className="theme-check">✓</span>}
                </button>
                <button
                  className={`theme-option ${theme === 'light' ? 'active' : ''}`}
                  onClick={() => theme !== 'light' && toggleTheme()}
                >
                  <div className="theme-preview light-preview">
                    <div className="tp-sidebar" />
                    <div className="tp-main">
                      <div className="tp-bubble tp-bubble-in" />
                      <div className="tp-bubble tp-bubble-out" />
                    </div>
                  </div>
                  <span>Light</span>
                  {theme === 'light' && <span className="theme-check">✓</span>}
                </button>
              </div>
            </>
          )}

          {/* ── Security ── */}
          {tab === 'security' && (
            <>
              <div className="setting-row" style={{ background: 'var(--bg-3)', borderRadius: 'var(--radius)', padding: '14px' }}>
                <div className="setting-text">
                  <p className="setting-label">Account Password</p>
                  <p className="setting-desc">Change your login and encryption password</p>
                </div>
                <button className="secondary-btn" onClick={() => { setShowChangePassword(true); setPwMsg(''); setPasswords({ current: '', newPass: '', confirm: '' }); }}>
                  🔑 Change
                </button>
              </div>

              <div className="sessions-section">
                <p className="sessions-label">Active Sessions</p>
                {sessionsLoading ? (
                  <div className="sessions-loading">Loading…</div>
                ) : sessions?.length === 0 ? (
                  <div className="sessions-loading">No sessions found</div>
                ) : (
                  sessions?.map(s => {
                    const isCurrent = s.jti === getSessionJti();
                    const ua = s.userAgent || '';
                    const device = /iphone|ipad/i.test(ua) ? '📱 iPhone/iPad'
                      : /android/i.test(ua) ? '📱 Android'
                      : /macintosh|mac os/i.test(ua) ? '💻 Mac'
                      : /windows/i.test(ua) ? '🖥️ Windows'
                      : /linux/i.test(ua) ? '🖥️ Linux'
                      : '🌐 Unknown device';
                    const browser = /firefox/i.test(ua) ? 'Firefox'
                      : /edg\//i.test(ua) ? 'Edge'
                      : /chrome/i.test(ua) ? 'Chrome'
                      : /safari/i.test(ua) ? 'Safari'
                      : 'Browser';
                    const lastUsed = s.lastUsed ? new Date(s.lastUsed).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
                    return (
                      <div key={s.jti} className={`session-row ${isCurrent ? 'current' : ''}`}>
                        <div className="session-info">
                          <span className="session-device">{device} · {browser}</span>
                          {s.ip && <span className="session-meta">{s.ip} · Last active {lastUsed}</span>}
                          {isCurrent && <span className="session-current-badge">This device</span>}
                        </div>
                        {!isCurrent && (
                          <button
                            className="session-revoke-btn"
                            onClick={() => handleRevokeSession(s.jti)}
                            disabled={revokingJti === s.jti}
                          >
                            {revokingJti === s.jti ? '…' : 'Revoke'}
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              <div className="security-banner">
                <div className="security-icon">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="11" width="18" height="11" rx="2" stroke="#3dd68c" strokeWidth="1.5"/>
                    <path d="M7 11V7a5 5 0 0110 0v4" stroke="#3dd68c" strokeWidth="1.5" strokeLinecap="round"/>
                    <circle cx="12" cy="16.5" r="1.5" fill="#3dd68c"/>
                  </svg>
                </div>
                <h3>End-to-End Encrypted</h3>
                <p>Messages are encrypted on your device before sending. The server only ever stores ciphertext — nobody but you can read them.</p>
              </div>

              <div className="security-grid">
                {[
                  { label: 'Key Exchange', value: 'RSA-OAEP 2048-bit', icon: '🔐' },
                  { label: 'Message Cipher', value: 'AES-256-GCM', icon: '🔒' },
                  { label: 'Key Protection', value: 'PBKDF2 · 100k iterations', icon: '🛡️' },
                  { label: 'Key Backup', value: 'Encrypted on server', icon: '☁️' },
                ].map(({ label, value, icon }, index, arr) => (
                  <div key={label} className="security-row" style={index === arr.length - 1 ? { borderBottom: 'none' } : {}}>
                    <div className="security-row-left">
                      <span className="security-row-icon">{icon}</span>
                      <span className="security-row-label">{label}</span>
                    </div>
                    <span className="security-row-value">{value}</span>
                  </div>
                ))}
              </div>

              {user?.publicKey && (
                <div className="pubkey-box">
                  <div className="pubkey-header">
                    <span className="pubkey-label">Your Public Key</span>
                    <span className="pubkey-note">Shared with contacts to encrypt messages to you</span>
                  </div>
                  <div className="pubkey-value">{user.publicKey.slice(0, 64)}…</div>
                </div>
              )}

              <div className="security-info-row">
                <div className="security-info-card">
                  <span className="sic-icon">🔑</span>
                  <p>Your private key is encrypted with your password. Even the server cannot read your messages.</p>
                </div>
                <div className="security-info-card">
                  <span className="sic-icon">📱</span>
                  <p>Log in from any device with your password to restore your keys automatically.</p>
                </div>
              </div>

              <div className="danger-zone">
                <p className="danger-zone-label">Danger Zone</p>
                <div className="setting-row danger-row">
                  <div className="setting-text">
                    <p className="setting-label">Delete Account</p>
                    <p className="setting-desc">Permanently delete your account and all data</p>
                  </div>
                  <button className="danger-btn" onClick={() => { setShowDeleteAccount(true); setDeleteMsg(''); setDeletePassword(''); }}>
                    Delete
                  </button>
                </div>
              </div>
            </>
          )}

        </div>

        {/* Change Password Modal */}
        {showChangePassword && (
          <div className="cp-overlay" onClick={() => setShowChangePassword(false)}>
            <div className="cp-modal" onClick={e => e.stopPropagation()}>
              <div className="cp-header">
                <h3>Change Password</h3>
                <button className="close-btn" onClick={() => setShowChangePassword(false)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </button>
              </div>
              <p className="cp-note">Your password also protects your encryption keys. After changing it you'll be logged out of all other devices.</p>
              <div className="change-password-form">
                <div className="field">
                  <label>Current Password</label>
                  <input
                    type="password" placeholder="Enter current password"
                    value={passwords.current}
                    onChange={e => setPasswords(p => ({ ...p, current: e.target.value }))}
                    autoFocus
                  />
                </div>
                <div className="field">
                  <label>New Password</label>
                  <input
                    type="password" placeholder="Min 8 characters"
                    value={passwords.newPass}
                    onChange={e => setPasswords(p => ({ ...p, newPass: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <label>Confirm New Password</label>
                  <input
                    type="password" placeholder="Repeat new password"
                    value={passwords.confirm}
                    onChange={e => setPasswords(p => ({ ...p, confirm: e.target.value }))}
                  />
                </div>
                {pwMsg && <p className={`pw-msg ${pwMsg.startsWith('✓') ? 'success' : 'error'}`}>{pwMsg}</p>}
                <div className="cp-actions">
                  <button className="cancel-btn" onClick={() => setShowChangePassword(false)}>Cancel</button>
                  <button className="primary-btn" onClick={handleChangePassword} disabled={pwSaving}>
                    {pwSaving ? 'Updating…' : 'Update Password'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Delete Account Modal */}
        {showDeleteAccount && (
          <div className="cp-overlay" onClick={() => setShowDeleteAccount(false)}>
            <div className="cp-modal" onClick={e => e.stopPropagation()}>
              <div className="cp-header">
                <h3>Delete Account</h3>
                <button className="close-btn" onClick={() => setShowDeleteAccount(false)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </button>
              </div>
              <p className="cp-note danger-note">This will permanently delete your account, remove you from all conversations, and cannot be undone.</p>
              <div className="change-password-form">
                <div className="field">
                  <label>Confirm your password</label>
                  <input
                    type="password" placeholder="Enter your password"
                    value={deletePassword}
                    onChange={e => setDeletePassword(e.target.value)}
                    autoFocus
                  />
                </div>
                {deleteMsg && <p className="pw-msg error">{deleteMsg}</p>}
                <div className="cp-actions">
                  <button className="cancel-btn" onClick={() => setShowDeleteAccount(false)}>Cancel</button>
                  <button className="danger-btn" onClick={handleDeleteAccount} disabled={deleting}>
                    {deleting ? 'Deleting…' : 'Delete My Account'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="modal-footer">
          <button onClick={logout} className="logout-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <polyline points="16 17 21 12 16 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <line x1="21" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            Sign Out
          </button>
        </div>
      </div>

      <style>{`
        .modal-overlay {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          z-index: 1000;
          background: rgba(0,0,0,0.7);
          display: flex;
          align-items: flex-end;
          justify-content: center;
          padding-bottom: env(safe-area-inset-bottom);
        }
        @media (min-width: 480px) {
          .modal-overlay { align-items: center; padding-bottom: 0; }
        }
        .modal {
          width: 100%; max-width: 440px;
          background: var(--bg-2);
          border: 1px solid var(--border);
          border-radius: 24px 24px 0 0;
          max-height: 92dvh;
          min-height: 620px;
          display: flex; flex-direction: column;
          animation: slideUp 0.25s ease;
        }
        @media (min-width: 480px) {
          .modal { border-radius: 24px; max-height: 85dvh; min-height: 580px; }
        }
        .modal-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 20px 20px 14px; border-bottom: 1px solid var(--border);
          flex-shrink: 0; background: var(--bg-2); border-radius: 24px 24px 0 0;
        }
        @media (min-width: 480px) { .modal-header { border-radius: 24px 24px 0 0; } }
        .modal-header h2 { font-size: 17px; font-weight: 600; color: var(--text-0); }
        .close-btn {
          width: 32px; height: 32px; display: flex; align-items: center;
          justify-content: center; border-radius: 8px; color: var(--text-2);
          transition: all 150ms;
        }
        .close-btn:hover, .close-btn:active { background: var(--bg-3); color: var(--text-0); }
        .tab-row {
          display: flex; padding: 0 20px;
          border-bottom: 1px solid var(--border);
          flex-shrink: 0; overflow-x: auto; background: var(--bg-2);
        }
        .tab-row button {
          padding: 12px 14px; font-size: 13px; font-weight: 500;
          color: var(--text-3); border-bottom: 2px solid transparent;
          transition: all 150ms; white-space: nowrap;
        }
        .tab-row button.active { color: var(--accent); border-bottom-color: var(--accent); }
        .modal-body {
          flex: 1 1 0;
          min-height: 0;
          overflow-y: auto;
          padding: 20px;
          -webkit-overflow-scrolling: touch;
          background: var(--bg-2);
          scrollbar-width: thin;
          scrollbar-color: rgba(255,255,255,0.15) transparent;
        }
        .modal-body > * + * { margin-top: 16px; }
        .modal-body::-webkit-scrollbar { width: 4px; }
        .modal-body::-webkit-scrollbar-track { background: transparent; }
        .modal-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 4px; }
        .avatar-section {
          display: flex; align-items: center; gap: 16px;
          padding-bottom: 16px; border-bottom: 1px solid var(--border);
        }
        .avatar-wrap { position: relative; cursor: pointer; flex-shrink: 0; border-radius: 50%; overflow: hidden; }
        .avatar-overlay {
          position: absolute; inset: 0; background: rgba(0,0,0,0.5);
          display: flex; align-items: center; justify-content: center;
          opacity: 0; transition: opacity 150ms;
        }
        .avatar-wrap:hover .avatar-overlay, .avatar-wrap:active .avatar-overlay { opacity: 1; }
        .profile-name { font-weight: 500; font-size: 15px; color: var(--text-0); }
        .profile-handle { font-size: 13px; color: var(--text-3); margin-top: 2px; }
        .field { display: flex; flex-direction: column; gap: 6px; }
        .field label { font-size: 13px; color: var(--text-2); font-weight: 500; }
        .field input, .field textarea {
          background: var(--bg-3); border: 1px solid var(--border);
          border-radius: 12px; padding: 11px 13px;
          font-size: 16px; color: var(--text-0); transition: border-color 150ms;
          -webkit-appearance: none;
        }
        .field input:focus, .field textarea:focus { border-color: var(--accent); outline: none; }
        .status-msg { font-size: 13px; color: var(--green); }
        .cp-overlay {
          position: fixed; inset: 0; z-index: 1100;
          background: rgba(0,0,0,0.7);
          display: flex; align-items: center; justify-content: center;
          padding: 24px; animation: fadeIn 0.15s ease;
        }
        .cp-modal {
          background: var(--bg-2); border: 1px solid var(--border);
          border-radius: var(--radius-xl); padding: 24px;
          width: 100%; max-width: 400px;
          animation: slideUp 0.2s ease;
        }
        .cp-header {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 12px;
        }
        .cp-header h3 { font-size: 16px; font-weight: 600; color: var(--text-0); }
        .cp-note {
          font-size: 13px; color: var(--text-2); line-height: 1.6;
          margin-bottom: 16px; padding: 10px 12px;
          background: var(--bg-3); border-radius: var(--radius);
        }
        .cp-actions {
          display: flex; gap: 10px; margin-top: 4px;
        }
        .cp-actions .cancel-btn {
          flex: 1; padding: 10px; border-radius: var(--radius);
          background: var(--bg-3); color: var(--text-1);
          font-size: 14px; font-weight: 500; transition: all var(--transition);
        }
        .cp-actions .cancel-btn:hover { background: var(--bg-4); }
        .cp-actions .primary-btn { flex: 1; }
        .section-divider {
          height: 1px; background: var(--border); margin: 4px 0;
        }
        .change-password-form {
          display: flex; flex-direction: column; gap: 10px;
          background: var(--bg-3); border-radius: var(--radius);
          padding: 14px;
        }
        .change-password-form input {
          background: var(--bg-2); border: 1px solid var(--border);
          border-radius: var(--radius); padding: 10px 12px;
          font-size: 14px; color: var(--text-0); width: 100%;
        }
        .change-password-form input:focus { border-color: var(--accent); }
        .pw-msg { font-size: 13px; }
        .pw-msg.success { color: var(--green); }
        .pw-msg.error { color: var(--red); }
        .danger-zone { }
        .danger-zone-label { font-size: 11px; font-weight: 600; color: var(--red); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 10px; }
        .danger-row { border: 1px solid rgba(255,80,80,0.2); border-radius: var(--radius); background: rgba(255,80,80,0.04); padding: 14px; }
        .danger-btn { background: transparent; border: 1px solid var(--red); color: var(--red); border-radius: var(--radius); padding: 8px 14px; font-size: 13px; font-weight: 500; cursor: pointer; }
        .danger-btn:hover { background: rgba(255,80,80,0.1); }
        .danger-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .danger-note { color: var(--red) !important; }
        .primary-btn {
          background: var(--accent); color: white; border-radius: 12px;
          padding: 12px; font-size: 15px; font-weight: 500; transition: all 150ms;
        }
        .primary-btn:hover:not(:disabled) { background: #8b84ff; }
        .primary-btn:disabled { opacity: 0.5; }
        .secondary-btn {
          background: var(--bg-3); color: var(--text-1); border: 1px solid var(--border);
          border-radius: 12px; padding: 10px 14px; font-size: 14px; transition: all 150ms;
        }
        .secondary-btn:hover { background: var(--bg-4); }
        .setting-row {
          display: flex; align-items: center; justify-content: space-between; gap: 16px;
        }
        .setting-text { flex: 1; }
        .setting-label { font-size: 14px; font-weight: 500; color: var(--text-0); margin-bottom: 3px; }
        .setting-desc { font-size: 12px; color: var(--text-3); line-height: 1.4; }
        .toggle {
          width: 48px; height: 28px; border-radius: 9999px;
          background: var(--bg-4); position: relative; transition: background 0.2s;
          flex-shrink: 0; border: none; cursor: pointer; padding: 0;
        }
        .toggle.on { background: var(--accent); }
        .toggle span {
          position: absolute; top: 5px; left: 5px;
          width: 18px; height: 18px; border-radius: 50%;
          background: white; transition: transform 0.2s;
          box-shadow: 0 1px 3px rgba(0,0,0,0.3);
          display: block;
        }
        .toggle.on span { transform: translateX(20px); }
        .warn-box {
          background: rgba(255,193,7,0.1); border: 1px solid rgba(255,193,7,0.3);
          border-radius: 12px; padding: 12px 14px;
          font-size: 12px; line-height: 1.6; color: var(--text-1);
        }
        .security-banner {
          text-align: center; padding: 20px 16px;
          background: rgba(61,214,140,0.08); border: 1px solid var(--green-dim);
          border-radius: 16px;
        }
        .security-icon { margin-bottom: 12px; }
        .security-banner h3 { color: var(--green); font-size: 16px; font-weight: 600; margin-bottom: 8px; }
        .security-banner p { font-size: 13px; color: var(--text-2); line-height: 1.6; }
        .security-grid {
          background: var(--bg-3); border-radius: 12px;
          border: 1px solid var(--border); overflow: hidden;
        }
        .security-row {
          display: flex; justify-content: space-between; align-items: center;
          padding: 13px 14px; gap: 12px; flex-wrap: wrap;
        }
        .security-row + .security-row {
          border-top: 1px solid var(--border);
        }
        .security-row-left {
          display: flex; align-items: center; gap: 10px; flex-shrink: 0;
        }
        .security-row-icon { font-size: 16px; line-height: 1; }
        .security-row-label { font-size: 13px; color: var(--text-2); }
        .security-row-value {
          font-size: 13px; color: var(--text-1); font-weight: 500;
          text-align: right; word-break: break-all;
        }
        .pubkey-box {
          background: var(--bg-3); border: 1px solid var(--border);
          border-radius: 12px; padding: 13px 14px;
        }
        .pubkey-header { margin-bottom: 8px; }
        .pubkey-label { display: block; font-size: 13px; color: var(--text-2); margin-bottom: 2px; }
        .pubkey-note { display: block; font-size: 11px; color: var(--text-3); }
        .pubkey-value {
          font-size: 11px; color: var(--text-1); font-family: 'JetBrains Mono', ui-monospace, monospace;
          word-break: break-all; line-height: 1.6;
          background: rgba(0,0,0,0.2); border-radius: 8px;
          padding: 8px 10px;
        }
        .security-info-row {
          display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
        }
        @media (max-width: 380px) {
          .security-info-row { grid-template-columns: 1fr; }
        }
        .security-info-card {
          background: var(--bg-3); border: 1px solid var(--border);
          border-radius: 12px; padding: 12px 13px;
          display: flex; flex-direction: column; gap: 6px;
        }
        .sic-icon { font-size: 18px; }
        .security-info-card p { font-size: 12px; color: var(--text-2); line-height: 1.6; margin: 0; }
        .modal-footer {
          padding: 12px 20px;
          padding-bottom: max(12px, env(safe-area-inset-bottom));
          border-top: 1px solid var(--border);
          flex-shrink: 0; background: var(--bg-2);
          border-radius: 0 0 24px 24px;
        }
        .theme-options {
          display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
        }
        .theme-option {
          display: flex; flex-direction: column; align-items: center; gap: 10px;
          padding: 14px; border-radius: var(--radius);
          border: 2px solid var(--border); background: var(--bg-3);
          color: var(--text-1); font-size: 13px; font-weight: 500;
          transition: all var(--transition); position: relative;
        }
        .theme-option:hover { border-color: var(--border-strong); }
        .theme-option.active { border-color: var(--accent); background: var(--accent-dim); color: var(--accent); }
        .theme-preview {
          width: 100%; height: 80px; border-radius: 8px;
          overflow: hidden; display: flex;
        }
        .dark-preview { background: #0f0f13; }
        .light-preview { background: #f5f5fa; }
        .tp-sidebar { width: 35%; height: 100%; }
        .dark-preview .tp-sidebar { background: #161620; }
        .light-preview .tp-sidebar { background: #ebebf2; }
        .tp-main { flex: 1; padding: 6px; display: flex; flex-direction: column; gap: 4px; justify-content: center; }
        .tp-bubble { height: 12px; border-radius: 6px; }
        .tp-bubble-in { width: 70%; }
        .tp-bubble-out { width: 55%; align-self: flex-end; }
        .dark-preview .tp-bubble-in { background: #1e1e2a; }
        .dark-preview .tp-bubble-out { background: var(--accent); }
        .light-preview .tp-bubble-in { background: #ffffff; }
        .light-preview .tp-bubble-out { background: var(--accent); }
        .theme-check {
          position: absolute; top: 8px; right: 8px;
          width: 18px; height: 18px; background: var(--accent);
          border-radius: 50%; color: white; font-size: 11px;
          display: flex; align-items: center; justify-content: center;
        }
        .theme-toggle {
          display: flex; align-items: center; gap: 8px;
          padding: 8px 14px; border-radius: var(--radius);
          background: var(--bg-3); border: 1px solid var(--border-strong);
          color: var(--text-1); font-size: 13px; font-weight: 500;
          transition: all var(--transition); flex-shrink: 0;
        }
        .theme-toggle:hover { background: var(--bg-4); color: var(--text-0); }
        .sessions-section {
          background: var(--bg-3); border: 1px solid var(--border);
          border-radius: 12px; overflow: hidden;
        }
        .sessions-label {
          font-size: 11px; font-weight: 600; color: var(--text-3);
          text-transform: uppercase; letter-spacing: 0.05em;
          padding: 10px 14px 8px; border-bottom: 1px solid var(--border);
        }
        .sessions-loading {
          padding: 14px; font-size: 13px; color: var(--text-3); text-align: center;
        }
        .session-row {
          display: flex; align-items: center; justify-content: space-between;
          padding: 11px 14px; gap: 12px;
          border-bottom: 1px solid var(--border);
        }
        .session-row:last-child { border-bottom: none; }
        .session-row.current { background: rgba(108,99,255,0.05); }
        .session-info { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
        .session-device { font-size: 13px; color: var(--text-0); font-weight: 500; }
        .session-meta { font-size: 11px; color: var(--text-3); }
        .session-current-badge {
          display: inline-block; font-size: 10px; font-weight: 600;
          color: var(--accent); background: var(--accent-dim);
          padding: 1px 7px; border-radius: 10px; width: fit-content;
        }
        .session-revoke-btn {
          font-size: 12px; color: var(--red); padding: 4px 10px;
          border: 1px solid rgba(255,80,80,0.3); border-radius: 8px;
          background: transparent; cursor: pointer; flex-shrink: 0;
          transition: all 150ms;
        }
        .session-revoke-btn:hover { background: rgba(255,80,80,0.1); }
        .session-revoke-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .logout-btn {
          display: flex; align-items: center; gap: 8px;
          color: var(--red); font-size: 14px; font-weight: 500;
          padding: 9px 12px; border-radius: 12px; transition: background 150ms;
        }
        .logout-btn:hover, .logout-btn:active { background: rgba(255,87,87,0.1); }
      `}</style>
    </div>
  );
}
