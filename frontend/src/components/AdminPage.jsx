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

/* Bottom-sheet modal — portals to document.body */
function Sheet({ onClose, children }) {
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

/* SVG icons */
const IconBan = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8"/>
    <line x1="5.1" y1="5.1" x2="18.9" y2="18.9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
  </svg>
);
const IconCheck = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IconKey = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <circle cx="7.5" cy="15.5" r="4.5" stroke="currentColor" strokeWidth="1.8"/>
    <path d="M10.5 12.5L20 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    <path d="M17 6l2 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
  </svg>
);
const IconShield = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <path d="M12 3L4 7v6c0 4.4 3.4 8.5 8 9.5C16.6 21.5 20 17.4 20 13V7l-8-4z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
    <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IconTrash = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M10 11v5M14 11v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
  </svg>
);
const IconDots = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <circle cx="5" cy="12" r="1.5" fill="currentColor"/>
    <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
    <circle cx="19" cy="12" r="1.5" fill="currentColor"/>
  </svg>
);

export default function AdminPage({ onBack }) {
  const { user } = useAuth();
  const { onlineUsers } = useChat();

  const [activeTab, setActiveTab] = useState('users'); // 'users' | 'audit'

  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState('');

  /* User action state */
  const [menuUser, setMenuUser] = useState(null);          // which user has the ··· menu open
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [resetPwUser, setResetPwUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [reset2faUser, setReset2faUser] = useState(null);

  /* Settings */
  const [registrationOpen, setRegistrationOpen] = useState(true);

  /* Invites */
  const [invites, setInvites] = useState([]);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteExpiry, setInviteExpiry] = useState('24');
  const [inviteResult, setInviteResult] = useState(null);
  const [inviteLoading, setInviteLoading] = useState(false);

  /* Audit */
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);

  /* ── Data loading ── */
  const loadStats   = useCallback(async () => { try { setStats(await apiFetch('/admin/stats')); } catch {} }, []);
  const loadInvites = useCallback(async () => { try { setInvites((await apiFetch('/admin/invites')).invites); } catch {} }, []);

  const loadUsers = useCallback(async (q = '') => {
    setLoading(true);
    try {
      const d = await apiFetch(`/admin/users?search=${encodeURIComponent(q)}&limit=100`);
      setUsers(d.users); setTotal(d.total);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => {
    loadStats(); loadUsers(); loadInvites();
    apiFetch('/admin/settings').then(d => setRegistrationOpen(d.registrationOpen)).catch(() => {});
    setAuditLoading(true);
    apiFetch('/admin/audit').then(d => setAuditLogs(d.logs)).catch(() => {}).finally(() => setAuditLoading(false));
  }, [loadStats, loadUsers, loadInvites]);

  useEffect(() => {
    const t = setTimeout(() => loadUsers(search), 300);
    return () => clearTimeout(t);
  }, [search, loadUsers]);

  /* ── Flash helper ── */
  const showFlash = (msg) => { setFlash(msg); setTimeout(() => setFlash(''), 3500); };

  /* ── Action handlers ── */
  const handleToggleRegistration = async () => {
    try {
      const d = await apiFetch('/admin/settings', { method: 'PUT', body: JSON.stringify({ registrationOpen: !registrationOpen }) });
      setRegistrationOpen(d.registrationOpen);
      showFlash(`Registration ${d.registrationOpen ? 'opened' : 'closed'}`);
    } catch (e) { showFlash('Error: ' + e.message); }
  };

  const handleCreateInvite = async () => {
    setInviteLoading(true);
    try {
      const d = await apiFetch('/admin/invites', { method: 'POST', body: JSON.stringify({ email: inviteEmail || undefined, expiryHours: Number(inviteExpiry) }) });
      setInviteResult(d.inviteUrl); loadInvites();
    } catch (e) { showFlash('Error: ' + e.message); setShowInviteForm(false); }
    finally { setInviteLoading(false); }
  };

  const handleRevokeInvite = async (id) => {
    try {
      await apiFetch(`/admin/invites/${id}`, { method: 'DELETE' });
      setInvites(prev => prev.filter(i => i._id !== id));
    } catch (e) { showFlash('Error: ' + e.message); }
  };

  const handleBan = async (u) => {
    setMenuUser(null);
    try {
      const res = await apiFetch(`/admin/users/${u._id}/ban`, { method: 'PUT' });
      setUsers(prev => prev.map(x => x._id === u._id ? { ...x, banned: res.banned } : x));
      showFlash(`${u.username} ${res.banned ? 'suspended' : 'unsuspended'}`);
    } catch (e) { showFlash('Error: ' + e.message); }
  };

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 8) { showFlash('Password must be at least 8 characters'); return; }
    try {
      await apiFetch(`/admin/users/${resetPwUser._id}/reset-password`, { method: 'PUT', body: JSON.stringify({ newPassword }) });
      showFlash(`Password reset for ${resetPwUser.username}`);
      setResetPwUser(null); setNewPassword('');
    } catch (e) { showFlash('Error: ' + e.message); }
  };

  const handleReset2fa = async () => {
    try {
      await apiFetch(`/admin/users/${reset2faUser._id}/reset-2fa`, { method: 'PUT' });
      showFlash(`2FA reset for ${reset2faUser.username}`);
      setReset2faUser(null);
    } catch (e) { showFlash('Error: ' + e.message); }
  };

  const handleDelete = async (u) => {
    try {
      await apiFetch(`/admin/users/${u._id}`, { method: 'DELETE' });
      setUsers(prev => prev.filter(x => x._id !== u._id));
      setTotal(t => t - 1); setConfirmDelete(null);
      showFlash(`${u.username} deleted`);
    } catch (e) { showFlash('Error: ' + e.message); }
  };

  const isMe = (u) => String(u._id) === String(user?._id);

  return (
    <div className="ap">

      {/* ── Header ── */}
      <div className="ap-header">
        <button className="ap-back" onClick={onBack} aria-label="Back">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <span className="ap-title">Admin</span>
        <div style={{ width: 44 }} />
      </div>

      {/* ── Content ── */}
      <div className="ap-content">

        {/* Stats */}
        {stats && (
          <div className="ap-stats">
            {[
              { v: stats.totalUsers,              l: 'Users' },
              { v: stats.totalMessages,           l: 'Messages' },
              { v: stats.totalConversations,      l: 'Chats' },
              { v: stats.activeToday,             l: 'Active Today' },
              { v: stats.newUsersThisWeek,        l: 'New This Week' },
              { v: formatBytes(stats.storageBytes), l: 'Storage' },
            ].map(({ v, l }) => (
              <div key={l} className="ap-stat">
                <span className="ap-stat-val">{v}</span>
                <span className="ap-stat-lbl">{l}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── Settings section ── */}
        <div className="ap-group-label">Settings</div>

        {/* Registration toggle — own card */}
        <div className="ap-group">
          <div className="ap-row">
            <div className="ap-row-text">
              <div className="ap-row-title">Open Registration</div>
              <div className="ap-row-sub">Allow new users to sign up</div>
            </div>
            <button
              className={`ap-toggle ${registrationOpen ? 'on' : ''}`}
              onClick={handleToggleRegistration}
              aria-label="Toggle registration"
            >
              <span className="ap-toggle-knob" />
            </button>
          </div>
        </div>

        {/* Invite links — own card */}
        <div className="ap-group">
          <div className="ap-row">
            <div className="ap-row-text">
              <div className="ap-row-title">Invite Links</div>
              <div className="ap-row-sub">{invites.length} active invite{invites.length !== 1 ? 's' : ''}</div>
            </div>
            <button className="ap-pill-btn" onClick={() => { setInviteEmail(''); setInviteExpiry('24'); setInviteResult(null); setShowInviteForm(true); }}>
              + Create
            </button>
          </div>
          {invites.map(inv => (
            <div key={inv._id} className="ap-invite-item">
              <div className="ap-row-text">
                <div className="ap-invite-email">{inv.email || 'No email — link only'}</div>
                <div className="ap-row-sub">Expires {formatDistanceToNow(new Date(inv.expiresAt), { addSuffix: true })}</div>
              </div>
              <button className="ap-ghost-btn" onClick={() => handleRevokeInvite(inv._id)}>Revoke</button>
            </div>
          ))}
        </div>

        {flash && <div className="ap-flash">{flash}</div>}

        {/* ── Users tab ── */}
        {activeTab === 'users' && (
          <>
            <div className="ap-search">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--text-3)', flexShrink: 0 }}>
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2"/>
                <path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <input
                type="search"
                placeholder="Search users…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="ap-search-input"
              />
              {total > 0 && <span className="ap-count">{total}</span>}
            </div>

            <div className="ap-group ap-group-scroll">
              {loading ? (
                <div className="ap-empty">Loading…</div>
              ) : users.length === 0 ? (
                <div className="ap-empty">No users found</div>
              ) : users.map((u, idx) => (
                <div key={u._id}>
                  {idx > 0 && <div className="ap-sep" />}
                  <div className={`ap-user-row${u.banned ? ' banned' : ''}`}>
                    <div className="ap-avatar-wrap">
                      <Avatar user={u} size={42} />
                      {onlineUsers.has(String(u._id)) && <span className="ap-dot" />}
                    </div>
                    <div className="ap-user-info">
                      <div className="ap-user-name">{u.displayName || u.username}</div>
                      <div className="ap-user-sub">
                        @{u.username}
                        {u.email && <span className="ap-user-email">&nbsp;· {u.email}</span>}
                      </div>
                    </div>
                    <div className="ap-user-end">
                      {u.twoFactorEnabled && <span className="ap-badge purple">2FA</span>}
                      <span className={`ap-badge ${u.banned ? 'red' : 'green'}`}>{u.banned ? 'Suspended' : 'Active'}</span>
                      {isMe(u)
                        ? <span className="ap-you">You</span>
                        : (
                          <button className="ap-menu-btn" onClick={() => setMenuUser(u)} aria-label="User actions">
                            <IconDots />
                          </button>
                        )
                      }
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── Audit log tab ── */}
        {activeTab === 'audit' && (
          <div className="ap-group ap-group-scroll">
            {auditLoading ? (
              <div className="ap-empty">Loading…</div>
            ) : auditLogs.length === 0 ? (
              <div className="ap-empty">No activity yet</div>
            ) : auditLogs.map((log, idx) => (
              <div key={log._id}>
                {idx > 0 && <div className="ap-sep" />}
                <div className="ap-audit">
                  <span className={`ap-badge audit-${log.action.split('.')[1]}`}>
                    {ACTION_LABELS[log.action] || log.action}
                  </span>
                  <span className="ap-audit-who">
                    {log.performedByUsername}
                    {log.targetUsername && <span className="ap-audit-target"> → {log.targetUsername}</span>}
                    {log.action === 'invite.create' && log.metadata?.email && <span className="ap-audit-target"> → {log.metadata.email}</span>}
                    {log.action === 'settings.registration_toggle' && <span className="ap-audit-target"> {log.metadata?.registrationOpen ? 'opened' : 'closed'}</span>}
                  </span>
                  <span className="ap-audit-time">{formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}</span>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>{/* /ap-content */}

      {/* ── Bottom tab bar ── */}
      <div className="ap-tab-bar">
        <button
          className={`ap-tab ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <circle cx="9" cy="7" r="3" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M3 21v-2a5 5 0 015-5h4a5 5 0 015 5v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            <path d="M16 3.13a4 4 0 010 7.75M21 21v-2a4 4 0 00-3-3.85" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          Users {total > 0 && <span className="ap-tab-count">{total}</span>}
        </button>
        <button
          className={`ap-tab ${activeTab === 'audit' ? 'active' : ''}`}
          onClick={() => setActiveTab('audit')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            <rect x="9" y="3" width="6" height="4" rx="1" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M9 12h6M9 16h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          Audit Log {auditLogs.length > 0 && <span className="ap-tab-count">{auditLogs.length}</span>}
        </button>
      </div>

      {/* ════════════════════════════════
          Modals / sheets
          ════════════════════════════════ */}

      {/* User action menu */}
      {menuUser && (
        <Sheet onClose={() => setMenuUser(null)}>
          <div className="ap-sheet-header">
            <span className="ap-sheet-title">@{menuUser.username}</span>
          </div>
          <div className="ap-actions-list">
            <button
              className={`ap-action-item ${menuUser.banned ? 'green' : 'orange'}`}
              onClick={() => handleBan(menuUser)}
            >
              <span className="ap-action-icon">{menuUser.banned ? <IconCheck /> : <IconBan />}</span>
              <span className="ap-action-label">{menuUser.banned ? 'Unsuspend user' : 'Suspend user'}</span>
            </button>
            <button
              className="ap-action-item"
              onClick={() => { setMenuUser(null); setResetPwUser(menuUser); setNewPassword(''); }}
            >
              <span className="ap-action-icon"><IconKey /></span>
              <span className="ap-action-label">Reset password</span>
            </button>
            <button
              className="ap-action-item"
              onClick={() => { setMenuUser(null); setReset2faUser(menuUser); }}
            >
              <span className="ap-action-icon"><IconShield /></span>
              <span className="ap-action-label">Reset 2FA</span>
            </button>
            <button
              className="ap-action-item red"
              onClick={() => { setMenuUser(null); setConfirmDelete(menuUser); }}
            >
              <span className="ap-action-icon"><IconTrash /></span>
              <span className="ap-action-label">Delete user</span>
            </button>
          </div>
          <button className="ap-cancel-btn" onClick={() => setMenuUser(null)}>Cancel</button>
        </Sheet>
      )}

      {/* Create invite */}
      {showInviteForm && !inviteResult && (
        <Sheet onClose={() => setShowInviteForm(false)}>
          <div className="ap-sheet-header">
            <span className="ap-sheet-title">Create invite link</span>
          </div>
          <p className="ap-sheet-sub">Single-use link. Optionally send by email.</p>
          <input type="email" placeholder="Email (optional)" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} className="ap-input" />
          <select value={inviteExpiry} onChange={e => setInviteExpiry(e.target.value)} className="ap-select">
            <option value="24">Expires in 24 hours</option>
            <option value="72">Expires in 3 days</option>
            <option value="168">Expires in 7 days</option>
            <option value="720">Expires in 30 days</option>
          </select>
          <div className="ap-sheet-btns">
            <button className="ap-btn secondary" onClick={() => setShowInviteForm(false)}>Cancel</button>
            <button className="ap-btn accent" disabled={inviteLoading} onClick={handleCreateInvite}>
              {inviteLoading ? 'Creating…' : inviteEmail ? 'Create & email' : 'Create link'}
            </button>
          </div>
        </Sheet>
      )}

      {/* Show invite URL */}
      {showInviteForm && inviteResult && (
        <Sheet onClose={() => { setShowInviteForm(false); setInviteResult(null); }}>
          <div className="ap-sheet-header">
            <span className="ap-sheet-title">Invite link ready</span>
          </div>
          {inviteEmail && <p className="ap-sheet-sub">Email sent to <strong>{inviteEmail}</strong>.</p>}
          <p className="ap-sheet-sub">Copy and share — single use only:</p>
          <div className="ap-code-box">{inviteResult}</div>
          <div className="ap-sheet-btns">
            <button className="ap-btn secondary" onClick={() => navigator.clipboard.writeText(inviteResult)}>Copy link</button>
            <button className="ap-btn accent" onClick={() => { setShowInviteForm(false); setInviteResult(null); }}>Done</button>
          </div>
        </Sheet>
      )}

      {/* Reset password */}
      {resetPwUser && (
        <Sheet onClose={() => setResetPwUser(null)}>
          <div className="ap-sheet-header">
            <span className="ap-sheet-title">Reset password</span>
          </div>
          <p className="ap-sheet-sub">New password for <strong>@{resetPwUser.username}</strong>. Logs them out everywhere.</p>
          <input type="password" placeholder="New password (min 8 chars)" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="ap-input" autoFocus />
          <div className="ap-sheet-btns">
            <button className="ap-btn secondary" onClick={() => setResetPwUser(null)}>Cancel</button>
            <button className="ap-btn accent" onClick={handleResetPassword}>Reset</button>
          </div>
        </Sheet>
      )}

      {/* Reset 2FA */}
      {reset2faUser && (
        <Sheet onClose={() => setReset2faUser(null)}>
          <div className="ap-sheet-header">
            <span className="ap-sheet-title">Reset 2FA?</span>
          </div>
          <p className="ap-sheet-sub">Disables 2FA for <strong>@{reset2faUser.username}</strong>. They can log in with password only until they re-enable it.</p>
          <div className="ap-sheet-btns">
            <button className="ap-btn secondary" onClick={() => setReset2faUser(null)}>Cancel</button>
            <button className="ap-btn accent" onClick={handleReset2fa}>Reset 2FA</button>
          </div>
        </Sheet>
      )}

      {/* Confirm delete */}
      {confirmDelete && (
        <Sheet onClose={() => setConfirmDelete(null)}>
          <div className="ap-sheet-header">
            <span className="ap-sheet-title">Delete user?</span>
          </div>
          <p className="ap-sheet-sub">Permanently deletes <strong>@{confirmDelete.username}</strong> and all their data. This cannot be undone.</p>
          <div className="ap-sheet-btns">
            <button className="ap-btn secondary" onClick={() => setConfirmDelete(null)}>Cancel</button>
            <button className="ap-btn danger" onClick={() => handleDelete(confirmDelete)}>Delete permanently</button>
          </div>
        </Sheet>
      )}

      {/* ══════════════ STYLES ══════════════ */}
      <style>{`
        /* Outer container — this IS the scroll zone */
        .ap {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          background: var(--bg-0);
        }

        /* Sticky header — stays at top while page scrolls */
        .ap-header {
          position: sticky; top: 0; z-index: 10;
          display: flex; align-items: center; justify-content: space-between;
          height: 56px; padding: 0 8px;
          border-bottom: 1px solid var(--border);
          background: var(--bg-1);
        }
        .ap-back {
          width: 44px; height: 44px;
          display: flex; align-items: center; justify-content: center;
          border-radius: 10px; color: var(--text-2);
          transition: background var(--transition);
        }
        .ap-back:active { background: var(--bg-3); }
        @media(hover:hover){.ap-back:hover{background:var(--bg-3);color:var(--text-0);}}
        .ap-title { font-size: 17px; font-weight: 700; color: var(--text-0); }

        /* Content area */
        .ap-content {
          padding: 20px 16px 24px;
          display: flex; flex-direction: column; gap: 8px;
          max-width: 860px; margin: 0 auto; width: 100%;
          box-sizing: border-box;
        }

        /* Sticky bottom tab bar */
        .ap-tab-bar {
          position: sticky; bottom: 0; z-index: 10;
          display: flex;
          background: var(--bg-1);
          border-top: 1px solid var(--border);
          padding-bottom: env(safe-area-inset-bottom, 0px);
        }
        .ap-tab {
          flex: 1; display: flex; align-items: center; justify-content: center;
          gap: 6px; padding: 14px 16px;
          font-size: 14px; font-weight: 500; color: var(--text-3);
          transition: all var(--transition);
        }
        .ap-tab.active { color: var(--accent); }
        .ap-tab-count {
          font-size: 11px; font-weight: 700;
          background: var(--bg-3); color: var(--text-3);
          padding: 2px 7px; border-radius: 20px;
        }
        .ap-tab.active .ap-tab-count {
          background: var(--accent-dim); color: var(--accent);
        }

        /* Stats: 2-col on phones, 3-col on ≥480px, 6-col on ≥900px */
        .ap-stats {
          display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
          margin-bottom: 8px;
        }
        @media(min-width:480px){.ap-stats{grid-template-columns:repeat(3,1fr);}}
        @media(min-width:900px){.ap-stats{grid-template-columns:repeat(6,1fr);}}
        .ap-stat {
          background: var(--bg-2); border: 1px solid var(--border);
          border-radius: 12px; padding: 14px 14px;
          display: flex; flex-direction: column; gap: 4px;
          min-width: 0;
        }
        .ap-stat-val { font-size: 22px; font-weight: 700; color: var(--text-0); line-height: 1; }
        .ap-stat-lbl { font-size: 12px; color: var(--text-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        /* Section label */
        .ap-group-label {
          font-size: 11px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.08em; color: var(--text-3);
          padding: 10px 4px 2px;
        }

        /* Grouped card */
        .ap-group {
          background: var(--bg-2); border: 1px solid var(--border);
          border-radius: 14px; overflow: hidden;
        }
        .ap-group-scroll {
          max-height: 420px;
          overflow-y: auto; -webkit-overflow-scrolling: touch;
        }
        .ap-sep { height: 1px; background: var(--border); margin: 0 16px; }

        /* Setting row */
        .ap-row {
          display: flex; align-items: center; gap: 12px;
          padding: 15px 16px;
        }
        .ap-row-sm { padding: 12px 16px; }
        .ap-row-text { flex: 1; min-width: 0; }
        .ap-row-title { font-size: 15px; font-weight: 500; color: var(--text-0); }
        .ap-row-sub { font-size: 13px; color: var(--text-3); margin-top: 2px; }
        .ap-row-title.ap-mono {
          font-family: var(--font-mono); font-size: 12px;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }

        /* Toggle switch */
        .ap-toggle {
          width: 52px; height: 32px; border-radius: 16px;
          position: relative; flex-shrink: 0;
          background: var(--bg-4); transition: background 0.2s;
        }
        .ap-toggle.on { background: var(--accent); }
        .ap-toggle-knob {
          position: absolute; top: 4px; left: 4px;
          width: 24px; height: 24px; border-radius: 50%;
          background: white; box-shadow: 0 1px 4px rgba(0,0,0,0.35);
          transition: left 0.2s;
        }
        .ap-toggle.on .ap-toggle-knob { left: 24px; }

        /* Small buttons */
        .ap-pill-btn {
          padding: 8px 16px; border-radius: 20px;
          background: var(--accent); color: white;
          font-size: 14px; font-weight: 600; flex-shrink: 0;
          transition: opacity var(--transition);
        }
        .ap-pill-btn:active { opacity: 0.8; }
        @media(hover:hover){.ap-pill-btn:hover{opacity:0.88;}}
        .ap-ghost-btn {
          padding: 7px 14px; border-radius: 8px;
          background: var(--bg-3); color: var(--text-2);
          font-size: 13px; font-weight: 500; flex-shrink: 0;
          transition: all var(--transition);
        }
        .ap-ghost-btn:active { background: var(--red-dim); color: var(--red); }
        @media(hover:hover){.ap-ghost-btn:hover{background:var(--red-dim);color:var(--red);}}

        /* Search bar */
        .ap-search {
          display: flex; align-items: center; gap: 10px;
          background: var(--bg-2); border: 1px solid var(--border);
          border-radius: 12px; padding: 12px 14px;
        }
        .ap-search-input {
          flex: 1; min-width: 0; background: none; border: none;
          font-size: 16px; color: var(--text-0);
        }
        .ap-search-input::placeholder { color: var(--text-3); }
        .ap-count {
          font-size: 12px; color: var(--text-3); flex-shrink: 0;
          background: var(--bg-3); padding: 3px 9px; border-radius: 20px;
        }

        /* Flash */
        .ap-flash {
          background: var(--accent-dim); border: 1px solid var(--accent);
          border-radius: 12px; padding: 12px 16px;
          font-size: 14px; color: var(--accent); text-align: center;
        }

        /* ── User row ── */
        .ap-user-row {
          display: flex; align-items: center; gap: 12px;
          padding: 14px 16px;
        }
        .ap-user-row.banned { opacity: 0.5; }

        .ap-avatar-wrap { position: relative; flex-shrink: 0; }
        .ap-dot {
          position: absolute; bottom: 0; right: 0;
          width: 11px; height: 11px; border-radius: 50%;
          background: var(--green); border: 2px solid var(--bg-2);
        }

        .ap-user-info { flex: 1; min-width: 0; }
        .ap-user-name {
          font-size: 15px; font-weight: 600; color: var(--text-0);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .ap-user-sub {
          font-size: 12px; color: var(--text-3); margin-top: 2px;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .ap-user-email { color: var(--text-3); }

        /* Right side of user row — badges + menu button in one row */
        .ap-user-end {
          flex-shrink: 0;
          display: flex; flex-direction: row; align-items: center; gap: 6px;
        }

        /* Invite item row inside invite card */
        .ap-invite-item {
          display: flex; align-items: center; gap: 12px;
          padding: 12px 16px;
          border-top: 1px solid var(--border);
        }
        .ap-invite-email {
          font-size: 13px; color: var(--text-1); font-family: var(--font-mono);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .ap-menu-btn {
          width: 32px; height: 32px;
          display: flex; align-items: center; justify-content: center;
          border-radius: 8px; color: var(--text-3);
          background: var(--bg-3);
          transition: all var(--transition);
        }
        .ap-menu-btn:active { background: var(--accent-dim); color: var(--accent); }
        @media(hover:hover){.ap-menu-btn:hover{background:var(--accent-dim);color:var(--accent);}}
        .ap-you {
          font-size: 11px; color: var(--accent);
          background: var(--accent-dim); padding: 3px 9px;
          border-radius: 20px; font-weight: 600;
        }

        /* Badges */
        .ap-badge {
          display: inline-flex; align-items: center;
          padding: 3px 8px; border-radius: 20px;
          font-size: 11px; font-weight: 700; letter-spacing: 0.02em;
          white-space: nowrap;
        }
        .ap-badge.green  { background: var(--green-dim);               color: var(--green);  }
        .ap-badge.red    { background: var(--red-dim);                  color: var(--red);    }
        .ap-badge.purple { background: rgba(108,99,255,0.15);           color: var(--accent); }
        .ap-badge.audit-ban,.ap-badge.audit-delete,.ap-badge.audit-revoke   { background: var(--red-dim);              color: var(--red);    }
        .ap-badge.audit-unban,.ap-badge.audit-create                        { background: var(--green-dim);            color: var(--green);  }
        .ap-badge.audit-password_reset,.ap-badge.audit-reset_2fa            { background: rgba(108,99,255,0.15);       color: var(--accent); }
        .ap-badge.audit-registration_toggle                                 { background: var(--bg-3);                 color: var(--text-2); }

        /* Audit row */
        .ap-audit {
          display: flex; align-items: baseline; flex-wrap: wrap; gap: 6px;
          padding: 12px 16px;
        }
        .ap-audit-who { font-size: 13px; color: var(--text-1); font-weight: 500; flex: 1; min-width: 0; }
        .ap-audit-target { color: var(--text-3); font-weight: 400; }
        .ap-audit-time { font-size: 11px; color: var(--text-3); flex-shrink: 0; white-space: nowrap; }

        /* Empty */
        .ap-empty { padding: 32px 16px; text-align: center; font-size: 14px; color: var(--text-3); }

        /* ── Bottom sheet (modal) ── */
        .ap-overlay {
          position: fixed; inset: 0; z-index: 500;
          background: rgba(0,0,0,0.7);
          display: flex; align-items: flex-end;
        }
        @media(min-width:540px){
          .ap-overlay { align-items: center; justify-content: center; padding: 24px; }
        }
        .ap-sheet {
          width: 100%; background: var(--bg-2);
          border: 1px solid var(--border); border-radius: 20px 20px 0 0;
          padding: 20px;
          padding-bottom: max(20px, env(safe-area-inset-bottom, 20px));
          display: flex; flex-direction: column; gap: 12px;
          max-height: 90dvh; overflow-y: auto;
          animation: apUp 0.2s ease;
        }
        @media(min-width:540px){
          .ap-sheet { border-radius: 18px; max-width: 420px; max-height: none; }
        }
        @keyframes apUp {
          from { transform: translateY(20px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        .ap-sheet-header { padding-bottom: 4px; border-bottom: 1px solid var(--border); }
        .ap-sheet-title  { font-size: 18px; font-weight: 700; color: var(--text-0); }
        .ap-sheet-sub    { font-size: 14px; color: var(--text-2); line-height: 1.55; }

        /* Action list in user menu */
        .ap-actions-list { display: flex; flex-direction: column; gap: 4px; }
        .ap-action-item {
          display: flex; align-items: center; gap: 14px;
          padding: 14px 16px; border-radius: 12px;
          background: var(--bg-3);
          transition: all var(--transition);
        }
        .ap-action-item:active { filter: brightness(1.15); }
        @media(hover:hover){.ap-action-item:hover{filter:brightness(1.1);}}
        .ap-action-item.green  { background: var(--green-dim);         color: var(--green);  }
        .ap-action-item.orange { background: rgba(255,160,60,0.12);    color: #f59e0b;       }
        .ap-action-item.red    { background: var(--red-dim);           color: var(--red);    }
        .ap-action-icon { flex-shrink: 0; display: flex; align-items: center; }
        .ap-action-label { font-size: 16px; font-weight: 500; }

        /* Cancel button */
        .ap-cancel-btn {
          width: 100%; padding: 15px; border-radius: 12px;
          background: var(--bg-3); color: var(--text-2);
          font-size: 16px; font-weight: 600;
          transition: all var(--transition);
        }
        .ap-cancel-btn:active { background: var(--bg-4); }
        @media(hover:hover){.ap-cancel-btn:hover{background:var(--bg-4);}}

        /* Form inputs */
        .ap-input {
          width: 100%; background: var(--bg-3); border: 1.5px solid var(--border);
          border-radius: 12px; padding: 14px 16px;
          font-size: 16px; color: var(--text-0); box-sizing: border-box;
          transition: border-color var(--transition);
        }
        .ap-input:focus { border-color: var(--accent); outline: none; }
        .ap-input::placeholder { color: var(--text-3); }
        .ap-select {
          width: 100%; background: var(--bg-3); border: 1.5px solid var(--border);
          border-radius: 12px; padding: 14px 40px 14px 16px;
          font-size: 16px; color: var(--text-0); box-sizing: border-box;
          cursor: pointer; appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none'%3E%3Cpath d='M6 9l6 6 6-6' stroke='%23666' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
          background-repeat: no-repeat; background-position: right 16px center;
        }
        .ap-code-box {
          background: var(--bg-3); border: 1px solid var(--border);
          border-radius: 12px; padding: 14px 16px;
          font-size: 12px; font-family: var(--font-mono);
          color: var(--text-1); word-break: break-all; line-height: 1.6;
        }

        /* Sheet action buttons */
        .ap-sheet-btns { display: flex; gap: 10px; }
        .ap-btn {
          flex: 1; padding: 15px; border-radius: 12px;
          font-size: 16px; font-weight: 600;
          transition: all var(--transition);
        }
        .ap-btn.secondary { background: var(--bg-3); color: var(--text-1); }
        .ap-btn.secondary:active { background: var(--bg-4); }
        @media(hover:hover){.ap-btn.secondary:hover{background:var(--bg-4);}}
        .ap-btn.accent { background: var(--accent); color: white; }
        .ap-btn.accent:active { opacity: 0.85; }
        .ap-btn.accent:disabled { opacity: 0.45; }
        @media(hover:hover){.ap-btn.accent:hover{opacity:0.88;}}
        .ap-btn.danger { background: var(--red); color: white; }
        .ap-btn.danger:active { opacity: 0.85; }
        @media(hover:hover){.ap-btn.danger:hover{opacity:0.88;}}
      `}</style>
    </div>
  );
}
