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

  const flash = (msg) => { setActionMsg(msg); setTimeout(() => setActionMsg(''), 3000); };

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
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Back
        </button>
        <span className="ap-title">Admin Panel</span>
        <div style={{ width: 64 }} />
      </div>

      {/* ── Scrollable body ── */}
      <div className="ap-body">

        {/* Stats */}
        {stats && (
          <div className="ap-stats">
            {[
              { v: stats.totalUsers,         l: 'Users' },
              { v: stats.totalMessages,      l: 'Messages' },
              { v: stats.totalConversations, l: 'Convos' },
              { v: stats.activeToday,        l: 'Active Today' },
              { v: stats.newUsersThisWeek,   l: 'New This Week' },
              { v: formatBytes(stats.storageBytes), l: 'Storage' },
            ].map(({ v, l }) => (
              <div key={l} className="ap-stat">
                <span className="ap-stat-val">{v}</span>
                <span className="ap-stat-lbl">{l}</span>
              </div>
            ))}
          </div>
        )}

        {/* Registration toggle */}
        <div className="ap-card">
          <div className="ap-row">
            <div className="ap-row-info">
              <span className="ap-row-title">Open Registration</span>
              <span className="ap-row-sub">Allow new users to create accounts</span>
            </div>
            <button
              className={`ap-toggle ${registrationOpen ? 'on' : 'off'}`}
              onClick={handleToggleRegistration}
            >
              <span className="ap-toggle-knob" />
            </button>
          </div>
        </div>

        {/* Invite links */}
        <div className="ap-card">
          <div className="ap-row">
            <div className="ap-row-info">
              <span className="ap-row-title">Invite Links</span>
              <span className="ap-row-sub">{invites.length} active invite{invites.length !== 1 ? 's' : ''}</span>
            </div>
            <button className="ap-btn-primary" onClick={() => { setInviteEmail(''); setInviteExpiry('24'); setInviteResult(null); setShowInviteModal(true); }}>
              + Create
            </button>
          </div>
          {invites.map(inv => (
            <div key={inv._id} className="ap-invite-row">
              <div className="ap-invite-info">
                <span className="ap-invite-email">{inv.email || 'Link only'}</span>
                <span className="ap-invite-exp">Expires {formatDistanceToNow(new Date(inv.expiresAt), { addSuffix: true })}</span>
              </div>
              <button className="ap-icon-btn danger" onClick={() => handleRevokeInvite(inv._id)} title="Revoke">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
          ))}
        </div>

        {/* User search */}
        <div className="ap-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
            <circle cx="11" cy="11" r="7" stroke="var(--text-3)" strokeWidth="1.5"/>
            <path d="M16.5 16.5L21 21" stroke="var(--text-3)" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <input
            placeholder="Search users…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <span className="ap-search-count">{total} users</span>
        </div>

        {actionMsg && <div className="ap-flash">{actionMsg}</div>}

        {/* User list */}
        <div className="ap-card ap-card-flush">
          {loading ? (
            <div className="ap-empty">Loading users…</div>
          ) : users.length === 0 ? (
            <div className="ap-empty">No users found</div>
          ) : users.map(u => (
            <div key={u._id} className={`ap-user${u.banned ? ' banned' : ''}`}>
              {/* Left: avatar + name */}
              <div className="ap-user-left">
                <div className="ap-avatar-wrap">
                  <Avatar user={u} size={40} />
                  {onlineUsers.has(String(u._id)) && <span className="ap-online" />}
                </div>
                <div className="ap-user-info">
                  <span className="ap-user-name">{u.displayName || u.username}</span>
                  <span className="ap-user-handle">@{u.username}</span>
                  {u.email && <span className="ap-user-email">{u.email}</span>}
                </div>
              </div>
              {/* Right: badges + actions */}
              <div className="ap-user-right">
                <div className="ap-badges">
                  <span className={`ap-badge ${u.banned ? 'banned' : 'active'}`}>
                    {u.banned ? 'Suspended' : 'Active'}
                  </span>
                  {u.twoFactorEnabled && <span className="ap-badge twofa">2FA</span>}
                </div>
                {!isMe(u) && (
                  <div className="ap-actions">
                    <button className={`ap-icon-btn ${u.banned ? 'success' : 'warn'}`} onClick={() => handleBan(u)} title={u.banned ? 'Unsuspend' : 'Suspend'}>
                      {u.banned
                        ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        : <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5"/><path d="M4.93 4.93l14.14 14.14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                      }
                    </button>
                    <button className="ap-icon-btn muted" onClick={() => { setResetPassword(u); setNewPassword(''); }} title="Reset password">🔑</button>
                    <button className="ap-icon-btn muted" onClick={() => setReset2faUser(u)} title="Reset 2FA">🔐</button>
                    <button className="ap-icon-btn danger" onClick={() => setConfirmDelete(u)} title="Delete user">🗑</button>
                  </div>
                )}
                {isMe(u) && <span className="ap-you">You</span>}
              </div>
            </div>
          ))}
        </div>

        {/* Audit log */}
        <div className="ap-card ap-card-flush">
          <div className="ap-section-header">
            <span>Audit Log</span>
            <span className="ap-section-count">{auditLogs.length} entries</span>
          </div>
          {auditLoading ? (
            <div className="ap-empty">Loading…</div>
          ) : auditLogs.length === 0 ? (
            <div className="ap-empty">No activity yet</div>
          ) : auditLogs.map(log => (
            <div key={log._id} className="ap-audit">
              <span className={`ap-badge audit-${log.action.split('.')[1]}`}>
                {ACTION_LABELS[log.action] || log.action}
              </span>
              <span className="ap-audit-actor">{log.performedByUsername}</span>
              {log.targetUsername && <span className="ap-audit-target">→ {log.targetUsername}</span>}
              {log.action === 'invite.create' && log.metadata?.email && <span className="ap-audit-target">→ {log.metadata.email}</span>}
              {log.action === 'settings.registration_toggle' && <span className="ap-audit-target">{log.metadata?.registrationOpen ? 'opened' : 'closed'}</span>}
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
            <button className="ap-btn-secondary" onClick={() => setShowInviteModal(false)}>Cancel</button>
            <button className="ap-btn-accent" disabled={inviteLoading} onClick={handleCreateInvite}>
              {inviteLoading ? 'Creating…' : inviteEmail ? 'Create & email' : 'Create link'}
            </button>
          </div>
        </Modal>
      )}

      {showInviteModal && inviteResult && (
        <Modal onClose={() => { setShowInviteModal(false); setInviteResult(null); }}>
          <h3 className="ap-modal-title">Invite link created</h3>
          {inviteEmail && <p className="ap-modal-sub">Email sent to <strong>{inviteEmail}</strong>.</p>}
          <p className="ap-modal-sub">Copy and share — single use only:</p>
          <div className="ap-invite-url">{inviteResult}</div>
          <div className="ap-modal-actions">
            <button className="ap-btn-secondary" onClick={() => navigator.clipboard.writeText(inviteResult)}>Copy link</button>
            <button className="ap-btn-accent" onClick={() => { setShowInviteModal(false); setInviteResult(null); }}>Done</button>
          </div>
        </Modal>
      )}

      {resetPassword && (
        <Modal onClose={() => setResetPassword(null)}>
          <h3 className="ap-modal-title">Reset password</h3>
          <p className="ap-modal-sub">Set a new password for <strong>{resetPassword.username}</strong>. Logs them out everywhere.</p>
          <input type="password" placeholder="New password (min 8 chars)" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="ap-input" autoFocus />
          <div className="ap-modal-actions">
            <button className="ap-btn-secondary" onClick={() => setResetPassword(null)}>Cancel</button>
            <button className="ap-btn-accent" onClick={handleResetPassword}>Reset Password</button>
          </div>
        </Modal>
      )}

      {reset2faUser && (
        <Modal onClose={() => setReset2faUser(null)}>
          <h3 className="ap-modal-title">Reset 2FA?</h3>
          <p className="ap-modal-sub">Disables 2FA for <strong>{reset2faUser.username}</strong>. They can log in with password only until they re-enable it.</p>
          <div className="ap-modal-actions">
            <button className="ap-btn-secondary" onClick={() => setReset2faUser(null)}>Cancel</button>
            <button className="ap-btn-accent" onClick={handleReset2fa}>Reset 2FA</button>
          </div>
        </Modal>
      )}

      {confirmDelete && (
        <Modal onClose={() => setConfirmDelete(null)}>
          <h3 className="ap-modal-title">Delete user?</h3>
          <p className="ap-modal-sub">Permanently deletes <strong>{confirmDelete.username}</strong> and all their messages. Cannot be undone.</p>
          <div className="ap-modal-actions">
            <button className="ap-btn-secondary" onClick={() => setConfirmDelete(null)}>Cancel</button>
            <button className="ap-btn-danger" onClick={() => handleDelete(confirmDelete)}>Delete permanently</button>
          </div>
        </Modal>
      )}

      <style>{`
        /* ── Shell ── */
        .ap {
          display: flex; flex-direction: column;
          flex: 1; min-height: 0; overflow: hidden;
          background: var(--bg-0);
        }
        .ap-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 0 12px; height: 52px; flex-shrink: 0;
          border-bottom: 1px solid var(--border);
          background: var(--bg-1);
        }
        .ap-back {
          display: flex; align-items: center; gap: 6px;
          color: var(--text-2); font-size: 14px; padding: 8px 8px;
          border-radius: var(--radius); transition: all var(--transition);
        }
        .ap-back:hover { background: var(--bg-3); color: var(--text-0); }
        .ap-title {
          font-size: 15px; font-weight: 600; color: var(--text-0);
        }
        .ap-body {
          flex: 1; min-height: 0;
          overflow-y: auto; -webkit-overflow-scrolling: touch;
          padding: 14px 12px;
          padding-bottom: max(20px, env(safe-area-inset-bottom, 20px));
          display: flex; flex-direction: column; gap: 10px;
        }

        /* ── Stats grid ── */
        .ap-stats {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
        }
        @media (min-width: 640px) { .ap-stats { grid-template-columns: repeat(6, 1fr); } }
        .ap-stat {
          background: var(--bg-2); border: 1px solid var(--border);
          border-radius: var(--radius); padding: 12px 10px;
          display: flex; flex-direction: column; gap: 3px;
        }
        .ap-stat-val { font-size: 18px; font-weight: 700; color: var(--text-0); line-height: 1.1; }
        .ap-stat-lbl { font-size: 11px; color: var(--text-3); }

        /* ── Generic card ── */
        .ap-card {
          background: var(--bg-2); border: 1px solid var(--border);
          border-radius: var(--radius); overflow: hidden;
        }
        .ap-card-flush { padding: 0; }

        /* ── Settings row ── */
        .ap-row {
          display: flex; align-items: center;
          padding: 14px 16px; gap: 12px;
        }
        .ap-row-info { flex: 1; min-width: 0; }
        .ap-row-title { display: block; font-size: 14px; font-weight: 500; color: var(--text-0); }
        .ap-row-sub { display: block; font-size: 12px; color: var(--text-3); margin-top: 2px; }

        /* ── Toggle ── */
        .ap-toggle {
          width: 44px; height: 26px; border-radius: 13px;
          position: relative; flex-shrink: 0; cursor: pointer;
          transition: background 0.2s;
        }
        .ap-toggle.on { background: var(--accent); }
        .ap-toggle.off { background: var(--bg-4); }
        .ap-toggle-knob {
          position: absolute; top: 4px;
          width: 18px; height: 18px; border-radius: 50%;
          background: white; transition: left 0.2s;
        }
        .ap-toggle.on .ap-toggle-knob { left: 22px; }
        .ap-toggle.off .ap-toggle-knob { left: 4px; }

        /* ── Invite rows ── */
        .ap-invite-row {
          display: flex; align-items: center; gap: 12px;
          padding: 11px 16px; border-top: 1px solid var(--border);
        }
        .ap-invite-info { flex: 1; min-width: 0; }
        .ap-invite-email { display: block; font-size: 13px; color: var(--text-1); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .ap-invite-exp { display: block; font-size: 11px; color: var(--text-3); margin-top: 2px; }

        /* ── Search ── */
        .ap-search {
          display: flex; align-items: center; gap: 10px;
          background: var(--bg-2); border: 1px solid var(--border);
          border-radius: var(--radius); padding: 10px 14px;
        }
        .ap-search input {
          flex: 1; min-width: 0; background: none; border: none;
          font-size: 16px; color: var(--text-0);
        }
        .ap-search input::placeholder { color: var(--text-3); }
        .ap-search-count { font-size: 12px; color: var(--text-3); flex-shrink: 0; }
        .ap-flash {
          background: var(--accent-dim); border: 1px solid var(--accent);
          border-radius: var(--radius); padding: 10px 14px;
          font-size: 13px; color: var(--accent);
        }

        /* ── User card ── */
        .ap-user {
          display: flex; align-items: flex-start; gap: 12px;
          padding: 14px 16px; border-bottom: 1px solid var(--border);
        }
        .ap-user:last-child { border-bottom: none; }
        .ap-user.banned { opacity: 0.55; }
        .ap-user-left { display: flex; align-items: flex-start; gap: 10px; flex: 1; min-width: 0; }
        .ap-avatar-wrap { position: relative; flex-shrink: 0; }
        .ap-online {
          position: absolute; bottom: 1px; right: 1px;
          width: 10px; height: 10px; border-radius: 50%;
          background: var(--green); border: 2px solid var(--bg-2);
        }
        .ap-user-info { flex: 1; min-width: 0; }
        .ap-user-name { display: block; font-size: 14px; font-weight: 500; color: var(--text-0); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .ap-user-handle { display: block; font-size: 12px; color: var(--text-3); }
        .ap-user-email { display: block; font-size: 11px; color: var(--text-3); margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .ap-user-right { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; flex-shrink: 0; }
        .ap-badges { display: flex; gap: 4px; flex-wrap: wrap; justify-content: flex-end; }
        .ap-actions { display: flex; gap: 4px; flex-wrap: wrap; justify-content: flex-end; }
        .ap-you { font-size: 11px; color: var(--accent); background: var(--accent-dim); padding: 3px 8px; border-radius: var(--radius-full); }

        /* ── Badges ── */
        .ap-badge {
          display: inline-flex; align-items: center;
          padding: 3px 8px; border-radius: var(--radius-full);
          font-size: 11px; font-weight: 600;
        }
        .ap-badge.active { background: rgba(61,214,140,0.12); color: var(--green); }
        .ap-badge.banned { background: var(--red-dim); color: var(--red); }
        .ap-badge.twofa { background: rgba(99,102,241,0.12); color: var(--accent); }
        .ap-badge.audit-ban, .ap-badge.audit-delete, .ap-badge.audit-revoke { background: var(--red-dim); color: var(--red); }
        .ap-badge.audit-unban, .ap-badge.audit-create { background: rgba(61,214,140,0.12); color: var(--green); }
        .ap-badge.audit-password_reset, .ap-badge.audit-reset_2fa { background: rgba(99,102,241,0.12); color: var(--accent); }
        .ap-badge.audit-registration_toggle { background: var(--bg-3); color: var(--text-2); }

        /* ── Icon buttons ── */
        .ap-icon-btn {
          width: 34px; height: 34px;
          display: flex; align-items: center; justify-content: center;
          border-radius: var(--radius-sm); font-size: 15px;
          transition: all var(--transition); flex-shrink: 0;
        }
        .ap-icon-btn.danger { background: var(--bg-3); color: var(--text-3); }
        .ap-icon-btn.danger:hover { background: var(--red-dim); color: var(--red); }
        .ap-icon-btn.warn { background: var(--red-dim); color: var(--red); }
        .ap-icon-btn.warn:hover { background: var(--red); color: white; }
        .ap-icon-btn.success { background: rgba(61,214,140,0.1); color: var(--green); }
        .ap-icon-btn.success:hover { background: var(--green); color: white; }
        .ap-icon-btn.muted { background: var(--bg-3); color: var(--text-3); }
        .ap-icon-btn.muted:hover { background: var(--accent-dim); color: var(--accent); }

        /* ── Section header ── */
        .ap-section-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 11px 16px; background: var(--bg-3);
          border-bottom: 1px solid var(--border);
          font-size: 13px; font-weight: 600; color: var(--text-0);
        }
        .ap-section-count { font-size: 12px; color: var(--text-3); font-weight: 400; }
        .ap-empty { padding: 28px 16px; text-align: center; font-size: 13px; color: var(--text-3); }

        /* ── Audit rows ── */
        .ap-audit {
          display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
          padding: 10px 16px; border-bottom: 1px solid var(--border);
          font-size: 13px;
        }
        .ap-audit:last-child { border-bottom: none; }
        .ap-audit-actor { font-weight: 500; color: var(--text-0); }
        .ap-audit-target { color: var(--text-2); }
        .ap-audit-time { margin-left: auto; font-size: 11px; color: var(--text-3); flex-shrink: 0; }

        /* ── Buttons ── */
        .ap-btn-primary {
          padding: 8px 14px; background: var(--accent); color: white;
          border-radius: var(--radius); font-size: 14px; font-weight: 500;
          white-space: nowrap; flex-shrink: 0; transition: all var(--transition);
        }
        .ap-btn-primary:hover { background: var(--accent-light); }

        /* ── Modal overlay & sheet ── */
        .ap-overlay {
          position: fixed; inset: 0; z-index: 300;
          background: rgba(0,0,0,0.65);
          display: flex; align-items: flex-end; justify-content: center;
        }
        @media (min-width: 520px) {
          .ap-overlay { align-items: center; padding: 24px; }
        }
        .ap-sheet {
          background: var(--bg-2); border: 1px solid var(--border);
          border-radius: 20px 20px 0 0;
          width: 100%; max-height: 90dvh; overflow-y: auto;
          padding: 24px 20px;
          padding-bottom: max(24px, env(safe-area-inset-bottom, 24px));
          display: flex; flex-direction: column; gap: 12px;
          animation: slideUp 0.2s ease;
        }
        @media (min-width: 520px) {
          .ap-sheet { border-radius: 16px; max-width: 420px; max-height: unset; padding: 28px; }
        }
        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        .ap-modal-title { font-size: 17px; font-weight: 600; color: var(--text-0); }
        .ap-modal-sub { font-size: 14px; color: var(--text-2); line-height: 1.5; }
        .ap-modal-actions { display: flex; gap: 10px; margin-top: 4px; }
        .ap-btn-secondary {
          flex: 1; padding: 13px; border-radius: var(--radius);
          background: var(--bg-3); color: var(--text-1);
          font-size: 15px; font-weight: 500; transition: all var(--transition);
        }
        .ap-btn-secondary:hover { background: var(--bg-4); }
        .ap-btn-accent {
          flex: 1; padding: 13px; border-radius: var(--radius);
          background: var(--accent); color: white;
          font-size: 15px; font-weight: 500; transition: all var(--transition);
        }
        .ap-btn-accent:hover { opacity: 0.9; }
        .ap-btn-accent:disabled { opacity: 0.5; }
        .ap-btn-danger {
          flex: 1; padding: 13px; border-radius: var(--radius);
          background: var(--red); color: white;
          font-size: 15px; font-weight: 500; transition: all var(--transition);
        }
        .ap-btn-danger:hover { opacity: 0.85; }
        .ap-input {
          width: 100%; background: var(--bg-3); border: 1px solid var(--border);
          border-radius: var(--radius); padding: 12px 14px;
          font-size: 16px; color: var(--text-0); box-sizing: border-box;
          transition: border-color var(--transition);
        }
        .ap-input:focus { border-color: var(--accent); }
        .ap-input::placeholder { color: var(--text-3); }
        .ap-select {
          width: 100%; background: var(--bg-3); border: 1px solid var(--border);
          border-radius: var(--radius); padding: 12px 14px;
          font-size: 16px; color: var(--text-0); box-sizing: border-box;
          cursor: pointer; appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none'%3E%3Cpath d='M6 9l6 6 6-6' stroke='%23888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
          background-repeat: no-repeat; background-position: right 14px center;
          padding-right: 36px;
        }
        .ap-invite-url {
          background: var(--bg-3); border: 1px solid var(--border);
          border-radius: var(--radius); padding: 12px 14px;
          font-size: 12px; color: var(--text-1);
          word-break: break-all; font-family: monospace; line-height: 1.5;
        }
      `}</style>
    </div>
  );
}
