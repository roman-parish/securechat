/**
 * SecureChat — End-to-End Encrypted Messaging
 * Copyright (c) 2026 Roman Parish
 * Licensed under the MIT License — see LICENSE file for details
 *
 * https://github.com/roman-parish/securechat
 */
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useChat } from '../contexts/ChatContext.jsx';
import { apiFetch } from '../utils/api.js';
import Avatar from './Avatar.jsx';

export default function GroupInfoModal({ conversation, onClose, onUpdated, onDeleted }) {
  const { user } = useAuth();
  const { onlineUsers } = useChat();
  const [name, setName] = useState(conversation.name || '');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [inviteSearch, setInviteSearch] = useState('');
  const [inviteResults, setInviteResults] = useState([]);
  const [inviteSearching, setInviteSearching] = useState(false);
  const [pendingInvites, setPendingInvites] = useState([]);
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [selectedMember, setSelectedMember] = useState(null); // member action sheet
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [disappearing, setDisappearing] = useState(conversation.disappearingMessages ?? 0);

  const handleInviteSearch = useCallback(async (q) => {
    setInviteSearch(q);
    if (q.length < 2) { setInviteResults([]); return; }
    setInviteSearching(true);
    try {
      const data = await apiFetch(`/users/search?q=${encodeURIComponent(q)}`);
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

  const handleRemoveConfirmed = async () => {
    const pid = String(confirmRemove._id);
    setConfirmRemove(null);
    try {
      await apiFetch(`/conversations/${conversation._id}/participants/${pid}`, { method: 'DELETE' });
      onUpdated?.({
        ...conversation,
        participants: conversation.participants.filter(p => String(p._id) !== pid),
      });
    } catch {
      setMsg('Failed to remove member');
    }
  };

  const handleToggleAdmin = async (p) => {
    const pid = String(p._id);
    const memberIsAdmin = conversation.admins?.some(a => String(a) === pid || String(a._id) === pid);
    try {
      const updated = await apiFetch(
        `/conversations/${conversation._id}/admins/${pid}`,
        { method: memberIsAdmin ? 'DELETE' : 'PUT' }
      );
      onUpdated?.(updated);
      setMsg(memberIsAdmin ? `${p.displayName || p.username} is no longer an admin` : `${p.displayName || p.username} is now an admin`);
      setTimeout(() => setMsg(''), 2500);
    } catch (err) {
      setMsg(err.message || 'Failed to update admin status');
      setTimeout(() => setMsg(''), 3000);
    }
  };

  const handleDeleteGroup = async () => {
    setDeleting(true);
    try {
      await apiFetch(`/conversations/${conversation._id}/dissolve`, { method: 'DELETE' });
      onDeleted?.();
    } catch (err) {
      setMsg(err.message || 'Failed to delete group');
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="gi-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="gi-modal">
        <div className="gi-header">
          <span>Group Settings</span>
          <button className="gi-close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div className="gi-body">
          {/* Group name */}
          <div className="field">
            <label>Group name</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                disabled={!isAdmin}
                placeholder="Group name"
                onKeyDown={e => e.key === 'Enter' && handleSave()}
              />
              {isAdmin && (
                <button className="primary-btn" onClick={handleSave} disabled={saving || !name.trim()} style={{ flexShrink: 0, padding: '0 18px' }}>
                  {saving ? '…' : 'Save'}
                </button>
              )}
            </div>
          </div>
          {msg && <p style={{ fontSize: 13, marginTop: 6, color: msg.toLowerCase().includes('fail') || msg.toLowerCase().includes('error') ? 'var(--red)' : 'var(--green)' }}>{msg}</p>}

          {/* Disappearing messages */}
          {isAdmin && (
            <div style={{ marginTop: 16 }}>
              <p className="section-label">Disappearing Messages</p>
              <select
                className="field input"
                style={{ marginTop: 6, padding: '9px 12px', borderRadius: 'var(--radius)', background: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text-0)', fontSize: 14, width: '100%' }}
                value={disappearing}
                onChange={async e => {
                  const val = Number(e.target.value);
                  setDisappearing(val);
                  try {
                    await apiFetch(`/conversations/${conversation._id}/disappearing`, {
                      method: 'PUT',
                      body: JSON.stringify({ duration: val }),
                    });
                    setMsg(val === 0 ? 'Disappearing messages off' : 'Disappearing messages updated');
                    setTimeout(() => setMsg(''), 2000);
                  } catch {
                    setMsg('Failed to update');
                    setTimeout(() => setMsg(''), 2000);
                  }
                }}
              >
                <option value={0}>Off</option>
                <option value={3600}>1 hour</option>
                <option value={86400}>24 hours</option>
                <option value={604800}>7 days</option>
                <option value={2592000}>30 days</option>
              </select>
            </div>
          )}

          {/* Members */}
          <p className="section-label" style={{ marginTop: 20 }}>Members · {conversation.participants?.length}</p>
          <div className="gi-member-list">
            {conversation.participants?.map(p => {
              const pid = String(p._id);
              const isMe = pid === myId;
              const memberIsAdmin = conversation.admins?.some(a => String(a) === pid || String(a._id) === pid);
              return (
                <div
                  key={pid}
                  className={`gi-member-row ${isAdmin && !isMe ? 'tappable' : ''}`}
                  onClick={() => isAdmin && !isMe && setSelectedMember(p)}
                >
                  <Avatar user={p} size={36} showOnline={onlineUsers.has(String(p._id))} />
                  <div className="gi-member-info">
                    <span className="gi-member-name">{p.displayName || p.username}</span>
                    <span className="gi-member-sub">@{p.username}{isMe ? ' · You' : ''}</span>
                  </div>
                  {memberIsAdmin && (
                    <span className="gi-admin-badge">Admin</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Invite section — admins only */}
          {isAdmin && (
            <>
              <p className="section-label" style={{ marginTop: 20 }}>Invite member</p>
              <div className="field">
                <input
                  placeholder="Search by name or username…"
                  value={inviteSearch}
                  onChange={e => handleInviteSearch(e.target.value)}
                />
              </div>
              {inviteSearching && <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 6 }}>Searching…</p>}
              {inviteResults.length > 0 && (
                <div className="gi-invite-results">
                  {inviteResults.map(u => (
                    <div key={u._id} className="gi-member-row">
                      <Avatar user={u} size={32} />
                      <div className="gi-member-info">
                        <span className="gi-member-name">{u.displayName || u.username}</span>
                        <span className="gi-member-sub">@{u.username}</span>
                      </div>
                      <button className="primary-btn" style={{ fontSize: 12, padding: '4px 14px' }} onClick={() => handleInvite(u._id)}>Invite</button>
                    </div>
                  ))}
                </div>
              )}

              {pendingInvites.length > 0 && (
                <>
                  <p className="section-label" style={{ marginTop: 16 }}>Pending invitations · {pendingInvites.length}</p>
                  <div className="gi-member-list">
                    {pendingInvites.map(inv => (
                      <div key={inv._id} className="gi-member-row">
                        <Avatar user={inv.invitee} size={32} />
                        <div className="gi-member-info">
                          <span className="gi-member-name">{inv.invitee?.displayName || inv.invitee?.username}</span>
                          <span className="gi-member-sub">@{inv.invitee?.username} · invited by {inv.invitedBy?.displayName || inv.invitedBy?.username}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Delete group */}
              <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                <p className="section-label">Danger zone</p>
                <button className="danger-btn" style={{ width: '100%', justifyContent: 'center', display: 'flex', gap: 8, alignItems: 'center' }} onClick={() => setConfirmDelete(true)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <polyline points="3 6 5 6 21 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    <path d="M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    <path d="M9 6V4h6v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  Delete Group
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Member action sheet */}
      {selectedMember && (() => {
        const pid = String(selectedMember._id);
        const memberIsAdmin = conversation.admins?.some(a => String(a) === pid || String(a._id) === pid);
        const isLastAdmin = memberIsAdmin && conversation.admins?.length === 1;
        return (
          <div className="cp-overlay" onClick={() => setSelectedMember(null)}>
            <div className="cp-modal" onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 20px 16px', gap: 8, borderBottom: '1px solid var(--border)' }}>
                <Avatar user={selectedMember} size={56} />
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-0)' }}>{selectedMember.displayName || selectedMember.username}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 2 }}>@{selectedMember.username}</div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 12 }}>
                {!isLastAdmin && (
                  <button
                    className={`gi-action-item ${memberIsAdmin ? 'orange' : 'blue'}`}
                    onClick={() => { setSelectedMember(null); handleToggleAdmin(selectedMember); }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M12 3L4 7v6c0 4.4 3.4 8.5 8 9.5C16.6 21.5 20 17.4 20 13V7l-8-4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                      <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    {memberIsAdmin ? 'Remove admin role' : 'Make admin'}
                  </button>
                )}
                <button
                  className="gi-action-item red"
                  onClick={() => { setSelectedMember(null); setConfirmRemove(selectedMember); }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M23 11l-6 6M17 11l6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  Remove from group
                </button>
                <button className="cancel-btn" style={{ marginTop: 4, textAlign: 'center' }} onClick={() => setSelectedMember(null)}>Cancel</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Remove member confirmation */}
      {confirmRemove && (
        <div className="cp-overlay" onClick={() => setConfirmRemove(null)}>
          <div className="cp-modal" onClick={e => e.stopPropagation()}>
            <div className="cp-header">
              <h3>Remove member</h3>
              <button className="gi-close" onClick={() => setConfirmRemove(null)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
            <div className="change-password-form">
              <p className="cp-note">Remove <strong>{confirmRemove.displayName || confirmRemove.username}</strong> from this group? They can be re-invited later.</p>
              <div className="cp-actions">
                <button className="cancel-btn" onClick={() => setConfirmRemove(null)}>Cancel</button>
                <button className="danger-btn" onClick={handleRemoveConfirmed}>Remove</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete group confirmation */}
      {confirmDelete && (
        <div className="cp-overlay" onClick={() => setConfirmDelete(false)}>
          <div className="cp-modal" onClick={e => e.stopPropagation()}>
            <div className="cp-header">
              <h3>Delete group</h3>
              <button className="gi-close" onClick={() => setConfirmDelete(false)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
            <div className="change-password-form">
              <p className="cp-note">Permanently delete <strong>{conversation.name}</strong>? All messages will be removed for every member. This cannot be undone.</p>
              <div className="cp-actions">
                <button className="cancel-btn" onClick={() => setConfirmDelete(false)}>Cancel</button>
                <button className="danger-btn" onClick={handleDeleteGroup} disabled={deleting}>
                  {deleting ? 'Deleting…' : 'Delete group'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .gi-overlay {
          position: fixed; inset: 0; z-index: 100;
          background: rgba(0,0,0,0.6); display: flex;
          align-items: center; justify-content: center;
          padding: 20px;
        }
        .gi-modal {
          background: var(--bg-2); border: 1px solid var(--border-strong);
          border-radius: var(--radius-xl); width: 100%; max-width: 420px;
          box-shadow: var(--shadow-lg); animation: slideUp 0.2s ease;
          max-height: 85vh; display: flex; flex-direction: column;
        }
        .gi-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 18px 20px 14px; border-bottom: 1px solid var(--border);
          font-weight: 600; font-size: 15px; flex-shrink: 0;
          color: var(--text-0);
        }
        .gi-close {
          width: 30px; height: 30px; border-radius: var(--radius-sm);
          display: flex; align-items: center; justify-content: center;
          color: var(--text-2); transition: background var(--transition);
        }
        .gi-close:hover { background: var(--bg-4); color: var(--text-0); }
        .gi-body { padding: 20px; overflow-y: auto; display: flex; flex-direction: column; }
        .gi-member-list { display: flex; flex-direction: column; gap: 2px; margin-top: 6px; }
        .gi-member-row {
          display: flex; align-items: center; gap: 10px;
          padding: 8px; border-radius: var(--radius);
          transition: background var(--transition);
        }
        .gi-member-row.tappable { cursor: pointer; }
        .gi-member-row.tappable:hover { background: var(--bg-3); }
        .gi-member-row.tappable:active { background: var(--bg-4); }
        .gi-admin-badge {
          font-size: 11px; font-weight: 600; color: var(--accent);
          background: var(--accent-dim); padding: 2px 8px;
          border-radius: 20px; flex-shrink: 0;
        }
        .gi-action-item {
          display: flex; align-items: center; gap: 12px;
          padding: 13px 14px; border-radius: 10px;
          font-size: 15px; font-weight: 500;
          transition: filter var(--transition); cursor: pointer;
        }
        .gi-action-item:active { filter: brightness(1.1); }
        .gi-action-item.blue { background: var(--accent-dim); color: var(--accent); }
        .gi-action-item.orange { background: rgba(255,160,60,0.12); color: #f59e0b; }
        .gi-action-item.red { background: var(--red-dim); color: var(--red); }
        .gi-member-info { flex: 1; min-width: 0; }
        .gi-member-name { display: block; font-size: 14px; font-weight: 500; color: var(--text-0); }
        .gi-member-sub { display: block; font-size: 12px; color: var(--text-3); }
        .gi-invite-results {
          margin-top: 6px; border: 1px solid var(--border);
          border-radius: var(--radius); overflow: hidden;
        }
        .gi-invite-results .gi-member-row { border-radius: 0; padding: 8px 10px; }

        /* Reuse ProfileModal patterns */
        .field { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; }
        .field label { font-size: 13px; color: var(--text-2); font-weight: 500; }
        .field input {
          background: var(--bg-3); border: 1px solid var(--border);
          border-radius: var(--radius); padding: 9px 12px;
          font-size: 14px; color: var(--text-0); width: 100%;
          transition: border-color var(--transition); font-family: var(--font-sans);
        }
        .field input:focus { border-color: var(--accent); outline: none; }
        .field input:disabled { opacity: 0.5; }
        .section-label { font-size: 11px; font-weight: 600; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 6px; }
        .primary-btn { background: var(--accent); color: white; border-radius: var(--radius); padding: 9px 18px; font-size: 13px; font-weight: 500; transition: all var(--transition); }
        .primary-btn:hover:not(:disabled) { background: #8b84ff; }
        .primary-btn:disabled { opacity: 0.5; }
        .cancel-btn { background: var(--bg-3); color: var(--text-1); border-radius: var(--radius); padding: 9px 18px; font-size: 13px; font-weight: 500; transition: background var(--transition); }
        .cancel-btn:hover { background: var(--bg-4); }
        .danger-btn { background: transparent; border: 1px solid var(--red); color: var(--red); border-radius: var(--radius); padding: 8px 14px; font-size: 13px; font-weight: 500; cursor: pointer; transition: background var(--transition); }
        .danger-btn:hover { background: var(--red-dim); }
        .danger-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        /* Confirmation dialogs — matches ProfileModal cp-* pattern */
        .cp-overlay { position: fixed; inset: 0; z-index: 200; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; padding: 20px; }
        .cp-modal { background: var(--bg-2); border: 1px solid var(--border-strong); border-radius: var(--radius-xl); width: 100%; max-width: 380px; box-shadow: var(--shadow-lg); animation: slideUp 0.15s ease; }
        .cp-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px 12px; border-bottom: 1px solid var(--border); }
        .cp-header h3 { font-size: 15px; font-weight: 600; color: var(--text-0); }
        .change-password-form { padding: 16px 20px 20px; display: flex; flex-direction: column; gap: 14px; }
        .cp-note { font-size: 13px; color: var(--text-2); line-height: 1.5; }
        .cp-note strong { color: var(--text-0); }
        .cp-actions { display: flex; gap: 8px; justify-content: flex-end; }
      `}</style>
    </div>
  );
}
