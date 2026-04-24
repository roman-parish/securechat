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

  useEffect(() => {
    loadStats();
    loadUsers();
  }, [loadStats, loadUsers]);

  useEffect(() => {
    const timer = setTimeout(() => loadUsers(search), 300);
    return () => clearTimeout(timer);
  }, [search, loadUsers]);

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
        <div style={{ width: 120 }} />
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
            <span className="hide-mobile">Email</span>
            <span className="hide-mobile">Joined</span>
            <span className="hide-mobile">Last Seen</span>
            <span>Status</span>
            <span>Actions</span>
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
                <span className="hide-mobile email">{u.email}</span>
                <span className="hide-mobile date">
                  {u.createdAt ? formatDistanceToNow(new Date(u.createdAt), { addSuffix: true }) : '—'}
                </span>
                <span className="hide-mobile date">
                  {u.lastSeen ? formatDistanceToNow(new Date(u.lastSeen), { addSuffix: true }) : '—'}
                </span>
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
            ))
          )}
        </div>
      </div>

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
              style={{
                width: '100%', background: 'var(--bg-3)',
                border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                padding: '10px 12px', fontSize: '14px', color: 'var(--text-0)',
              }}
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
        .admin-page {
          display: flex; flex-direction: column;
          height: 100%; background: var(--bg-0); overflow: hidden;
        }
        .admin-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 24px; border-bottom: 1px solid var(--border);
          background: var(--bg-1); flex-shrink: 0;
        }
        .back-btn {
          display: flex; align-items: center; gap: 8px;
          font-size: 14px; color: var(--text-2); padding: 8px 12px;
          border-radius: var(--radius); transition: all var(--transition);
        }
        .back-btn:hover { background: var(--bg-3); color: var(--text-0); }
        .admin-title {
          display: flex; align-items: center; gap: 8px;
          font-size: 16px; font-weight: 600; color: var(--text-0);
        }
        .admin-content {
          flex: 1; overflow-y: auto; padding: 24px;
          display: flex; flex-direction: column; gap: 20px;
        }
        .stats-row {
          display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px;
        }
        @media (max-width: 900px) { .stats-row { grid-template-columns: repeat(3, 1fr); } }
        @media (max-width: 600px) { .stats-row { grid-template-columns: repeat(2, 1fr); } }
        .stat-card {
          background: var(--bg-2); border: 1px solid var(--border);
          border-radius: var(--radius); padding: 16px;
          display: flex; flex-direction: column; gap: 4px;
        }
        .stat-value { font-size: 28px; font-weight: 700; color: var(--text-0); }
        .stat-label { font-size: 12px; color: var(--text-3); }
        .search-bar {
          display: flex; align-items: center; gap: 10px;
          background: var(--bg-2); border: 1px solid var(--border);
          border-radius: var(--radius); padding: 10px 14px;
        }
        .search-bar input {
          flex: 1; background: none; border: none;
          font-size: 14px; color: var(--text-0);
        }
        .search-bar input::placeholder { color: var(--text-3); }
        .user-count { font-size: 12px; color: var(--text-3); flex-shrink: 0; }
        .action-msg {
          background: var(--accent-dim); border: 1px solid var(--accent);
          border-radius: var(--radius); padding: 10px 14px;
          font-size: 13px; color: var(--accent);
        }
        .user-table {
          background: var(--bg-2); border: 1px solid var(--border);
          border-radius: var(--radius); overflow: hidden;
        }
        .table-header {
          display: grid;
          grid-template-columns: 2fr 2fr 1fr 1fr 1fr 1.5fr;
          padding: 10px 16px; background: var(--bg-3);
          border-bottom: 1px solid var(--border);
          font-size: 11px; font-weight: 600; color: var(--text-3);
          text-transform: uppercase; letter-spacing: 0.05em;
        }
        @media (max-width: 768px) {
          .table-header { grid-template-columns: 2fr 1fr 1.5fr; }
          .hide-mobile { display: none; }
        }
        .table-loading {
          padding: 32px; text-align: center;
          color: var(--text-3); font-size: 14px;
        }
        .table-row {
          display: grid;
          grid-template-columns: 2fr 2fr 1fr 1fr 1fr 1.5fr;
          padding: 12px 16px; align-items: center;
          border-bottom: 1px solid var(--border);
          transition: background var(--transition);
        }
        .table-row:last-child { border-bottom: none; }
        .table-row:hover { background: var(--bg-3); }
        .table-row.banned { opacity: 0.6; }
        @media (max-width: 768px) {
          .table-row { grid-template-columns: 2fr 1fr 1.5fr; }
        }
        .user-cell { display: flex; align-items: center; gap: 10px; }
        .avatar-online-wrap { position: relative; flex-shrink: 0; }
        .online-dot {
          position: absolute; bottom: 1px; right: 1px;
          width: 9px; height: 9px; border-radius: 50%;
          background: var(--green); border: 2px solid var(--bg-2);
        }
        .username { display: block; font-size: 14px; font-weight: 500; color: var(--text-0); }
        .handle { display: block; font-size: 12px; color: var(--text-3); }
        .email { font-size: 13px; color: var(--text-2); }
        .date { font-size: 12px; color: var(--text-3); }
        .status-badge {
          display: inline-flex; align-items: center;
          padding: 3px 8px; border-radius: var(--radius-full);
          font-size: 11px; font-weight: 600; width: fit-content;
        }
        .status-badge.active { background: rgba(61,214,140,0.1); color: var(--green); }
        .status-badge.banned { background: var(--red-dim); color: var(--red); }
        .actions { display: flex; align-items: center; gap: 6px; }
        .action-btn {
          width: 30px; height: 30px;
          display: flex; align-items: center; justify-content: center;
          border-radius: var(--radius-sm); transition: all var(--transition);
          font-size: 15px;
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
        .confirm-overlay {
          position: fixed; inset: 0; z-index: 200;
          background: rgba(0,0,0,0.7);
          display: flex; align-items: center; justify-content: center;
          padding: 24px;
        }
        .confirm-modal {
          background: var(--bg-2); border: 1px solid var(--border);
          border-radius: var(--radius-xl); padding: 28px;
          max-width: 360px; width: 100%;
          display: flex; flex-direction: column; gap: 12px;
        }
        .confirm-modal h3 { font-size: 16px; font-weight: 600; color: var(--text-0); }
        .confirm-modal p { font-size: 14px; color: var(--text-2); line-height: 1.6; }
        .confirm-actions { display: flex; gap: 10px; margin-top: 4px; }
        .cancel-btn {
          flex: 1; padding: 10px; border-radius: var(--radius);
          background: var(--bg-3); color: var(--text-1);
          font-size: 14px; font-weight: 500;
          transition: all var(--transition);
        }
        .cancel-btn:hover { background: var(--bg-4); }
        .confirm-delete-btn {
          flex: 1; padding: 10px; border-radius: var(--radius);
          background: var(--red); color: white;
          font-size: 14px; font-weight: 500;
          transition: all var(--transition);
        }
        .confirm-delete-btn:hover { opacity: 0.85; }
      `}</style>
    </div>
  );
}
