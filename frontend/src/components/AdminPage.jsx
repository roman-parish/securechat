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
  'settings.email_update': 'Email settings',
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
  const [msgChart, setMsgChart] = useState([]);
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
  const [emailSettings, setEmailSettings] = useState({
    enabled: true, loginNotification: true, passwordChanged: true, securityAlerts: true,
  });

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
    apiFetch('/admin/stats/messages-chart').then(d => setMsgChart(d)).catch(() => {});
    apiFetch('/admin/settings').then(d => {
      setRegistrationOpen(d.registrationOpen);
      if (d.email) setEmailSettings(d.email);
    }).catch(() => {});
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

  const handleEmailSettingToggle = async (key) => {
    const updated = { ...emailSettings, [key]: !emailSettings[key] };
    setEmailSettings(updated);
    try {
      const d = await apiFetch('/admin/settings', { method: 'PUT', body: JSON.stringify({ email: { [key]: updated[key] } }) });
      if (d.email) setEmailSettings(d.email);
      showFlash(`Email setting updated`);
    } catch (e) {
      setEmailSettings(emailSettings);
      showFlash('Error: ' + e.message);
    }
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

  const handleVerifyEmail = async () => {
    try {
      await apiFetch(`/admin/users/${menuUser._id}/verify-email`, { method: 'PUT' });
      setMenuUser(u => ({ ...u, emailVerified: true }));
      setUsers(prev => prev.map(x => x._id === menuUser._id ? { ...x, emailVerified: true } : x));
      showFlash(`Email verified for ${menuUser.username}`);
    } catch (e) { showFlash('Error: ' + e.message); }
  };

  const isMe = (u) => String(u._id) === String(user?._id);

  const TAB_TITLES = { stats: 'Stats', settings: 'Settings', users: 'Users', logs: 'Audit Log' };

  return (
    <div className="ap">

      {/* ── Header ── */}
      <div className="ap-header">
        <button className="ap-back" onClick={onBack} aria-label="Back">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <span className="ap-title">{TAB_TITLES[activeTab]}</span>
        <div className="ap-admin-badge">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <path d="M12 3L4 7v6c0 4.4 3.4 8.5 8 9.5C16.6 21.5 20 17.4 20 13V7l-8-4z" fill="currentColor" opacity="0.9"/>
          </svg>
          Admin
        </div>
      </div>

      {/* ── Page content (scrollable) ── */}
      <div className="ap-page">
        <div className="ap-inner">

          {flash && <div className="ap-flash">{flash}</div>}

          {/* ════ STATS ════ */}
          {activeTab === 'stats' && (
            stats ? (
              <div className="ap-stat-grid">
                {[
                  { val: stats.totalUsers,       fmt:'n', lbl:'Users',        col:'#6c63ff', dim:'rgba(108,99,255,0.13)',
                    icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="9" cy="7" r="3" stroke="currentColor" strokeWidth="1.8"/><path d="M3 21v-2a5 5 0 015-5h4a5 5 0 015 5v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><path d="M16 3.13a4 4 0 010 7.75M21 21v-2a4 4 0 00-3-3.85" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg> },
                  { val: stats.activeToday,      fmt:'n', lbl:'Active Today', col:'#22c55e', dim:'rgba(34,197,94,0.13)',
                    icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" fill="currentColor"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4l1.4-1.4M17 7l1.4-1.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg> },
                  { val: stats.newUsersThisWeek, fmt:'n', lbl:'New / Week',   col:'#f59e0b', dim:'rgba(245,158,11,0.13)',
                    icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/></svg> },
                  { val: stats.bannedUsers,      fmt:'n', lbl:'Suspended',    col:'#ef4444', dim:'rgba(239,68,68,0.13)',
                    icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8"/><line x1="4.9" y1="4.9" x2="19.1" y2="19.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg> },
                  { val: stats.totalMessages,    fmt:'n', lbl:'Messages',     col:'#6c63ff', dim:'rgba(108,99,255,0.13)',
                    icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/></svg> },
                  { val: stats.messagesLast24h,  fmt:'n', lbl:'Msgs 24h',     col:'#22c55e', dim:'rgba(34,197,94,0.13)',
                    icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 8v4l2 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8"/></svg> },
                  { val: stats.totalAttachments, fmt:'n', lbl:'Attachments',  col:'#f59e0b', dim:'rgba(245,158,11,0.13)',
                    icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg> },
                  { val: stats.totalMessages > 0 ? (stats.totalMessages / Math.max(stats.totalUsers,1)).toFixed(1) : '0', fmt:'s', lbl:'Msgs / User', col:'#8b5cf6', dim:'rgba(139,92,246,0.13)',
                    icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M18 20V10M12 20V4M6 20v-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg> },
                  { val: stats.groupChats,       fmt:'n', lbl:'Group Chats',  col:'#3b82f6', dim:'rgba(59,130,246,0.13)',
                    icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.8"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg> },
                  { val: stats.directChats,      fmt:'n', lbl:'Direct Chats', col:'#14b8a6', dim:'rgba(20,184,166,0.13)',
                    icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.42-4.03 8-9 8a9.86 9.86 0 01-4-.83L3 20l1.9-3.8A7.93 7.93 0 013 12c0-4.42 4.03-8 9-8s9 3.58 9 8z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg> },
                  { val: stats.twoFaUsers,       fmt:'n', lbl:'2FA Enabled',  col:'#8b5cf6', dim:'rgba(139,92,246,0.13)',
                    icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg> },
                  { val: formatBytes(stats.storageBytes), fmt:'s', lbl:'Storage', col:'#f59e0b', dim:'rgba(245,158,11,0.13)',
                    icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 002 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/></svg> },
                ].map(({ val, fmt, lbl, col, dim, icon }) => (
                  <div key={lbl} className="ap-stat-card" style={{'--sc':col,'--scd':dim}}>
                    <div className="ap-sc-top">
                      <span className="ap-sc-lbl">{lbl}</span>
                      <div className="ap-sc-icon">{icon}</div>
                    </div>
                    <div className="ap-sc-val">{fmt === 'n' ? Number(val).toLocaleString() : val}</div>
                  </div>
                ))}
              </div>
            ) : <div className="ap-empty">Loading…</div>
          )}

          {activeTab === 'stats' && msgChart.length === 7 && (() => {
            const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const W = 300, H = 80, LABEL_H = 20, BAR_AREA = H - LABEL_H;
            const maxCount = Math.max(1, ...msgChart.map(d => d.count));
            const barW = Math.floor((W / 7) * 0.55);
            const slotW = W / 7;
            return (
              <div className="ap-group">
                <div className="ap-group-title">Messages — last 7 days</div>
                <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', padding: '4px 12px 0', boxSizing: 'border-box' }}>
                  {msgChart.map((pt, i) => {
                    const barH = Math.max(2, (pt.count / maxCount) * (BAR_AREA - 14));
                    const x = slotW * i + (slotW - barW) / 2;
                    const y = BAR_AREA - barH;
                    const dayAbbr = DAY_ABBR[new Date(pt.date + 'T12:00:00').getDay()];
                    return (
                      <g key={pt.date} className="ap-chart-bar-g">
                        <rect
                          x={x} y={y} width={barW} height={barH}
                          rx="3"
                          fill="#6c63ff"
                          fillOpacity="0.2"
                          className="ap-chart-bar"
                        />
                        {pt.count > 0 && (
                          <text
                            x={x + barW / 2} y={y - 3}
                            textAnchor="middle"
                            fontSize="7"
                            fill="#6c63ff"
                            fillOpacity="0.7"
                          >{pt.count}</text>
                        )}
                        <text
                          x={slotW * i + slotW / 2} y={H - 4}
                          textAnchor="middle"
                          fontSize="7.5"
                          fill="var(--text-3)"
                        >{dayAbbr}</text>
                      </g>
                    );
                  })}
                </svg>
                <style>{`
                  .ap-chart-bar-g:hover .ap-chart-bar { fill-opacity: 1; }
                `}</style>
              </div>
            );
          })()}

          {/* ════ SETTINGS ════ */}
          {activeTab === 'settings' && (
            <>
              <div className="ap-group">
                <div className="ap-group-title">Registration & Access</div>
                <div className="ap-row">
                  <div className="ap-row-text">
                    <div className="ap-row-title">Open Registration</div>
                    <div className="ap-row-sub">Allow new users to sign up without an invite</div>
                  </div>
                  <button
                    className={`ap-toggle ${registrationOpen ? 'on' : ''}`}
                    onClick={handleToggleRegistration}
                    aria-label="Toggle registration"
                  >
                    <span className="ap-toggle-knob" />
                  </button>
                </div>
                <div className="ap-row" style={!emailSettings.enabled ? { opacity: 0.4, pointerEvents: 'none' } : {}}>
                  <div className="ap-row-text">
                    <div className="ap-row-title">Require email verification</div>
                    <div className="ap-row-sub">New users must verify their email address before using the app</div>
                  </div>
                  <button
                    className={`ap-toggle ${emailSettings.requireEmailVerification ? 'on' : ''}`}
                    onClick={() => handleEmailSettingToggle('requireEmailVerification')}
                    aria-label="Toggle email verification"
                  >
                    <span className="ap-toggle-knob" />
                  </button>
                </div>
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

              <div className="ap-group">
                <div className="ap-group-title">Email Notifications</div>
                {[
                  { key: 'enabled',           label: 'Email enabled',       sub: 'Master switch — disables all system emails when off' },
                  { key: 'loginNotification', label: 'Sign-in alerts',      sub: 'Send users an email when a new device signs in' },
                  { key: 'passwordChanged',   label: 'Password changes',    sub: 'Notify users when their password is changed' },
                  { key: 'securityAlerts',    label: 'Security alerts',     sub: 'Notify users for 2FA changes and account deletions' },
                ].map(({ key, label, sub }) => (
                  <div className="ap-row" key={key} style={ key !== 'enabled' && !emailSettings.enabled ? { opacity: 0.4, pointerEvents: 'none' } : {} }>
                    <div className="ap-row-text">
                      <div className="ap-row-title">{label}</div>
                      <div className="ap-row-sub">{sub}</div>
                    </div>
                    <button
                      className={`ap-toggle ${emailSettings[key] ? 'on' : ''}`}
                      onClick={() => handleEmailSettingToggle(key)}
                      aria-label={`Toggle ${label}`}
                    >
                      <span className="ap-toggle-knob" />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ════ USERS ════ */}
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

              <div className="ap-group">
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

          {/* ════ AUDIT LOG ════ */}
          {activeTab === 'logs' && (
            <div className="ap-group">
              {auditLoading ? (
                <div className="ap-empty">Loading…</div>
              ) : auditLogs.length === 0 ? (
                <div className="ap-empty">No activity yet</div>
              ) : auditLogs.map((log, idx) => (
                <div key={log._id}>
                  {idx > 0 && <div className="ap-sep" />}
                  <div className="ap-audit">
                    <span className={`ap-badge audit-${log.action.replace('.', '-')}`}>
                      {ACTION_LABELS[log.action] || log.action}
                    </span>
                    <span className="ap-audit-body">
                      <span className="ap-audit-who">
                        {log.performedByUsername}
                        {log.targetUsername && <span className="ap-audit-target"> → {log.targetUsername}</span>}
                        {log.action === 'invite.create' && log.metadata?.email && <span className="ap-audit-target"> → {log.metadata.email}</span>}
                        {log.action === 'settings.registration_toggle' && <span className="ap-audit-target"> {log.metadata?.registrationOpen ? 'opened' : 'closed'}</span>}
                      </span>
                      <span className="ap-audit-time">{formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>
      </div>{/* /ap-page */}

      {/* ── Bottom tab bar ── */}
      <div className="ap-tab-bar">
        {[
          { id: 'users', label: 'Users', icon: (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <circle cx="9" cy="7" r="3" stroke="currentColor" strokeWidth="1.8"/>
              <path d="M3 21v-2a5 5 0 015-5h4a5 5 0 015 5v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              <path d="M16 3.13a4 4 0 010 7.75M21 21v-2a4 4 0 00-3-3.85" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          )},
          { id: 'stats', label: 'Stats', icon: (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M18 20V10M12 20V4M6 20v-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )},
          { id: 'settings', label: 'Settings', icon: (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8"/>
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" strokeWidth="1.8"/>
            </svg>
          )},
          { id: 'logs', label: 'Logs', icon: (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              <rect x="9" y="3" width="6" height="4" rx="1" stroke="currentColor" strokeWidth="1.8"/>
              <path d="M9 12h6M9 16h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          )},
        ].map(({ id, label, icon }) => (
          <button
            key={id}
            className={`ap-tab ${activeTab === id ? 'active' : ''}`}
            onClick={() => setActiveTab(id)}
          >
            {icon}
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* ════════════════════════════════
          Modals / sheets
          ════════════════════════════════ */}

      {/* User action menu */}
      {menuUser && (
        <Sheet onClose={() => setMenuUser(null)}>
          <div className="ap-sheet-header">
            <span className="ap-sheet-title">{menuUser.displayName || menuUser.username}</span>
            <span className="ap-sheet-handle">@{menuUser.username}</span>
          </div>

          <div className="ap-user-detail">
            {menuUser.email && (
              <div className="ap-detail-row">
                <span className="ap-detail-label">Email</span>
                <span className="ap-detail-value">{menuUser.email}</span>
              </div>
            )}
            <div className="ap-detail-row">
              <span className="ap-detail-label">Joined</span>
              <span className="ap-detail-value">{new Date(menuUser.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</span>
            </div>
            <div className="ap-detail-row">
              <span className="ap-detail-label">Last seen</span>
              <span className="ap-detail-value">{menuUser.lastSeen ? formatDistanceToNow(new Date(menuUser.lastSeen), { addSuffix: true }) : 'Never'}</span>
            </div>
            <div className="ap-detail-row">
              <span className="ap-detail-label">2FA</span>
              <span className="ap-detail-value">{menuUser.twoFactorEnabled ? '✓ Enabled' : 'Disabled'}</span>
            </div>
            {menuUser.email && (
              <div className="ap-detail-row">
                <span className="ap-detail-label">Email</span>
                <span className={`ap-detail-value ${menuUser.emailVerified ? 'text-green' : ''}`} style={!menuUser.emailVerified ? { color: 'var(--text-3)' } : {}}>
                  {menuUser.emailVerified ? 'Verified ✓' : 'Unverified'}
                </span>
              </div>
            )}
            <div className="ap-detail-row">
              <span className="ap-detail-label">Status</span>
              <span className={`ap-detail-value ${menuUser.banned ? 'text-red' : 'text-green'}`}>{menuUser.banned ? 'Suspended' : 'Active'}</span>
            </div>
          </div>

          <div className="ap-actions-list">
            <button
              className={`ap-action-item ${menuUser.banned ? 'green' : 'orange'}`}
              onClick={() => handleBan(menuUser)}
            >
              <span className="ap-action-icon">{menuUser.banned ? <IconCheck /> : <IconBan />}</span>
              <span className="ap-action-label">{menuUser.banned ? 'Unsuspend user' : 'Suspend user'}</span>
            </button>
            {menuUser.email && menuUser.emailVerified !== true && (
              <button
                className="ap-action-item green"
                onClick={handleVerifyEmail}
              >
                <span className="ap-action-icon"><IconCheck /></span>
                <span className="ap-action-label">Verify email</span>
              </button>
            )}
            <button
              className="ap-action-item blue"
              onClick={() => { setMenuUser(null); setResetPwUser(menuUser); setNewPassword(''); }}
            >
              <span className="ap-action-icon"><IconKey /></span>
              <span className="ap-action-label">Reset password</span>
            </button>
            <button
              className="ap-action-item blue"
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
        /* Full-screen container — fixed so height is always exact viewport */
        .ap {
          position: fixed;
          top: env(safe-area-inset-top, 0px);
          left: env(safe-area-inset-left, 0px);
          right: env(safe-area-inset-right, 0px);
          bottom: 0;
          display: flex; flex-direction: column;
          background: var(--bg-1);
          z-index: 1;
        }

        /* Header — fixed height, never scrolls */
        .ap-header {
          flex-shrink: 0;
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
        .ap-admin-badge {
          display: flex; align-items: center; gap: 4px;
          background: var(--accent-dim); color: var(--accent);
          border: 1px solid rgba(108,99,255,0.25);
          border-radius: 20px; padding: 5px 10px 5px 8px;
          font-size: 12px; font-weight: 700; letter-spacing: 0.02em;
          flex-shrink: 0;
        }

        /* Scrollable page area — grows to fill between header and tab bar */
        .ap-page {
          flex: 1; min-height: 0;
          overflow-y: auto; -webkit-overflow-scrolling: touch;
        }
        .ap-inner {
          padding: 20px 16px 24px;
          display: flex; flex-direction: column; gap: 10px;
          max-width: 860px; margin: 0 auto; width: 100%;
          box-sizing: border-box;
        }

        .ap-tab-bar {
          flex-shrink: 0;
          display: flex;
          background: var(--bg-1);
          border-top: 1px solid var(--border);
          padding-bottom: var(--bsa);
        }
        .ap-tab {
          flex: 1; display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          gap: 4px; padding: 10px 4px;
          font-size: 11px; font-weight: 500; color: var(--text-3);
          transition: color var(--transition);
        }
        .ap-tab.active { color: var(--accent); }
        .ap-tab span { line-height: 1; }

        /* Stats grid */
        .ap-stat-grid {
          display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px;
        }
        @media(min-width:600px){.ap-stat-grid{grid-template-columns:repeat(3,1fr);}}
        @media(min-width:900px){.ap-stat-grid{grid-template-columns:repeat(4,1fr);}}
        .ap-stat-card {
          background: var(--bg-2); border: 1px solid var(--border);
          border-radius: 16px; padding: 14px;
          display: flex; flex-direction: column; gap: 10px;
        }
        .ap-sc-top {
          display: flex; align-items: flex-start; justify-content: space-between; gap: 6px;
        }
        .ap-sc-lbl {
          font-size: 11px; font-weight: 600; text-transform: uppercase;
          letter-spacing: 0.06em; color: var(--text-3); line-height: 1.3;
          flex: 1; min-width: 0;
        }
        .ap-sc-icon {
          width: 32px; height: 32px; border-radius: 8px;
          background: var(--scd); color: var(--sc);
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .ap-sc-val {
          font-size: 26px; font-weight: 700; color: var(--text-0);
          line-height: 1; letter-spacing: -0.01em;
        }

        /* Grouped card */
        .ap-group {
          background: var(--bg-2); border: 1px solid var(--border);
          border-radius: 14px; overflow: hidden;
        }
        .ap-group-title {
          font-size: 11px; font-weight: 600; color: var(--text-3);
          text-transform: uppercase; letter-spacing: 0.06em;
          padding: 12px 16px 4px;
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
        .ap-badge.audit-user-ban,.ap-badge.audit-user-delete,.ap-badge.audit-invite-revoke { background: var(--red-dim);         color: var(--red);    }
        .ap-badge.audit-user-unban,.ap-badge.audit-invite-create                          { background: var(--green-dim);       color: var(--green);  }
        .ap-badge.audit-user-password_reset,.ap-badge.audit-user-reset_2fa               { background: var(--accent-dim);      color: var(--accent); }
        .ap-badge.audit-settings-registration_toggle,.ap-badge.audit-settings-email_update { background: var(--bg-3);           color: var(--text-2); }

        /* Audit row */
        .ap-audit-body { display: flex; flex-direction: column; flex: 1; min-width: 0; gap: 2px; }
        .ap-audit {
          display: flex; align-items: center; gap: 10px;
          padding: 12px 16px;
        }
        .ap-audit-who { font-size: 13px; color: var(--text-1); font-weight: 500; }
        .ap-audit-target { color: var(--text-3); font-weight: 400; }
        .ap-audit-time { font-size: 11px; color: var(--text-3); white-space: nowrap; }

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
          padding-bottom: max(20px, var(--bsa));
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
        .ap-sheet-header { padding-bottom: 8px; border-bottom: 1px solid var(--border); }
        .ap-sheet-title  { font-size: 18px; font-weight: 700; color: var(--text-0); display: block; }
        .ap-sheet-handle { font-size: 13px; color: var(--text-3); display: block; margin-top: 2px; }
        .ap-sheet-sub    { font-size: 14px; color: var(--text-2); line-height: 1.55; }

        .ap-user-detail {
          background: var(--bg-3); border-radius: var(--radius); padding: 4px 0; margin: 4px 0;
        }
        .ap-detail-row {
          display: flex; justify-content: space-between; align-items: center;
          padding: 8px 14px; gap: 12px;
        }
        .ap-detail-row + .ap-detail-row { border-top: 1px solid var(--border); }
        .ap-detail-label { font-size: 13px; color: var(--text-3); flex-shrink: 0; }
        .ap-detail-value { font-size: 13px; color: var(--text-1); text-align: right; word-break: break-all; }
        .ap-detail-value.text-green { color: var(--green); }
        .ap-detail-value.text-red   { color: var(--red); }

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
        .ap-action-item.green  { background: var(--green-dim);      color: var(--green);  }
        .ap-action-item.orange { background: rgba(255,160,60,0.12); color: #f59e0b;       }
        .ap-action-item.blue   { background: var(--accent-dim);     color: var(--accent); }
        .ap-action-item.red    { background: var(--red-dim);        color: var(--red);    }
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
