/**
 * SecureChat — End-to-End Encrypted Messaging
 * Copyright (c) 2026 Roman Parish
 * Licensed under the MIT License — see LICENSE file for details
 *
 * https://github.com/roman-parish/securechat
 */
import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
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

function Modal({ onClose, children }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return createPortal(
    <div className="ap-overlay" onClick={onClose}>
      <div className="ap-sheet" onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>,
    document.body
  );
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
    try { setStats(await apiFetch('/admin/stats')); } catch {}
  }, []);

  const loadUsers = useCallback(async (q = '') => {
    setLoading(true);
    try {
      const data = await apiFetch(`/admin/users?search=${encodeURIComponent(q)}&limit=100`);
      setUsers(data.users);
      setTotal(data.total);
    } catch {} finally { setLoading(false); }
  }, []);

  const loadInvites = useCallback(async () => {
    try { setInvites((await apiFetch('/admin/invites')).invites); } catch {}
  }, []);

  useEffect(() => {
    loadStats();
    loadUsers();
    loadInvites();
    apiFetch('/admin/settings').then(d => setRegistrationOpen(d.registrationOpen)).catch(() => {});
    setAuditLoading(true);
    apiFetch('/admin/audit').then(d => setAuditLogs(d.logs)).catch(() => {}).finally(() => setAuditLoading(false));
  }, [loadStats, loadUsers, loadInvites]);

  useEffect(() => {
    const t = setTimeout(() => loadUsers(search), 300);
    return () => clearTimeout(t);
  }, [search, loadUsers]);

  const flash = (msg) => { setActionMsg(msg); setTimeout(() => setActionMsg(''), 3500); };

  const handleToggleRegistration = async () => {
    try {
      const d = await apiFetch('/admin/settings', { method: 'PUT', body: JSON.stringify({ registrationOpen: !registrationOpen }) });
      setRegistrationOpen(d.registrationOpen);
      flash(`Registration ${d.registrationOpen ? 'opened' : 'closed'}`);
    } catch (e) { flash('Error: ' + e.message); }
  };

  const handleCreateInvite = async () => {
    setInviteLoading(true);
    try {
      const d = await apiFetch('/admin/invites', { method: 'POST', body: JSON.stringify({ email: inviteEmail || undefined, expiryHours: Number(inviteExpiry) }) });
      setInviteResult(d.inviteUrl);
      loadInvites();
    } catch (e) { flash('Error: ' + e.message); setShowInviteModal(false); }
    finally { setInviteLoading(false); }
  };

  const handleRevokeInvite = async (id) => {
    try {
      await apiFetch(`/admin/invites/${id}`, { method: 'DELETE' });
      setInvites(prev => prev.filter(i => i._id !== id));
    } catch (e) { flash('Error: ' + e.message); }
  };

  const handleBan = async (u) => {
    try {
      const res = await apiFetch(`/admin/users/${u._id}/ban`, { method: 'PUT' });
      setUsers(prev => prev.map(x => x._id === u._id ? { ...x, banned: res.banned } : x));
      flash(`${u.username} ${res.banned ? 'suspended' : 'unsuspended'}`);
    } catch (e) { flash('Error: ' + e.message); }
  };

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 8) { flash('Password must be at least 8 characters'); return; }
    try {
      await apiFetch(`/admin/users/${resetPassword._id}/reset-password`, { method: 'PUT', body: JSON.stringify({ newPassword }) });
      flash(`Password reset for ${resetPassword.username}`);
      setResetPassword(null); setNewPassword('');
    } catch (e) { flash('Error: ' + e.message); }
  };

  const handleReset2fa = async () => {
    try {
      await apiFetch(`/admin/users/${reset2faUser._id}/reset-2fa`, { method: 'PUT' });
      flash(`2FA reset for ${reset2faUser.username}`);
      setReset2faUser(null);
    } catch (e) { flash('Error: ' + e.message); }
  };

  const handleDelete = async (u) => {
    try {
      await apiFetch(`/admin/users/${u._id}`, { method: 'DELETE' });
      setUsers(prev => prev.filter(x => x._id !== u._id));
      setTotal(t => t - 1);
      setConfirmDelete(null);
      flash(`${u.username} deleted`);
    } catch (e) { flash('Error: ' + e.message); }
  };

  const isMe = (u) => String(u._id) === String(user?._id);

  return (
    <div className="ap">

      {/* ── Header ── */}
      <div className="ap-header">
        <button className="ap-back" onClick={onBack}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <span className="ap-title">Admin Panel</span>
        <div style={{ width: 44 }} />
      </div>

      {/* ── Scrollable body ── */}
      <div className="ap-body">

        {/* Stats */}
        {stats && (
          <div className="ap-stats">
            {[
              { v: stats.totalUsers,         l: 'Total Users' },
              { v: stats.totalMessages,      l: 'Messages' },
              { v: stats.totalConversations, l: 'Conversations' },
              { v: stats.activeToday,        l: 'Active Today' },
              { v: stats.newUsersThisWeek,   l: 'New This Week' },
              { v: formatBytes(stats.storageBytes), l: 'Storage Used' },
            ].map(({ v, l }) => (
              <div key={l} className="ap-stat">
                <span className="ap-stat-val">{v}</span>
                <span className="ap-stat-lbl">{l}</span>
              </div>
            ))}
          </div>
        )}

        {/* Registration toggle */}
        <div className="ap-section-label">Settings</div>
        <div className="ap-card">
          <div className="ap-setting-row">
            <div className="ap-setting-text">
              <span className="ap-setting-title">Open Registration</span>
              <span className="ap-setting-sub">Allow new users to sign up</span>
            </div>
            <button
              className={`ap-toggle ${registrationOpen ? 'on' : 'off'}`}
              onClick={handleToggleRegistration}
              aria-label={registrationOpen ? 'Close registration' : 'Open registration'}
            >
              <span className="ap-toggle-knob" />
            </button>
          </div>
        </div>

        {/* Invite links */}
        <div className="ap-card">
          <div className="ap-setting-row">
            <div className="ap-setting-text">
              <span className="ap-setting-title">Invite Links</span>
              <span className="ap-setting-sub">{invites.length} active invite{invites.length !== 1 ? 's' : ''}</span>
            </div>
            <button className="ap-btn-accent ap-btn-sm" onClick={() => { setInviteEmail(''); setInviteExpiry('24'); setInviteResult(null); setShowInviteModal(true); }}>
              + Create
            </button>
          </div>
          {invites.length > 0 && (
            <div className="ap-divider" />
          )}
          {invites.map(inv => (
            <div key={inv._id} className="ap-invite-row">
              <div className="ap-invite-info">
                <span className="ap-invite-label">{inv.email || 'No email — link only'}</span>
                <span className="ap-invite-exp">Expires {formatDistanceToNow(new Date(inv.expiresAt), { addSuffix: true })}</span>
              </div>
              <button className="ap-revoke-btn" onClick={() => handleRevokeInvite(inv._id)}>
                Revoke
              </button>
            </div>
          ))}
        </div>

        {/* User list */}
        <div className="ap-section-label">Users</div>
        <div className="ap-search">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" className="ap-search-icon">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          <input
            type="search"
            placeholder="Search users…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="ap-search-input"
          />
          {total > 0 && <span className="ap-search-count">{total}</span>}
        </div>

        {actionMsg && <div className="ap-flash">{actionMsg}</div>}

        <div className="ap-card ap-user-list">
          {loading ? (
            <div className="ap-empty">Loading…</div>
          ) : users.length === 0 ? (
            <div className="ap-empty">No users found</div>
          ) : users.map(u => (
            <div key={u._id} className={`ap-user${u.banned ? ' ap-user-banned' : ''}`}>

              {/* Top row: avatar + identity */}
              <div className="ap-user-top">
                <div className="ap-avatar-wrap">
                  <Avatar user={u} size={44} />
                  {onlineUsers.has(String(u._id)) && <span className="ap-online-dot" />}
                </div>
                <div className="ap-user-identity">
                  <span className="ap-user-name">{u.displayName || u.username}</span>
                  <span className="ap-user-handle">@{u.username}</span>
                  {u.email && <span className="ap-user-email">{u.email}</span>}
                </div>
              </div>

              {/* Bottom row: badges + actions */}
              <div className="ap-user-bottom">
                <div className="ap-badges">
                  <span className={`ap-badge ${u.banned ? 'red' : 'green'}`}>
                    {u.banned ? 'Suspended' : 'Active'}
                  </span>
                  {u.twoFactorEnabled && <span className="ap-badge purple">2FA</span>}
                </div>
                {isMe(u) ? (
                  <span className="ap-you-tag">You</span>
                ) : (
                  <div className="ap-actions">
                    <button
                      className={`ap-action-btn ${u.banned ? 'green' : 'orange'}`}
                      onClick={() => handleBan(u)}
                      title={u.banned ? 'Unsuspend' : 'Suspend'}
                    >
                      {u.banned ? 'Unsuspend' : 'Suspend'}
                    </button>
                    <button className="ap-action-btn muted" onClick={() => { setResetPassword(u); setNewPassword(''); }} title="Reset password">
                      🔑
                    </button>
                    <button className="ap-action-btn muted" onClick={() => setReset2faUser(u)} title="Reset 2FA">
                      🔐
                    </button>
                    <button className="ap-action-btn red" onClick={() => setConfirmDelete(u)} title="Delete user">
                      🗑
                    </button>
                  </div>
                )}
              </div>

            </div>
          ))}
        </div>

        {/* Audit log */}
        <div className="ap-section-label">Audit Log</div>
        <div className="ap-card ap-user-list">
          {auditLoading ? (
            <div className="ap-empty">Loading…</div>
          ) : auditLogs.length === 0 ? (
            <div className="ap-empty">No activity yet</div>
          ) : auditLogs.map(log => (
            <div key={log._id} className="ap-audit-row">
              <span className={`ap-badge audit-${log.action.split('.')[1]}`}>
                {ACTION_LABELS[log.action] || log.action}
              </span>
              <div className="ap-audit-detail">
                <span className="ap-audit-actor">{log.performedByUsername}</span>
                {log.targetUsername && <span className="ap-audit-target"> → {log.targetUsername}</span>}
                {log.action === 'invite.create' && log.metadata?.email && <span className="ap-audit-target"> → {log.metadata.email}</span>}
                {log.action === 'settings.registration_toggle' && <span className="ap-audit-target"> {log.metadata?.registrationOpen ? 'opened' : 'closed'}</span>}
              </div>
              <span className="ap-audit-time">{formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}</span>
            </div>
          ))}
        </div>

      </div>{/* end ap-body */}

      {/* ── Modals ── */}

      {showInviteModal && !inviteResult && (
        <Modal onClose={() => setShowInviteModal(false)}>
          <h3 className="ap-modal-title">Create invite link</h3>
          <p className="ap-modal-sub">Single-use link. Optionally send by email.</p>
          <input type="email" placeholder="Email (optional)" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} className="ap-input" />
          <select value={inviteExpiry} onChange={e => setInviteExpiry(e.target.value)} className="ap-select">
            <option value="24">Expires in 24 hours</option>
            <option value="72">Expires in 3 days</option>
            <option value="168">Expires in 7 days</option>
            <option value="720">Expires in 30 days</option>
          </select>
          <div className="ap-modal-actions">
            <button className="ap-modal-btn secondary" onClick={() => setShowInviteModal(false)}>Cancel</button>
            <button className="ap-modal-btn accent" disabled={inviteLoading} onClick={handleCreateInvite}>
              {inviteLoading ? 'Creating…' : inviteEmail ? 'Create & email' : 'Create link'}
            </button>
          </div>
        </Modal>
      )}

      {showInviteModal && inviteResult && (
        <Modal onClose={() => { setShowInviteModal(false); setInviteResult(null); }}>
          <h3 className="ap-modal-title">Invite link created</h3>
          {inviteEmail && <p className="ap-modal-sub">Email sent to <strong>{inviteEmail}</strong>.</p>}
          <p className="ap-modal-sub">Share this link — single use only:</p>
          <div className="ap-invite-url">{inviteResult}</div>
          <div className="ap-modal-actions">
            <button className="ap-modal-btn secondary" onClick={() => navigator.clipboard.writeText(inviteResult)}>Copy</button>
            <button className="ap-modal-btn accent" onClick={() => { setShowInviteModal(false); setInviteResult(null); }}>Done</button>
          </div>
        </Modal>
      )}

      {resetPassword && (
        <Modal onClose={() => setResetPassword(null)}>
          <h3 className="ap-modal-title">Reset password</h3>
          <p className="ap-modal-sub">Set a new password for <strong>{resetPassword.username}</strong>. This logs them out everywhere.</p>
          <input type="password" placeholder="New password (min 8 chars)" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="ap-input" autoFocus />
          <div className="ap-modal-actions">
            <button className="ap-modal-btn secondary" onClick={() => setResetPassword(null)}>Cancel</button>
            <button className="ap-modal-btn accent" onClick={handleResetPassword}>Reset Password</button>
          </div>
        </Modal>
      )}

      {reset2faUser && (
        <Modal onClose={() => setReset2faUser(null)}>
          <h3 className="ap-modal-title">Reset 2FA?</h3>
          <p className="ap-modal-sub">Disables 2FA for <strong>{reset2faUser.username}</strong>. They can log in with password only until they re-enable it.</p>
          <div className="ap-modal-actions">
            <button className="ap-modal-btn secondary" onClick={() => setReset2faUser(null)}>Cancel</button>
            <button className="ap-modal-btn accent" onClick={handleReset2fa}>Reset 2FA</button>
          </div>
        </Modal>
      )}

      {confirmDelete && (
        <Modal onClose={() => setConfirmDelete(null)}>
          <h3 className="ap-modal-title">Delete user?</h3>
          <p className="ap-modal-sub">Permanently deletes <strong>{confirmDelete.username}</strong> and all their data. This cannot be undone.</p>
          <div className="ap-modal-actions">
            <button className="ap-modal-btn secondary" onClick={() => setConfirmDelete(null)}>Cancel</button>
            <button className="ap-modal-btn danger" onClick={() => handleDelete(confirmDelete)}>Delete permanently</button>
          </div>
        </Modal>
      )}

      <style>{`
        /* ── Shell ── */
        .ap {
          display: flex; flex-direction: column;
          flex: 1; min-height: 0; overflow: hidden;
          background: var(--bg-0); font-size: 15px;
        }

        /* ── Header ── */
        .ap-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 0 8px; height: 54px; flex-shrink: 0;
          border-bottom: 1px solid var(--border);
          background: var(--bg-1);
        }
        .ap-back {
          width: 44px; height: 44px;
          display: flex; align-items: center; justify-content: center;
          color: var(--text-2); border-radius: var(--radius);
          transition: all var(--transition);
        }
        .ap-back:active { background: var(--bg-3); }
        .ap-title {
          font-size: 16px; font-weight: 600; color: var(--text-0);
        }

        /* ── Scrollable body ── */
        .ap-body {
          flex: 1; min-height: 0;
          overflow-y: auto; -webkit-overflow-scrolling: touch;
          padding: 16px 14px;
          padding-bottom: max(24px, env(safe-area-inset-bottom, 24px));
          display: flex; flex-direction: column; gap: 8px;
        }

        /* ── Section label ── */
        .ap-section-label {
          font-size: 12px; font-weight: 600; text-transform: uppercase;
          letter-spacing: 0.06em; color: var(--text-3);
          padding: 8px 4px 4px;
        }

        /* ── Stats ── */
        .ap-stats {
          display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;
          margin-bottom: 4px;
        }
        @media (min-width: 480px) { .ap-stats { grid-template-columns: repeat(3, 1fr); } }
        @media (min-width: 768px) { .ap-stats { grid-template-columns: repeat(6, 1fr); } }
        .ap-stat {
          background: var(--bg-2); border: 1px solid var(--border);
          border-radius: var(--radius); padding: 14px 12px;
          display: flex; flex-direction: column; gap: 4px;
        }
        .ap-stat-val {
          font-size: 22px; font-weight: 700; color: var(--text-0); line-height: 1;
        }
        .ap-stat-lbl { font-size: 12px; color: var(--text-3); }

        /* ── Card ── */
        .ap-card {
          background: var(--bg-2); border: 1px solid var(--border);
          border-radius: var(--radius); overflow: hidden;
        }
        .ap-divider { height: 1px; background: var(--border); }

        /* ── Settings row ── */
        .ap-setting-row {
          display: flex; align-items: center; gap: 16px;
          padding: 16px;
        }
        .ap-setting-text { flex: 1; min-width: 0; }
        .ap-setting-title {
          display: block; font-size: 15px; font-weight: 500; color: var(--text-0);
        }
        .ap-setting-sub {
          display: block; font-size: 13px; color: var(--text-3); margin-top: 3px;
        }

        /* ── Toggle ── */
        .ap-toggle {
          width: 50px; height: 30px; border-radius: 15px;
          position: relative; flex-shrink: 0; cursor: pointer;
          transition: background 0.2s;
        }
        .ap-toggle.on { background: var(--accent); }
        .ap-toggle.off { background: var(--bg-4); }
        .ap-toggle-knob {
          position: absolute; top: 4px;
          width: 22px; height: 22px; border-radius: 50%;
          background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.3);
          transition: left 0.2s;
        }
        .ap-toggle.on .ap-toggle-knob { left: 24px; }
        .ap-toggle.off .ap-toggle-knob { left: 4px; }

        /* ── Invite rows ── */
        .ap-invite-row {
          display: flex; align-items: center; gap: 12px;
          padding: 14px 16px; border-top: 1px solid var(--border);
        }
        .ap-invite-info { flex: 1; min-width: 0; }
        .ap-invite-label {
          display: block; font-size: 14px; color: var(--text-1);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .ap-invite-exp {
          display: block; font-size: 12px; color: var(--text-3); margin-top: 3px;
        }
        .ap-revoke-btn {
          padding: 8px 14px; border-radius: var(--radius);
          background: var(--bg-3); color: var(--text-2);
          font-size: 13px; font-weight: 500; flex-shrink: 0;
          transition: all var(--transition);
        }
        .ap-revoke-btn:active { background: var(--red-dim); color: var(--red); }

        /* ── Search ── */
        .ap-search {
          display: flex; align-items: center; gap: 10px;
          background: var(--bg-2); border: 1px solid var(--border);
          border-radius: var(--radius); padding: 12px 14px;
        }
        .ap-search-icon { color: var(--text-3); flex-shrink: 0; }
        .ap-search-input {
          flex: 1; min-width: 0; background: none; border: none;
          font-size: 16px; color: var(--text-0);
        }
        .ap-search-input::placeholder { color: var(--text-3); }
        .ap-search-count {
          font-size: 12px; color: var(--text-3);
          background: var(--bg-3); padding: 3px 8px;
          border-radius: var(--radius-full); flex-shrink: 0;
        }

        /* ── Flash ── */
        .ap-flash {
          background: var(--accent-dim); border: 1px solid var(--accent);
          border-radius: var(--radius); padding: 12px 14px;
          font-size: 14px; color: var(--accent); text-align: center;
        }

        /* ── User list ── */
        .ap-user-list { padding: 0; }

        /* ── User card — mobile first ── */
        .ap-user {
          padding: 14px 16px;
          border-bottom: 1px solid var(--border);
          display: flex; flex-direction: column; gap: 12px;
        }
        .ap-user:last-child { border-bottom: none; }
        .ap-user-banned { opacity: 0.55; }

        /* Top row: avatar + name */
        .ap-user-top {
          display: flex; align-items: center; gap: 12px;
        }
        .ap-avatar-wrap { position: relative; flex-shrink: 0; }
        .ap-online-dot {
          position: absolute; bottom: 1px; right: 1px;
          width: 11px; height: 11px; border-radius: 50%;
          background: var(--green); border: 2px solid var(--bg-2);
        }
        .ap-user-identity { flex: 1; min-width: 0; }
        .ap-user-name {
          display: block; font-size: 15px; font-weight: 600; color: var(--text-0);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .ap-user-handle {
          display: block; font-size: 13px; color: var(--text-3); margin-top: 1px;
        }
        .ap-user-email {
          display: block; font-size: 12px; color: var(--text-3); margin-top: 2px;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }

        /* Bottom row: badges + action buttons */
        .ap-user-bottom {
          display: flex; align-items: center; gap: 10px;
          flex-wrap: wrap;
        }
        .ap-badges {
          display: flex; gap: 6px; align-items: center; flex-wrap: wrap;
        }
        .ap-actions {
          display: flex; gap: 6px; margin-left: auto;
        }
        .ap-you-tag {
          margin-left: auto; font-size: 12px; color: var(--accent);
          background: var(--accent-dim); padding: 4px 10px;
          border-radius: var(--radius-full);
        }

        /* ── Action buttons — large tap targets ── */
        .ap-action-btn {
          min-width: 44px; height: 36px;
          display: flex; align-items: center; justify-content: center;
          padding: 0 10px; border-radius: var(--radius-sm);
          font-size: 13px; font-weight: 500; white-space: nowrap;
          transition: all var(--transition);
        }
        .ap-action-btn.green { background: rgba(61,214,140,0.12); color: var(--green); }
        .ap-action-btn.green:active { background: rgba(61,214,140,0.25); }
        .ap-action-btn.orange { background: rgba(255,160,60,0.12); color: #f59e0b; }
        .ap-action-btn.orange:active { background: rgba(255,160,60,0.25); }
        .ap-action-btn.red { background: var(--bg-3); color: var(--text-3); }
        .ap-action-btn.red:active { background: var(--red-dim); color: var(--red); }
        .ap-action-btn.muted { background: var(--bg-3); color: var(--text-2); }
        .ap-action-btn.muted:active { background: var(--accent-dim); color: var(--accent); }

        /* ── Badges ── */
        .ap-badge {
          display: inline-flex; align-items: center;
          padding: 3px 9px; border-radius: var(--radius-full);
          font-size: 12px; font-weight: 600; letter-spacing: 0.01em;
        }
        .ap-badge.green { background: rgba(61,214,140,0.12); color: var(--green); }
        .ap-badge.red { background: var(--red-dim); color: var(--red); }
        .ap-badge.purple { background: rgba(99,102,241,0.12); color: var(--accent); }
        .ap-badge.audit-ban, .ap-badge.audit-delete, .ap-badge.audit-revoke { background: var(--red-dim); color: var(--red); }
        .ap-badge.audit-unban, .ap-badge.audit-create { background: rgba(61,214,140,0.12); color: var(--green); }
        .ap-badge.audit-password_reset, .ap-badge.audit-reset_2fa { background: rgba(99,102,241,0.12); color: var(--accent); }
        .ap-badge.audit-registration_toggle { background: var(--bg-3); color: var(--text-2); }

        /* ── Empty state ── */
        .ap-empty {
          padding: 32px 16px; text-align: center;
          font-size: 14px; color: var(--text-3);
        }

        /* ── Audit log rows ── */
        .ap-audit-row {
          display: flex; align-items: flex-start; gap: 8px; flex-wrap: wrap;
          padding: 12px 16px; border-bottom: 1px solid var(--border);
        }
        .ap-audit-row:last-child { border-bottom: none; }
        .ap-audit-detail {
          flex: 1; min-width: 0; font-size: 13px; color: var(--text-1);
          padding-top: 2px;
        }
        .ap-audit-actor { font-weight: 600; color: var(--text-0); }
        .ap-audit-target { color: var(--text-3); }
        .ap-audit-time {
          font-size: 11px; color: var(--text-3); flex-shrink: 0;
          padding-top: 3px; white-space: nowrap;
        }

        /* ── Small accent button ── */
        .ap-btn-accent {
          background: var(--accent); color: white;
          border-radius: var(--radius); font-weight: 500;
          transition: all var(--transition); white-space: nowrap; flex-shrink: 0;
        }
        .ap-btn-sm { padding: 8px 14px; font-size: 14px; }
        .ap-btn-accent:active { opacity: 0.85; }

        /* ── Modal overlay ── */
        .ap-overlay {
          position: fixed; inset: 0; z-index: 400;
          background: rgba(0,0,0,0.7);
          display: flex; align-items: flex-end; justify-content: center;
        }
        @media (min-width: 520px) {
          .ap-overlay { align-items: center; padding: 24px; }
        }

        /* ── Modal sheet ── */
        .ap-sheet {
          background: var(--bg-2); border: 1px solid var(--border);
          border-radius: 20px 20px 0 0;
          width: 100%; max-height: 92dvh; overflow-y: auto;
          padding: 28px 20px;
          padding-bottom: max(28px, env(safe-area-inset-bottom, 28px));
          display: flex; flex-direction: column; gap: 14px;
          animation: apSlideUp 0.22s ease;
        }
        @media (min-width: 520px) {
          .ap-sheet {
            border-radius: 16px; max-width: 440px;
            max-height: unset; padding: 28px;
          }
        }
        @keyframes apSlideUp {
          from { transform: translateY(24px); opacity: 0; }
          to   { transform: translateY(0); opacity: 1; }
        }

        /* ── Modal content ── */
        .ap-modal-title {
          font-size: 18px; font-weight: 700; color: var(--text-0);
        }
        .ap-modal-sub {
          font-size: 14px; color: var(--text-2); line-height: 1.55;
        }
        .ap-input {
          width: 100%; background: var(--bg-3); border: 1.5px solid var(--border);
          border-radius: var(--radius); padding: 14px 16px;
          font-size: 16px; color: var(--text-0); box-sizing: border-box;
          transition: border-color var(--transition);
        }
        .ap-input:focus { border-color: var(--accent); outline: none; }
        .ap-input::placeholder { color: var(--text-3); }
        .ap-select {
          width: 100%; background: var(--bg-3); border: 1.5px solid var(--border);
          border-radius: var(--radius); padding: 14px 16px;
          font-size: 16px; color: var(--text-0); box-sizing: border-box;
          cursor: pointer; appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none'%3E%3Cpath d='M6 9l6 6 6-6' stroke='%23888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
          background-repeat: no-repeat; background-position: right 16px center;
          padding-right: 42px;
        }
        .ap-invite-url {
          background: var(--bg-3); border: 1px solid var(--border);
          border-radius: var(--radius); padding: 14px 16px;
          font-size: 12px; color: var(--text-1);
          word-break: break-all; font-family: monospace; line-height: 1.6;
        }
        .ap-modal-actions {
          display: flex; gap: 10px; margin-top: 4px;
        }
        .ap-modal-btn {
          flex: 1; padding: 15px; border-radius: var(--radius);
          font-size: 16px; font-weight: 600; transition: all var(--transition);
        }
        .ap-modal-btn.secondary { background: var(--bg-3); color: var(--text-1); }
        .ap-modal-btn.secondary:active { background: var(--bg-4); }
        .ap-modal-btn.accent { background: var(--accent); color: white; }
        .ap-modal-btn.accent:active { opacity: 0.85; }
        .ap-modal-btn.accent:disabled { opacity: 0.5; }
        .ap-modal-btn.danger { background: var(--red); color: white; }
        .ap-modal-btn.danger:active { opacity: 0.85; }

        /* ── Desktop refinements ── */
        @media (min-width: 640px) {
          .ap-body { padding: 20px; gap: 10px; }
          .ap-user { flex-direction: row; align-items: center; }
          .ap-user-top { flex: 1; min-width: 0; }
          .ap-user-bottom { margin-left: auto; flex-wrap: nowrap; }
          .ap-actions { margin-left: 0; }
          .ap-back:hover { background: var(--bg-3); color: var(--text-0); }
          .ap-revoke-btn:hover { background: var(--red-dim); color: var(--red); }
          .ap-action-btn.green:hover { background: rgba(61,214,140,0.25); }
          .ap-action-btn.orange:hover { background: rgba(255,160,60,0.25); }
          .ap-action-btn.red:hover { background: var(--red-dim); color: var(--red); }
          .ap-action-btn.muted:hover { background: var(--accent-dim); color: var(--accent); }
          .ap-modal-btn.secondary:hover { background: var(--bg-4); }
          .ap-modal-btn.accent:hover { opacity: 0.9; }
          .ap-btn-accent:hover { opacity: 0.9; }
        }
      `}</style>
    </div>
  );
}
