/**
 * SecureChat — End-to-End Encrypted Messaging
 * Copyright (c) 2026 Roman Parish
 * Licensed under the MIT License — see LICENSE file for details
 *
 * https://github.com/roman-parish/securechat
 */
import { useState, useCallback } from 'react';
import { apiFetch } from '../utils/api.js';
import { useChat } from '../contexts/ChatContext.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
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
    setCreating(true);
    try {
      let conv;
      if (tab === 'direct') {
        conv = await apiFetch('/conversations/direct', {
          method: 'POST',
          body: JSON.stringify({ userId: selected[0]._id }),
        });
      } else {
        if (!groupName.trim()) return;
        conv = await apiFetch('/conversations/group', {
          method: 'POST',
          body: JSON.stringify({
            name: groupName.trim(),
            participantIds: selected.map(u => u._id),
          }),
        });
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

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2>New Conversation</h2>
          <button className="close-btn" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div className="tab-row">
          <button className={tab === 'direct' ? 'active' : ''} onClick={() => { setTab('direct'); setSelected([]); }}>
            Direct Message
          </button>
          <button className={tab === 'group' ? 'active' : ''} onClick={() => { setTab('group'); setSelected([]); }}>
            Group Chat
          </button>
        </div>

        {tab === 'group' && (
          <div className="group-name-field">
            <input
              placeholder="Group name..."
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
            />
          </div>
        )}

        {selected.length > 0 && (
          <div className="selected-chips">
            {selected.map(u => (
              <span key={u._id} className="chip" onClick={() => handleSelect(u)}>
                {u.displayName || u.username}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </span>
            ))}
          </div>
        )}

        <div className="search-area">
          <input
            placeholder="Search users..."
            value={search}
            onChange={e => handleSearch(e.target.value)}
          />
        </div>

        <div className="user-results">
          {loading && <div className="result-loading">Searching…</div>}
          {!loading && search.length >= 2 && results.length === 0 && (
            <div className="result-empty">No users found</div>
          )}
          {results.map(user => (
            <div
              key={user._id}
              className={`user-row ${selected.find(u => u._id === user._id) ? 'selected' : ''}`}
              onClick={() => handleSelect(user)}
            >
              <Avatar user={user} size={36} showOnline={user.isOnline} />
              <div className="user-info">
                <span className="user-name">{user.displayName || user.username}</span>
                <span className="user-handle">@{user.username}</span>
              </div>
              {selected.find(u => u._id === user._id) && (
                <div className="check">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M20 6L9 17l-5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              )}
            </div>
          ))}
        </div>

        {selected.length > 0 && (
          <div className="modal-footer">
            <button className="create-btn" onClick={handleCreate} disabled={creating || (tab === 'group' && !groupName.trim())}>
              {creating ? 'Creating…' : (tab === 'direct' ? 'Open Chat' : `Create Group (${selected.length})`)}
            </button>
          </div>
        )}
      </div>

      <style>{`
        .modal-overlay {
          position: fixed; inset: 0; z-index: 100;
          background: rgba(0,0,0,0.6);
          display: flex; align-items: center; justify-content: center;
          padding: 20px; animation: fadeIn 0.15s ease;
          /* On mobile the overlay must respect the visual viewport (shrinks with keyboard) */
          align-items: flex-end;
        }
        .modal {
          width: 100%; max-width: 440px;
          background: var(--bg-2); border: 1px solid var(--border);
          border-radius: var(--radius-xl) var(--radius-xl) 0 0;
          overflow: hidden; animation: slideUp 0.2s ease;
          /* dvh = dynamic viewport height — shrinks when keyboard is open */
          max-height: 92dvh;
          display: flex; flex-direction: column;
          /* Safe area for home indicator */
          padding-bottom: env(safe-area-inset-bottom, 0px);
        }
        /* On larger screens, show as centered card */
        @media (min-height: 600px) and (min-width: 500px) {
          .modal-overlay { align-items: center; padding: 20px; }
          .modal {
            border-radius: var(--radius-xl);
            max-height: 80dvh;
            padding-bottom: 0;
          }
        }
        .modal-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 20px 20px 16px;
        }
        .modal-header h2 { font-size: 17px; font-weight: 600; }
        .close-btn {
          color: var(--text-2); width: 32px; height: 32px;
          display: flex; align-items: center; justify-content: center;
          border-radius: var(--radius-sm); transition: all var(--transition);
        }
        .close-btn:hover { background: var(--bg-3); color: var(--text-0); }
        .tab-row {
          display: flex; gap: 0; padding: 0 20px 16px;
          border-bottom: 1px solid var(--border);
        }
        .tab-row button {
          flex: 1; padding: 8px; font-size: 13px; font-weight: 500;
          color: var(--text-3); border-bottom: 2px solid transparent;
          transition: all var(--transition);
        }
        .tab-row button.active { color: var(--accent); border-bottom-color: var(--accent); }
        .group-name-field { padding: 12px 20px 0; }
        .group-name-field input {
          width: 100%; background: var(--bg-3); border: 1px solid var(--border);
          border-radius: var(--radius); padding: 10px 14px; font-size: 14px;
        }
        .group-name-field input:focus { border-color: var(--accent); }
        .selected-chips {
          display: flex; flex-wrap: wrap; gap: 6px;
          padding: 12px 20px 0;
        }
        .chip {
          display: flex; align-items: center; gap: 4px;
          background: var(--accent-dim); color: var(--accent);
          border: 1px solid rgba(108,99,255,0.2);
          border-radius: var(--radius-full); padding: 4px 10px;
          font-size: 12px; font-weight: 500; cursor: pointer;
        }
        .chip:hover { background: rgba(108,99,255,0.25); }
        .search-area { padding: 12px 20px; }
        .search-area input {
          width: 100%; background: var(--bg-3); border: 1px solid var(--border);
          border-radius: var(--radius); padding: 10px 14px; font-size: 14px;
        }
        .search-area input:focus { border-color: var(--accent); }
        .user-results { flex: 1; overflow-y: auto; padding: 0 8px; }
        .result-loading, .result-empty {
          padding: 20px; text-align: center; color: var(--text-3); font-size: 14px;
        }
        .user-row {
          display: flex; align-items: center; gap: 12px;
          padding: 10px 12px; border-radius: var(--radius);
          cursor: pointer; transition: background var(--transition);
        }
        .user-row:hover { background: var(--bg-3); }
        .user-row.selected { background: var(--accent-dim); }
        .user-info { flex: 1; }
        .user-name { display: block; font-size: 14px; font-weight: 500; }
        .user-handle { display: block; font-size: 12px; color: var(--text-3); }
        .check {
          width: 22px; height: 22px; background: var(--accent);
          border-radius: 50%; display: flex; align-items: center; justify-content: center;
        }
        .modal-footer { padding: 16px 20px; border-top: 1px solid var(--border); }
        .create-btn {
          width: 100%; background: var(--accent); color: white;
          border-radius: var(--radius); padding: 12px; font-size: 14px; font-weight: 500;
          transition: all var(--transition);
        }
        .create-btn:hover:not(:disabled) { background: var(--accent-light); }
        .create-btn:disabled { opacity: 0.5; cursor: default; }
      `}</style>
    </div>
  );
}
