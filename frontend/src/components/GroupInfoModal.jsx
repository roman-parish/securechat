/**
 * SecureChat — End-to-End Encrypted Messaging
 * Copyright (c) 2026 Roman Parish
 * Licensed under the MIT License — see LICENSE file for details
 *
 * https://github.com/roman-parish/securechat
 */
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { apiFetch } from '../utils/api.js';
import Avatar from './Avatar.jsx';

export default function GroupInfoModal({ conversation, onClose, onUpdated }) {
  const { user } = useAuth();
  const [name, setName] = useState(conversation.name || '');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [inviteSearch, setInviteSearch] = useState('');
  const [inviteResults, setInviteResults] = useState([]);
  const [inviteSearching, setInviteSearching] = useState(false);
  const [pendingInvites, setPendingInvites] = useState([]);

  const handleInviteSearch = useCallback(async (q) => {
    setInviteSearch(q);
    if (q.length < 2) { setInviteResults([]); return; }
    setInviteSearching(true);
    try {
      const data = await apiFetch(`/users/search?q=${encodeURIComponent(q)}`);
      // Filter out existing participants
      const participantIds = new Set(conversation.participants?.map(p => String(p._id)));
      setInviteResults((data || []).filter(u => !participantIds.has(String(u._id))));
    } catch {} finally {
      setInviteSearching(false);
    }
  }, [conversation.participants]);

  const handleInvite = async (userId) => {
    try {
      await apiFetch(`/conversations/${conversation._id}/invite`, {
        method: 'POST',
        body: JSON.stringify({ userId }),
      });
      setMsg('Invitation sent!');
      setInviteSearch('');
      setInviteResults([]);
      loadPendingInvites();
      setTimeout(() => setMsg(''), 2000);
    } catch (err) {
      setMsg(err.message || 'Failed to send invitation');
      setTimeout(() => setMsg(''), 3000);
    }
  };

  const loadPendingInvites = useCallback(async () => {
    try {
      const data = await apiFetch(`/conversations/${conversation._id}/invitations`);
      setPendingInvites(data || []);
    } catch {}
  }, [conversation._id]);

  useEffect(() => { loadPendingInvites(); }, [loadPendingInvites]);

  const myId = String(user._id);
  const isAdmin = conversation.admins?.some(a => String(a) === myId || String(a._id) === myId);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const updated = await apiFetch(`/conversations/${conversation._id}`, {
        method: 'PUT',
        body: JSON.stringify({ name }),
      });
      setMsg('Saved!');
      onUpdated?.(updated);
      setTimeout(() => setMsg(''), 2000);
    } catch {
      setMsg('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (userId) => {
    if (!confirm('Remove this member?')) return;
    try {
      await apiFetch(`/conversations/${conversation._id}/participants/${userId}`, { method: 'DELETE' });
      onUpdated?.({
        ...conversation,
        participants: conversation.participants.filter(p => String(p._id) !== String(userId)),
      });
    } catch {
      setMsg('Failed to remove');
    }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <div className="modal-header">
          <span>Group Info</span>
          <button className="close-btn" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div className="modal-body">
          {/* Group name */}
          <label className="field-label">Group name</label>
          <div className="field-row">
            <input
              className="text-input"
              value={name}
              onChange={e => setName(e.target.value)}
              disabled={!isAdmin}
              placeholder="Group name"
            />
            {isAdmin && (
              <button className="save-btn" onClick={handleSave} disabled={saving || !name.trim()}>
                {saving ? '…' : 'Save'}
              </button>
            )}
          </div>
          {msg && <p className="msg-text">{msg}</p>}

          {/* Members */}
          <label className="field-label" style={{ marginTop: 20 }}>
            Members · {conversation.participants?.length}
          </label>
          <div className="member-list">
            {conversation.participants?.map(p => {
              const pid = String(p._id);
              const isMe = pid === myId;
              const memberIsAdmin = conversation.admins?.some(a => String(a) === pid || String(a._id) === pid);
              return (
                <div key={pid} className="member-row">
                  <Avatar user={p} size={36} />
                  <div className="member-info">
                    <span className="member-name">{p.displayName || p.username}</span>
                    <span className="member-sub">@{p.username}{memberIsAdmin ? ' · admin' : ''}</span>
                  </div>
                  {isAdmin && !isMe && (
                    <button className="remove-btn" onClick={() => handleRemove(pid)}>Remove</button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Invite section — admins only */}
          {isAdmin && (
            <>
              <label className="field-label" style={{ marginTop: 20 }}>Invite member</label>
              <input
                className="text-input"
                placeholder="Search users…"
                value={inviteSearch}
                onChange={e => handleInviteSearch(e.target.value)}
              />
              {inviteSearching && <p className="msg-text" style={{ color: 'var(--text-3)' }}>Searching…</p>}
              {inviteResults.length > 0 && (
                <div className="invite-results">
                  {inviteResults.map(u => (
                    <div key={u._id} className="invite-result-row">
                      <Avatar user={u} size={30} />
                      <div className="member-info">
                        <span className="member-name">{u.displayName || u.username}</span>
                        <span className="member-sub">@{u.username}</span>
                      </div>
                      <button className="invite-btn" onClick={() => handleInvite(u._id)}>Invite</button>
                    </div>
                  ))}
                </div>
              )}
              {msg && <p className="msg-text" style={{ color: msg.includes('sent') ? 'var(--green)' : 'var(--red)' }}>{msg}</p>}

              {pendingInvites.length > 0 && (
                <>
                  <label className="field-label" style={{ marginTop: 16 }}>Pending invitations · {pendingInvites.length}</label>
                  <div className="member-list">
                    {pendingInvites.map(inv => (
                      <div key={inv._id} className="member-row">
                        <Avatar user={inv.invitee} size={36} />
                        <div className="member-info">
                          <span className="member-name">{inv.invitee?.displayName || inv.invitee?.username}</span>
                          <span className="member-sub">@{inv.invitee?.username} · invited by {inv.invitedBy?.displayName || inv.invitedBy?.username}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      <style>{`
        .modal-overlay {
          position: fixed; inset: 0; z-index: 100;
          background: rgba(0,0,0,0.6); display: flex;
          align-items: center; justify-content: center;
          padding: 20px;
        }
        .modal-box {
          background: var(--bg-2); border: 1px solid var(--border-strong);
          border-radius: var(--radius-xl); width: 100%; max-width: 420px;
          box-shadow: var(--shadow-lg); animation: slideUp 0.2s ease;
          max-height: 80vh; display: flex; flex-direction: column;
        }
        .modal-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 18px 20px 14px; border-bottom: 1px solid var(--border);
          font-weight: 600; font-size: 15px; flex-shrink: 0;
        }
        .close-btn {
          width: 30px; height: 30px; border-radius: var(--radius-sm);
          display: flex; align-items: center; justify-content: center;
          color: var(--text-2);
        }
        .close-btn:hover { background: var(--bg-4); color: var(--text-0); }
        .modal-body { padding: 18px 20px; overflow-y: auto; }
        .field-label { display: block; font-size: 12px; color: var(--text-3); font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }
        .field-row { display: flex; gap: 8px; }
        .text-input {
          flex: 1; background: var(--bg-3); border: 1px solid var(--border);
          border-radius: var(--radius); padding: 9px 12px;
          font-size: 14px; color: var(--text-0); transition: border-color var(--transition);
        }
        .text-input:focus { border-color: var(--accent); outline: none; }
        .text-input:disabled { opacity: 0.5; }
        .save-btn {
          padding: 9px 16px; background: var(--accent); color: white;
          border-radius: var(--radius); font-size: 13px; font-weight: 500;
          transition: all var(--transition);
        }
        .save-btn:hover:not(:disabled) { filter: brightness(1.15); }
        .save-btn:disabled { opacity: 0.5; }
        .msg-text { font-size: 13px; color: var(--green); margin-top: 6px; }
        .member-list { display: flex; flex-direction: column; gap: 2px; }
        .member-row {
          display: flex; align-items: center; gap: 10px;
          padding: 8px; border-radius: var(--radius);
          transition: background var(--transition);
        }
        .member-row:hover { background: var(--bg-3); }
        .member-info { flex: 1; min-width: 0; }
        .member-name { display: block; font-size: 14px; font-weight: 500; }
        .member-sub { display: block; font-size: 12px; color: var(--text-3); }
        .remove-btn {
          padding: 5px 10px; border-radius: var(--radius-sm);
          font-size: 12px; color: var(--red);
          background: var(--red-dim); transition: all var(--transition);
        }
        .remove-btn:hover { filter: brightness(1.2); }
        .invite-results {
          margin-top: 6px; border: 1px solid var(--border);
          border-radius: var(--radius); overflow: hidden;
        }
        .invite-result-row {
          display: flex; align-items: center; gap: 10px;
          padding: 8px 10px; transition: background var(--transition);
        }
        .invite-result-row:hover { background: var(--bg-3); }
        .invite-btn {
          padding: 4px 12px; border-radius: var(--radius-sm);
          font-size: 12px; font-weight: 500;
          background: var(--accent-dim); color: var(--accent);
          transition: all var(--transition); flex-shrink: 0;
        }
        .invite-btn:hover { background: var(--accent); color: white; }
      `}</style>
    </div>
  );
}
