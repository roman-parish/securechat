/**
 * SecureChat — End-to-End Encrypted Messaging
 * Copyright (c) 2026 Roman Parish
 * Licensed under the MIT License — see LICENSE file for details
 *
 * https://github.com/roman-parish/securechat
 */
import { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { apiFetch } from '../utils/api.js';
import { useChat } from '../contexts/ChatContext.jsx';
import Avatar from './Avatar.jsx';

export default function NewChatModal({ onClose }) {
  const [tab, setTab] = useState('direct'); // 'direct' | 'group'
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState([]);
  const [groupName, setGroupName] = useState('');
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const { addConversation, setActiveConversation } = useChat();

  // Lock body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const handleSearch = useCallback(async (q) => {
    setSearch(q);
    if (q.length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const data = await apiFetch(`/users/search?q=${encodeURIComponent(q)}`);
      setResults(data);
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  const handleSelect = (user) => {
    if (tab === 'direct') {
      setSelected([user]);
    } else {
      setSelected(prev =>
        prev.find(u => u._id === user._id)
          ? prev.filter(u => u._id !== user._id)
          : [...prev, user]
      );
    }
  };

  const handleCreate = async () => {
    if (selected.length === 0) return;
    if (tab === 'group' && !groupName.trim()) return;
    setCreating(true);
    try {
      let conv;
      if (tab === 'direct') {
        conv = await apiFetch('/conversations/direct', {
          method: 'POST',
          body: JSON.stringify({ userId: selected[0]._id }),
        });
      } else {
        const result = await apiFetch('/conversations/group', {
          method: 'POST',
          body: JSON.stringify({
            name: groupName.trim(),
            participantIds: selected.map(u => u._id),
          }),
        });
        conv = result.conversation;
        addConversation(conv);
        setActiveConversation(conv._id);
        onClose();
        return;
      }
      addConversation(conv);
      setActiveConversation(conv._id);
      onClose();
    } catch (err) {
      console.error('Failed to create conversation:', err);
    } finally {
      setCreating(false);
    }
  };

  const canCreate = selected.length > 0 && (tab === 'direct' || groupName.trim());

  return createPortal(
    <div className="nc-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="nc-sheet">

        {/* Header */}
        <div className="nc-header">
          <span className="nc-title">New Conversation</span>
          <button className="nc-close" onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="nc-tabs">
          <button
            className={`nc-tab ${tab === 'direct' ? 'active' : ''}`}
            onClick={() => { setTab('direct'); setSelected([]); }}
          >
            Direct Message
          </button>
          <button
            className={`nc-tab ${tab === 'group' ? 'active' : ''}`}
            onClick={() => { setTab('group'); setSelected([]); }}
          >
            Group Chat
          </button>
        </div>

        {/* Group name input */}
        {tab === 'group' && (
          <input
            className="nc-input"
            placeholder="Group name…"
            value={groupName}
            onChange={e => setGroupName(e.target.value)}
          />
        )}

        {/* Selected chips */}
        {selected.length > 0 && (
          <div className="nc-chips">
            {selected.map(u => (
              <button key={u._id} className="nc-chip" onClick={() => handleSelect(u)}>
                {u.displayName || u.username}
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            ))}
          </div>
        )}

        {/* Search */}
        <input
          className="nc-input"
          placeholder="Search users…"
          value={search}
          onChange={e => handleSearch(e.target.value)}
        />

        {/* Results */}
        <div className="nc-results">
          {loading && <div className="nc-empty">Searching…</div>}
          {!loading && search.length >= 2 && results.length === 0 && (
            <div className="nc-empty">No users found</div>
          )}
          {!loading && search.length < 2 && results.length === 0 && (
            <div className="nc-empty">Type at least 2 characters to search</div>
          )}
          {results.map(user => (
            <button
              key={user._id}
              className={`nc-user${selected.find(u => u._id === user._id) ? ' selected' : ''}`}
              onClick={() => handleSelect(user)}
            >
              <Avatar user={user} size={40} showOnline={user.isOnline} />
              <div className="nc-user-info">
                <span className="nc-user-name">{user.displayName || user.username}</span>
                <span className="nc-user-handle">@{user.username}</span>
              </div>
              {selected.find(u => u._id === user._id) && (
                <div className="nc-check">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                    <path d="M5 13l4 4L19 7" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              )}
            </button>
          ))}
        </div>

        {/* Action buttons */}
        <div className="nc-actions">
          <button className="nc-btn secondary" onClick={onClose}>Cancel</button>
          <button
            className="nc-btn accent"
            onClick={handleCreate}
            disabled={!canCreate || creating}
          >
            {creating
              ? 'Sending invites…'
              : tab === 'direct'
                ? 'Open Chat'
                : `Create & Invite${selected.length > 0 ? ` (${selected.length})` : ''}`
            }
          </button>
        </div>

      </div>

      <style>{`
        .nc-overlay {
          position: fixed; inset: 0; z-index: 200;
          background: rgba(0,0,0,0.7);
          display: flex; align-items: flex-end;
        }
        @media (min-width: 540px) {
          .nc-overlay { align-items: center; justify-content: center; padding: 24px; }
        }

        .nc-sheet {
          width: 100%;
          background: var(--bg-2); border: 1px solid var(--border);
          border-radius: 20px 20px 0 0;
          padding: 20px;
          padding-bottom: max(20px, var(--bsa));
          display: flex; flex-direction: column; gap: 12px;
          max-height: 92dvh;
          animation: ncUp 0.22s ease;
        }
        @media (min-width: 540px) {
          .nc-sheet {
            border-radius: 18px;
            max-width: 460px;
            max-height: 80dvh;
            padding-bottom: 20px;
          }
        }
        @keyframes ncUp {
          from { transform: translateY(20px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }

        /* Header */
        .nc-header {
          display: flex; align-items: center; justify-content: space-between;
          padding-bottom: 4px;
        }
        .nc-title { font-size: 18px; font-weight: 700; color: var(--text-0); }
        .nc-close {
          width: 36px; height: 36px;
          display: flex; align-items: center; justify-content: center;
          border-radius: 10px; color: var(--text-3);
          transition: all var(--transition);
        }
        .nc-close:active { background: var(--bg-3); color: var(--text-0); }
        @media(hover:hover){.nc-close:hover{background:var(--bg-3);color:var(--text-0);}}

        /* Tabs */
        .nc-tabs {
          display: flex;
          background: var(--bg-3); border-radius: 10px;
          padding: 3px; gap: 3px;
        }
        .nc-tab {
          flex: 1; padding: 8px; border-radius: 8px;
          font-size: 13px; font-weight: 500; color: var(--text-3);
          transition: all var(--transition);
        }
        .nc-tab.active {
          background: var(--bg-2); color: var(--text-0);
          box-shadow: 0 1px 4px rgba(0,0,0,0.15);
        }

        /* Input */
        .nc-input {
          width: 100%; background: var(--bg-3); border: 1.5px solid var(--border);
          border-radius: 12px; padding: 13px 16px;
          font-size: 16px; color: var(--text-0);
          transition: border-color var(--transition);
          box-sizing: border-box;
        }
        .nc-input:focus { border-color: var(--accent); outline: none; }
        .nc-input::placeholder { color: var(--text-3); }

        /* Selected chips */
        .nc-chips {
          display: flex; flex-wrap: wrap; gap: 6px;
        }
        .nc-chip {
          display: flex; align-items: center; gap: 5px;
          background: var(--accent-dim); color: var(--accent);
          border: 1px solid rgba(108,99,255,0.25);
          border-radius: 20px; padding: 5px 10px;
          font-size: 13px; font-weight: 500;
          transition: background var(--transition);
        }
        .nc-chip:active { background: rgba(108,99,255,0.25); }
        @media(hover:hover){.nc-chip:hover{background:rgba(108,99,255,0.25);}}

        /* Results list */
        .nc-results {
          flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch;
          min-height: 80px; max-height: 280px;
          margin: 0 -4px;
        }
        .nc-empty {
          padding: 24px 16px; text-align: center;
          font-size: 14px; color: var(--text-3);
        }
        .nc-user {
          display: flex; align-items: center; gap: 12px;
          padding: 10px 12px; border-radius: 12px; width: 100%;
          text-align: left; transition: background var(--transition);
        }
        .nc-user:active { background: var(--bg-3); }
        .nc-user.selected { background: var(--accent-dim); }
        @media(hover:hover){
          .nc-user:hover { background: var(--bg-3); }
          .nc-user.selected:hover { background: var(--accent-dim); filter: brightness(1.05); }
        }
        .nc-user-info { flex: 1; min-width: 0; }
        .nc-user-name {
          display: block; font-size: 14px; font-weight: 500; color: var(--text-0);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .nc-user-handle {
          display: block; font-size: 12px; color: var(--text-3); margin-top: 1px;
        }
        .nc-check {
          width: 24px; height: 24px; border-radius: 50%;
          background: var(--accent); flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
        }

        /* Action buttons */
        .nc-actions {
          display: flex; gap: 10px;
          padding-top: 4px;
        }
        .nc-btn {
          flex: 1; padding: 15px; border-radius: 12px;
          font-size: 16px; font-weight: 600;
          transition: all var(--transition);
        }
        .nc-btn.secondary { background: var(--bg-3); color: var(--text-1); }
        .nc-btn.secondary:active { background: var(--bg-4); }
        @media(hover:hover){.nc-btn.secondary:hover{background:var(--bg-4);}}
        .nc-btn.accent { background: var(--accent); color: white; }
        .nc-btn.accent:active { opacity: 0.85; }
        .nc-btn.accent:disabled { opacity: 0.4; cursor: default; }
        @media(hover:hover){.nc-btn.accent:not(:disabled):hover{opacity:0.88;}}
      `}</style>
    </div>,
    document.body
  );
}
