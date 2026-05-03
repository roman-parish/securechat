/**
 * SecureChat — End-to-End Encrypted Messaging
 * Copyright (c) 2026 Roman Parish
 * Licensed under the MIT License — see LICENSE file for details
 *
 * https://github.com/roman-parish/securechat
 */
import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../utils/api.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useChat } from '../contexts/ChatContext.jsx';
import Avatar from './Avatar.jsx';
import { formatDistanceToNow } from 'date-fns';

const ACTION_LABELS = {
  'user.ban': 'Suspended',
  'user.unban': 'Unsuspended',
  'user.delete': 'Deleted user',
  'user.password_reset': 'Reset password',
  'user.reset_2fa': 'Reset 2FA',
  'invite.create': 'Created invite',
  'invite.revoke': 'Revoked invite',
  'settings.registration_toggle': 'Registration',
};

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function AdminPage({ onBack }) {
  const { user } = useAuth();
  const { onlineUsers } = useChat();
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [resetPassword, setResetPassword] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [reset2faUser, setReset2faUser] = useState(null);
  const [registrationOpen, setRegistrationOpen] = useState(true);
  const [invites, setInvites] = useState([]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteExpiry, setInviteExpiry] = useState('24');
  const [inviteResult, setInviteResult] = useState(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const loadStats = useCallback(async () => {
    try {
      const data = await apiFetch('/admin/stats');
      setStats(data);
    } catch {}
  }, []);

  const loadUsers = useCallback(async (q = '') => {
    setLoading(true);
    try {
      const data = await apiFetch(`/admin/users?search=${encodeURIComponent(q)}&limit=100`);
      setUsers(data.users);
      setTotal(data.total);
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  const loadInvites = useCallback(async () => {
    try {
      const data = await apiFetch('/admin/invites');
      setInvites(data.invites);
    } catch {}
  }, []);

  useEffect(() => {
    loadStats();
    loadUsers();
    loadInvites();
    apiFetch('/admin/settings').then(d => setRegistrationOpen(d.registrationOpen)).catch(() => {});
    setAuditLoading(true);
    apiFetch('/admin/audit').then(d => setAuditLogs(d.logs)).catch(() => {}).finally(() => setAuditLoading(false));
  }, [loadStats, loadUsers, loadInvites]);

  const handleCreateInvite = async () => {
    setInviteLoading(true);
    try {
      const data = await apiFetch('/admin/invites', {
        method: 'POST',
        body: JSON.stringify({ email: inviteEmail || undefined, expiryHours: Number(inviteExpiry) }),
      });
      setInviteResult(data.inviteUrl);
      loadInvites();
    } catch (err) {
      setActionMsg('Error: ' + err.message);
      setShowInviteModal(false);
    } finally {
      setInviteLoading(false);
    }
  };

  const handleRevokeInvite = async (id) => {
    try {
      await apiFetch(`/admin/invites/${id}`, { method: 'DELETE' });
      setInvites(prev => prev.filter(i => i._id !== id));
    } catch (err) {
      setActionMsg('Error: ' + err.message);
    }
  };

  const handleToggleRegistration = async () => {
    const next = !registrationOpen;
    try {
      const data = await apiFetch('/admin/settings', {
        method: 'PUT',
        body: JSON.stringify({ registrationOpen: next }),
      });
      setRegistrationOpen(data.registrationOpen);
      setActionMsg(`Registration ${data.registrationOpen ? 'opened' : 'closed'}`);
      setTimeout(() => setActionMsg(''), 3000);
    } catch (err) {
      setActionMsg('Error: ' + err.message);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => loadUsers(search), 300);
    return () => clearTimeout(timer);
  }, [search, loadUsers]);

  const handleReset2fa = async () => {
    try {
      await apiFetch(`/admin/users/${reset2faUser._id}/reset-2fa`, { method: 'PUT' });
      setActionMsg(`2FA reset for ${reset2faUser.username}`);
      setReset2faUser(null);
      setTimeout(() => setActionMsg(''), 3000);
    } catch (err) {
      setActionMsg('Error: ' + err.message);
    }
  };

  const handleBan = async (u) => {
    try {
      const res = await apiFetch(`/admin/users/${u._id}/ban`, { method: 'PUT' });
      setUsers(prev => prev.map(x => x._id === u._id ? { ...x, banned: res.banned } : x));
      setActionMsg(`${u.username} ${res.banned ? 'suspended' : 'unsuspended'}`);
      setTimeout(() => setActionMsg(''), 3000);
    } catch (err) {
      setActionMsg('Error: ' + err.message);
    }
  };

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 8) {
      setActionMsg('Password must be at least 8 characters');
      return;
    }
    try {
      await apiFetch(`/admin/users/${resetPassword._id}/reset-password`, {
        method: 'PUT',
        body: JSON.stringify({ newPassword }),
      });
      setResetPassword(null);
      setNewPassword('');
      setActionMsg(`Password reset for ${resetPassword.username}`);
      setTimeout(() => setActionMsg(''), 3000);
    } catch (err) {
      setActionMsg('Error: ' + err.message);
    }
  };

  const handleDelete = async (u) => {
    try {
      await apiFetch(`/admin/users/${u._id}`, { method: 'DELETE' });
      setUsers(prev => prev.filter(x => x._id !== u._id));
      setTotal(t => t - 1);
      setConfirmDelete(null);
      setActionMsg(`${u.username} deleted`);
      setTimeout(() => setActionMsg(''), 3000);
    } catch (err) {
      setActionMsg('Error: ' + err.message);
    }
  };

  return (
    <div className="admin-page">
      {/* Header */}
      <div className="admin-header">
        <button className="back-btn" onClick={onBack}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Back to Chat
        </button>
        <div className="admin-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L3 7l9 5 9-5-9-5z" stroke="var(--accent)" strokeWidth="1.5" strokeLinejoin="round"/>
            <path d="M3 12l9 5 9-5" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M3 17l9 5 9-5" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Admin Panel
        </div>
        <div style={{ width: 100, flexShrink: 1 }} />
      </div>

      <div className="admin-content">
        {/* Stats */}
        {stats && (
          <>
            <div className="stats-row">
              <div className="stat-card">
                <span className="stat-value">{stats.totalUsers}</span>
                <span className="stat-label">Total Users</span>
              </div>
              <div className="stat-card">
                <span className="stat-value">{stats.totalMessages}</span>
                <span className="stat-label">Messages</span>
              </div>
              <div className="stat-card">
                <span className="stat-value">{stats.totalConversations}</span>
                <span className="stat-label">Conversations</span>
              </div>
              <div className="stat-card">
                <span className="stat-value">{stats.activeToday}</span>
                <span className="stat-label">Active Today</span>
              </div>
              <div className="stat-card">
                <span className="stat-value">{stats.newUsersThisWeek}</span>
                <span className="stat-label">New This Week</span>
              </div>
              <div className="stat-card">
                <span className="stat-value">{formatBytes(stats.storageBytes)}</span>
                <span className="stat-label">Storage Used</span>
              </div>
            </div>

          </>
        )}

        {/* Settings */}
        <div className="settings-row">
          <div className="settings-item">
            <div>
              <span className="settings-label">Open Registration</span>
              <span className="settings-hint">Allow new users to create accounts</span>
            </div>
            <button
              className={`toggle-btn ${registrationOpen ? 'on' : 'off'}`}
              onClick={handleToggleRegistration}
              title={registrationOpen ? 'Click to close registration' : 'Click to open registration'}
            >
              <span className="toggle-knob" />
            </button>
          </div>
        </div>

        {/* Invites */}
        <div className="settings-row">
          <div className="settings-item" style={{ borderBottom: invites.length > 0 ? '1px solid var(--border)' : 'none' }}>
            <div>
              <span className="settings-label">Invite Links</span>
              <span className="settings-hint">{invites.length} active invite{invites.length !== 1 ? 's' : ''}</span>
            </div>
            <button className="invite-create-btn"
              onClick={() => { setInviteEmail(''); setInviteExpiry('24'); setInviteResult(null); setShowInviteModal(true); }}>
              Create invite
            </button>
          </div>
          {invites.map(invite => (
            <div key={invite._id} className="invite-row">
              <div>
                <span className="invite-email">{invite.email || 'No email — link only'}</span>
                <span className="invite-expiry">Expires {formatDistanceToNow(new Date(invite.expiresAt), { addSuffix: true })}</span>
              </div>
              <button className="action-btn delete" style={{ flexShrink: 0 }} onClick={() => handleRevokeInvite(invite._id)} title="Revoke">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="search-bar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="7" stroke="var(--text-3)" strokeWidth="1.5"/>
            <path d="M16.5 16.5L21 21" stroke="var(--text-3)" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <input
            placeholder="Search users..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <span className="user-count">{total} users</span>
        </div>

        {/* Action message */}
        {actionMsg && <div className="action-msg">{actionMsg}</div>}

        {/* User table */}
        <div className="user-table">
          <div className="table-header">
            <span>User</span>
            <span className="col-hide">Email</span>
            <span className="col-hide">Joined</span>
            <span className="col-hide">Last Seen</span>
            <span className="col-hide">2FA</span>
            <span>Status / Actions</span>
          </div>

          {loading ? (
            <div className="table-loading">Loading users...</div>
          ) : users.length === 0 ? (
            <div className="table-loading">No users found</div>
          ) : (
            users.map(u => (
              <div key={u._id} className={`table-row ${u.banned ? 'banned' : ''}`}>
                <div className="user-cell">
                  <div className="avatar-online-wrap">
                    <Avatar user={u} size={32} />
                    {onlineUsers.has(String(u._id)) && <span className="online-dot" />}
                  </div>
                  <div>
                    <span className="username">{u.displayName || u.username}</span>
                    <span className="handle">@{u.username}</span>
                  </div>
                </div>
                <span className="col-hide email">{u.email}</span>
                <span className="col-hide date">
                  {u.createdAt ? formatDistanceToNow(new Date(u.createdAt), { addSuffix: true }) : '—'}
                </span>
                <span className="col-hide date">
                  {u.lastSeen ? formatDistanceToNow(new Date(u.lastSeen), { addSuffix: true }) : '—'}
                </span>
                <span className={`status-badge col-hide ${u.twoFactorEnabled ? 'twofa-on' : 'twofa-off'}`}>
                  {u.twoFactorEnabled ? 'On' : 'Off'}
                </span>
                <div className="table-row-meta">
                  <span className={`status-badge ${u.banned ? 'banned' : 'active'}`}>
                    {u.banned ? 'Suspended' : 'Active'}
                  </span>
                  <div className="actions">
                    {String(u._id) !== String(user?._id) && (
                      <>
                        <button
                          className={`action-btn ${u.banned ? 'unban' : 'ban'}`}
                          onClick={() => handleBan(u)}
                          title={u.banned ? 'Unsuspend' : 'Suspend'}
                        >
                          {u.banned ? (
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                              <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          ) : (
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5"/>
                              <path d="M4.93 4.93l14.14 14.14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                            </svg>
                          )}
                        </button>
                        <button
                          className="action-btn reset"
                          onClick={() => { setResetPassword(u); setNewPassword(''); }}
                          title="Reset password"
                        >
                          🔑
                        </button>
                        <button
                          className="action-btn reset"
                          onClick={() => setReset2faUser(u)}
                          title="Reset 2FA"
                        >
                          🔐
                        </button>
                        <button
                          className="action-btn delete"
                          onClick={() => setConfirmDelete(u)}
                          title="Delete user"
                        >
                          🗑
                        </button>
                      </>
                    )}
                    {String(u._id) === String(user?._id) && (
                      <span className="you-badge">You</span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Audit Log */}
        <div className="audit-section">
          <div className="audit-header">
            <span className="audit-title">Audit Log</span>
            <span className="audit-count">{auditLogs.length} entries</span>
          </div>
          {auditLoading ? (
            <div className="audit-empty">Loading…</div>
          ) : auditLogs.length === 0 ? (
            <div className="audit-empty">No activity recorded yet</div>
          ) : (
            auditLogs.map(log => (
              <div key={log._id} className="audit-row">
                <span className={`audit-badge audit-${log.action.split('.')[1]}`}>
                  {ACTION_LABELS[log.action] || log.action}
                </span>
                <span className="audit-actor">{log.performedByUsername}</span>
                {log.targetUsername && (
                  <span className="audit-target">→ {log.targetUsername}</span>
                )}
                {log.action === 'invite.create' && log.metadata?.email && (
                  <span className="audit-target">→ {log.metadata.email}</span>
                )}
                {log.action === 'settings.registration_toggle' && (
                  <span className="audit-target">{log.metadata?.registrationOpen ? 'opened' : 'closed'}</span>
                )}
                <span className="audit-time">{formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Create invite modal */}
      {showInviteModal && !inviteResult && (
        <div className="confirm-overlay" onClick={() => setShowInviteModal(false)}>
          <div className="confirm-modal" onClick={e => e.stopPropagation()}>
            <h3>Create invite link</h3>
            <p>Generate a single-use link. Optionally send it by email.</p>
            <input
              type="email" placeholder="Email address (optional)"
              value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
              className="modal-input"
            />
            <select value={inviteExpiry} onChange={e => setInviteExpiry(e.target.value)} className="modal-select">
              <option value="24">Expires in 24 hours</option>
              <option value="72">Expires in 3 days</option>
              <option value="168">Expires in 7 days</option>
              <option value="720">Expires in 30 days</option>
            </select>
            <div className="confirm-actions">
              <button className="cancel-btn" onClick={() => setShowInviteModal(false)}>Cancel</button>
              <button className="confirm-delete-btn" style={{ background: 'var(--accent)' }} disabled={inviteLoading} onClick={handleCreateInvite}>
                {inviteLoading ? 'Creating…' : inviteEmail ? 'Create & send email' : 'Create link'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invite result modal */}
      {showInviteModal && inviteResult && (
        <div className="confirm-overlay" onClick={() => { setShowInviteModal(false); setInviteResult(null); }}>
          <div className="confirm-modal" onClick={e => e.stopPropagation()}>
            <h3>Invite link created</h3>
            {inviteEmail && <p>An email has been sent to <strong>{inviteEmail}</strong>.</p>}
            <p style={{ fontSize: 13, color: 'var(--text-2)' }}>Copy and share this link — it can only be used once:</p>
            <div style={{ background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px 12px', fontSize: 12, color: 'var(--text-1)', wordBreak: 'break-all', fontFamily: 'monospace' }}>
              {inviteResult}
            </div>
            <div className="confirm-actions">
              <button className="cancel-btn" onClick={() => navigator.clipboard.writeText(inviteResult)}>Copy link</button>
              <button className="confirm-delete-btn" style={{ background: 'var(--accent)' }} onClick={() => { setShowInviteModal(false); setInviteResult(null); }}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* Reset password modal */}
      {resetPassword && (
        <div className="confirm-overlay" onClick={() => setResetPassword(null)}>
          <div className="confirm-modal" onClick={e => e.stopPropagation()}>
            <h3>Reset password</h3>
            <p>Set a new password for <strong>{resetPassword.username}</strong>. This will log them out of all devices.</p>
            <input
              type="password"
              placeholder="New password (min 8 characters)"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              className="modal-input"
              autoFocus
            />
            <div className="confirm-actions">
              <button className="cancel-btn" onClick={() => setResetPassword(null)}>Cancel</button>
              <button className="confirm-delete-btn" style={{ background: 'var(--accent)' }} onClick={handleResetPassword}>
                Reset Password
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset 2FA confirmation modal */}
      {reset2faUser && (
        <div className="confirm-overlay" onClick={() => setReset2faUser(null)}>
          <div className="confirm-modal" onClick={e => e.stopPropagation()}>
            <h3>Reset 2FA?</h3>
            <p>This will disable two-factor authentication for <strong>{reset2faUser.username}</strong>. They will be able to log in with just their password until they re-enable it.</p>
            <div className="confirm-actions">
              <button className="cancel-btn" onClick={() => setReset2faUser(null)}>Cancel</button>
              <button className="confirm-delete-btn" style={{ background: 'var(--accent)' }} onClick={handleReset2fa}>Reset 2FA</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="confirm-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="confirm-modal" onClick={e => e.stopPropagation()}>
            <h3>Delete user?</h3>
            <p>This will permanently delete <strong>{confirmDelete.username}</strong> and all their messages. This cannot be undone.</p>
            <div className="confirm-actions">
              <button className="cancel-btn" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button className="confirm-delete-btn" onClick={() => handleDelete(confirmDelete)}>Delete permanently</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        /* ── Page shell ─────────────────────────────────────────────── */
        .admin-page {
          display: flex; flex-direction: column;
          height: 100dvh; background: var(--bg-0); overflow: hidden;
        }
        .admin-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 20px; border-bottom: 1px solid var(--border);
          background: var(--bg-1); flex-shrink: 0; gap: 12px;
        }
        .back-btn {
          display: flex; align-items: center; gap: 6px;
          font-size: 14px; color: var(--text-2); padding: 8px 12px;
          border-radius: var(--radius); transition: all var(--transition);
          flex-shrink: 0;
        }
        .back-btn:hover { background: var(--bg-3); color: var(--text-0); }
        .admin-title {
          display: flex; align-items: center; gap: 8px;
          font-size: 16px; font-weight: 600; color: var(--text-0);
        }
        .admin-content {
          flex: 1; min-height: 0; overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          padding: 20px;
          display: flex; flex-direction: column; gap: 16px;
        }

        /* ── Stats ──────────────────────────────────────────────────── */
        .stats-row {
          display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;
        }
        @media (min-width: 900px) { .stats-row { grid-template-columns: repeat(6, 1fr); } }
        .stat-card {
          background: var(--bg-2); border: 1px solid var(--border);
          border-radius: var(--radius); padding: 14px 12px;
          display: flex; flex-direction: column; gap: 4px;
        }
        .stat-value { font-size: 22px; font-weight: 700; color: var(--text-0); line-height: 1.1; }
        .stat-label { font-size: 11px; color: var(--text-3); }

        /* ── Settings / Invites ─────────────────────────────────────── */
        .settings-row {
          background: var(--bg-2); border: 1px solid var(--border);
          border-radius: var(--radius); overflow: hidden;
        }
        .settings-item {
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 16px; gap: 16px;
        }
        .settings-label { display: block; font-size: 14px; font-weight: 500; color: var(--text-0); }
        .settings-hint { display: block; font-size: 12px; color: var(--text-3); margin-top: 2px; }
        .toggle-btn {
          width: 44px; height: 24px; border-radius: 12px;
          position: relative; flex-shrink: 0; cursor: pointer;
          transition: background 0.2s;
        }
        .toggle-btn.on { background: var(--accent); }
        .toggle-btn.off { background: var(--bg-4); }
        .toggle-knob {
          position: absolute; top: 3px;
          width: 18px; height: 18px; border-radius: 50%;
          background: white; transition: left 0.2s;
        }
        .toggle-btn.on .toggle-knob { left: 23px; }
        .toggle-btn.off .toggle-knob { left: 3px; }
        .invite-create-btn {
          padding: 8px 14px; background: var(--accent); color: white;
          border-radius: var(--radius); font-size: 13px; font-weight: 500;
          transition: all var(--transition); flex-shrink: 0; white-space: nowrap;
        }
        .invite-create-btn:hover { background: var(--accent-light); }
        .invite-row {
          display: flex; align-items: center; justify-content: space-between;
          padding: 10px 16px; border-top: 1px solid var(--border); gap: 12px;
        }
        .invite-email { display: block; font-size: 13px; color: var(--text-1); }
        .invite-expiry { display: block; font-size: 12px; color: var(--text-3); margin-top: 2px; }

        /* ── Search bar ─────────────────────────────────────────────── */
        .search-bar {
          display: flex; align-items: center; gap: 10px;
          background: var(--bg-2); border: 1px solid var(--border);
          border-radius: var(--radius); padding: 10px 14px;
        }
        .search-bar input {
          flex: 1; background: none; border: none;
          font-size: 14px; color: var(--text-0); min-width: 0;
        }
        .search-bar input::placeholder { color: var(--text-3); }
        .user-count { font-size: 12px; color: var(--text-3); flex-shrink: 0; }
        .action-msg {
          background: var(--accent-dim); border: 1px solid var(--accent);
          border-radius: var(--radius); padding: 10px 14px;
          font-size: 13px; color: var(--accent);
        }

        /* ── User table — desktop ───────────────────────────────────── */
        .user-table {
          background: var(--bg-2); border: 1px solid var(--border);
          border-radius: var(--radius); overflow: hidden;
        }
        .table-header {
          display: grid;
          grid-template-columns: 2fr 2fr 1fr 1fr 0.7fr 1fr 1.5fr;
          padding: 10px 16px; background: var(--bg-3);
          border-bottom: 1px solid var(--border);
          font-size: 11px; font-weight: 600; color: var(--text-3);
          text-transform: uppercase; letter-spacing: 0.05em;
        }
        .table-loading {
          padding: 32px; text-align: center;
          color: var(--text-3); font-size: 14px;
        }
        .table-row {
          display: grid;
          grid-template-columns: 2fr 2fr 1fr 1fr 0.7fr 1fr 1.5fr;
          padding: 12px 16px; align-items: center;
          border-bottom: 1px solid var(--border);
          transition: background var(--transition);
        }
        .table-row:last-child { border-bottom: none; }
        .table-row:hover { background: var(--bg-3); }
        .table-row.banned { opacity: 0.6; }
        /* table-row-meta is transparent on desktop — its children are direct grid items */
        .table-row-meta { display: contents; }

        /* ── User table — tablet (hide detail cols) ─────────────────── */
        @media (max-width: 860px) {
          .table-header { grid-template-columns: 2fr 1fr 1.5fr; }
          .table-row { grid-template-columns: 2fr 1fr 1.5fr; }
          .col-hide { display: none; }
        }

        /* ── User table — mobile (card layout) ──────────────────────── */
        @media (max-width: 600px) {
          .table-header { display: none; }
          .table-row {
            display: flex; flex-direction: column;
            align-items: stretch; gap: 10px;
            padding: 14px;
          }
          .table-row-meta {
            display: flex; align-items: center;
            gap: 8px; flex-wrap: wrap;
          }
          .col-hide { display: none; }
        }

        /* ── User cell ──────────────────────────────────────────────── */
        .user-cell { display: flex; align-items: center; gap: 10px; min-width: 0; }
        .user-cell > div { min-width: 0; }
        .avatar-online-wrap { position: relative; flex-shrink: 0; }
        .online-dot {
          position: absolute; bottom: 1px; right: 1px;
          width: 9px; height: 9px; border-radius: 50%;
          background: var(--green); border: 2px solid var(--bg-2);
        }
        .username {
          display: block; font-size: 14px; font-weight: 500; color: var(--text-0);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .handle {
          display: block; font-size: 12px; color: var(--text-3);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .email { font-size: 13px; color: var(--text-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .date { font-size: 12px; color: var(--text-3); }

        /* ── Badges & actions ───────────────────────────────────────── */
        .status-badge {
          display: inline-flex; align-items: center;
          padding: 3px 8px; border-radius: var(--radius-full);
          font-size: 11px; font-weight: 600; width: fit-content; flex-shrink: 0;
        }
        .status-badge.active { background: rgba(61,214,140,0.1); color: var(--green); }
        .status-badge.banned { background: var(--red-dim); color: var(--red); }
        .status-badge.twofa-on { background: rgba(99,102,241,0.12); color: var(--accent); }
        .status-badge.twofa-off { background: var(--bg-3); color: var(--text-3); }
        .actions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
        .action-btn {
          width: 32px; height: 32px;
          display: flex; align-items: center; justify-content: center;
          border-radius: var(--radius-sm); transition: all var(--transition);
          font-size: 15px; flex-shrink: 0;
        }
        .action-btn.ban { background: var(--red-dim); color: var(--red); }
        .action-btn.ban:hover { background: var(--red); color: white; }
        .action-btn.unban { background: rgba(61,214,140,0.1); color: var(--green); }
        .action-btn.unban:hover { background: var(--green); color: white; }
        .action-btn.reset { background: var(--bg-3); color: var(--text-3); }
        .action-btn.reset:hover { background: var(--accent-dim); color: var(--accent); }
        .action-btn.delete { background: var(--bg-3); color: var(--text-3); }
        .action-btn.delete:hover { background: var(--red-dim); color: var(--red); }
        .you-badge {
          font-size: 11px; color: var(--accent);
          background: var(--accent-dim); padding: 3px 8px;
          border-radius: var(--radius-full);
        }

        /* ── Audit log ──────────────────────────────────────────────── */
        .audit-section {
          background: var(--bg-2); border: 1px solid var(--border);
          border-radius: var(--radius); overflow: hidden;
        }
        .audit-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 12px 16px; background: var(--bg-3);
          border-bottom: 1px solid var(--border);
        }
        .audit-title { font-size: 13px; font-weight: 600; color: var(--text-0); }
        .audit-count { font-size: 12px; color: var(--text-3); }
        .audit-empty { padding: 24px; text-align: center; font-size: 13px; color: var(--text-3); }
        .audit-row {
          display: flex; align-items: flex-start; gap: 8px; flex-wrap: wrap;
          padding: 10px 16px; border-bottom: 1px solid var(--border); font-size: 13px;
        }
        .audit-row:last-child { border-bottom: none; }
        .audit-badge {
          padding: 2px 8px; border-radius: var(--radius-full);
          font-size: 11px; font-weight: 600; flex-shrink: 0; margin-top: 1px;
        }
        .audit-ban { background: var(--red-dim); color: var(--red); }
        .audit-unban { background: rgba(61,214,140,0.1); color: var(--green); }
        .audit-delete { background: var(--red-dim); color: var(--red); }
        .audit-password_reset { background: rgba(99,102,241,0.12); color: var(--accent); }
        .audit-reset_2fa { background: rgba(99,102,241,0.12); color: var(--accent); }
        .audit-create { background: rgba(61,214,140,0.1); color: var(--green); }
        .audit-revoke { background: var(--red-dim); color: var(--red); }
        .audit-registration_toggle { background: var(--bg-3); color: var(--text-2); }
        .audit-actor { font-weight: 500; color: var(--text-0); }
        .audit-target { color: var(--text-2); }
        .audit-time { margin-left: auto; font-size: 12px; color: var(--text-3); flex-shrink: 0; }
        @media (max-width: 600px) {
          .audit-time { margin-left: 0; width: 100%; margin-top: 2px; }
        }

        /* ── Modals ─────────────────────────────────────────────────── */
        .modal-input {
          width: 100%; background: var(--bg-3); border: 1px solid var(--border);
          border-radius: var(--radius); padding: 10px 12px;
          font-size: 16px; color: var(--text-0); box-sizing: border-box;
          transition: border-color var(--transition);
        }
        .modal-input:focus { border-color: var(--accent); }
        .modal-input::placeholder { color: var(--text-3); }
        .modal-select {
          width: 100%; background: var(--bg-3); border: 1px solid var(--border);
          border-radius: var(--radius); padding: 10px 12px;
          font-size: 16px; color: var(--text-0); box-sizing: border-box;
          cursor: pointer; appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none'%3E%3Cpath d='M6 9l6 6 6-6' stroke='%23888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
          background-repeat: no-repeat; background-position: right 12px center;
          padding-right: 32px;
        }
        .modal-select option { background: var(--bg-3); color: var(--text-0); }
        .confirm-overlay {
          position: fixed; inset: 0; z-index: 200;
          background: rgba(0,0,0,0.7);
          display: flex; align-items: flex-end; justify-content: center;
          padding: 0;
        }
        @media (min-width: 500px) {
          .confirm-overlay { align-items: center; padding: 24px; }
        }
        .confirm-modal {
          background: var(--bg-2); border: 1px solid var(--border);
          border-radius: var(--radius-xl) var(--radius-xl) 0 0;
          padding: 24px 20px;
          padding-bottom: max(24px, env(safe-area-inset-bottom, 24px));
          width: 100%;
          display: flex; flex-direction: column; gap: 12px;
        }
        @media (min-width: 500px) {
          .confirm-modal {
            border-radius: var(--radius-xl);
            max-width: 400px; padding: 28px;
          }
        }
        .confirm-modal h3 { font-size: 16px; font-weight: 600; color: var(--text-0); }
        .confirm-modal p { font-size: 14px; color: var(--text-2); line-height: 1.6; }
        .confirm-actions { display: flex; gap: 10px; margin-top: 4px; }
        .cancel-btn {
          flex: 1; padding: 12px; border-radius: var(--radius);
          background: var(--bg-3); color: var(--text-1);
          font-size: 15px; font-weight: 500;
          transition: all var(--transition);
        }
        .cancel-btn:hover { background: var(--bg-4); }
        .confirm-delete-btn {
          flex: 1; padding: 12px; border-radius: var(--radius);
          background: var(--red); color: white;
          font-size: 15px; font-weight: 500;
          transition: all var(--transition);
        }
        .confirm-delete-btn:hover { opacity: 0.85; }

        /* ── Small mobile extras ────────────────────────────────────── */
        @media (max-width: 600px) {
          .admin-header { padding: 12px 14px; }
          .admin-content { padding: 12px; gap: 12px; }
          .settings-item { padding: 12px 14px; }
          .invite-row { padding: 10px 14px; }
        }
      `}</style>
    </div>
  );
}
