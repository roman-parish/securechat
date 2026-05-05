/**
 * SecureChat — End-to-End Encrypted Messaging
 * Copyright (c) 2026 Roman Parish
 * Licensed under the MIT License — see LICENSE file for details
 *
 * https://github.com/roman-parish/securechat
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import Sidebar from './Sidebar.jsx';
import ChatWindow from './ChatWindow.jsx';
import { useChat } from '../contexts/ChatContext.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';

export default function ChatLayout({ onOpenAdmin }) {
  const { setActiveConversation, conversations } = useChat();
  const { user } = useAuth();
  const [activeConversationId, setActive] = useState(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [switcherQuery, setSwitcherQuery] = useState('');
  // Use a ref so the SW message handler always has the latest version
  const handleSelectRef = useRef(null);

  const handleSelect = useCallback((id) => {
    setActive(id);
    setActiveConversation(id);
  }, [setActiveConversation]);

  // Keep ref in sync
  handleSelectRef.current = handleSelect;

  const handleBack = useCallback(() => {
    setActive(null);
    setActiveConversation(null);
  }, [setActiveConversation]);

  // Cmd/Ctrl+K — open conversation switcher
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSwitcherOpen(o => !o);
        setSwitcherQuery('');
      }
      if (e.key === 'Escape') setSwitcherOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Handle notification click → navigate to conversation
  // Uses ref so handler is never stale regardless of when SW message arrives
  useEffect(() => {
    const handler = (event) => {
      const { conversationId } = event.detail || {};
      if (conversationId) {
        handleSelectRef.current(String(conversationId));
      }
    };
    window.addEventListener('sw:notification-click', handler);
    return () => window.removeEventListener('sw:notification-click', handler);
  }, []); // empty deps — ref keeps it fresh

  const switcherResults = (() => {
    if (!conversations) return [];
    const q = switcherQuery.toLowerCase();
    return conversations
      .filter(c => {
        const other = c.type === 'direct' ? c.participants?.find(p => String(p._id) !== String(user?._id)) : null;
        const name = c.type === 'group' ? c.name : (other?.displayName || other?.username || '');
        return !q || name.toLowerCase().includes(q);
      })
      .slice(0, 8);
  })();

  return (
    <div className="chat-layout">
      <div className={`sidebar-panel ${activeConversationId ? 'hidden-mobile' : ''}`}>
        <Sidebar onSelectConversation={handleSelect} activeConversationId={activeConversationId} onRemoveActive={handleBack} onOpenAdmin={onOpenAdmin} />
      </div>
      <div className={`main-panel ${!activeConversationId ? 'hidden-mobile' : ''}`}>
        {activeConversationId ? (
          // key= forces a full remount when switching conversations,
          // ensuring messages are re-fetched rather than showing stale state
          <ChatWindow
            key={activeConversationId}
            conversationId={activeConversationId}
            onBack={handleBack}
          />
        ) : (
          <EmptyState />
        )}
      </div>

      {switcherOpen && (
        <div className="switcher-overlay" onClick={() => setSwitcherOpen(false)}>
          <div className="switcher-modal" onClick={e => e.stopPropagation()}>
            <div className="switcher-search-row">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--text-3)', flexShrink: 0 }}>
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2"/>
                <path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <input
                autoFocus
                className="switcher-input"
                placeholder="Jump to conversation…"
                value={switcherQuery}
                onChange={e => setSwitcherQuery(e.target.value)}
              />
              <kbd className="switcher-esc" onClick={() => setSwitcherOpen(false)}>esc</kbd>
            </div>
            <div className="switcher-list">
              {switcherResults.length === 0 && (
                <div className="switcher-empty">No conversations found</div>
              )}
              {switcherResults.map(c => {
                const other = c.type === 'direct' ? c.participants?.find(p => String(p._id) !== String(user?._id)) : null;
                const name = c.type === 'group' ? c.name : (other?.displayName || other?.username || 'Unknown');
                const isActive = String(c._id) === String(activeConversationId);
                return (
                  <button
                    key={c._id}
                    className={`switcher-item ${isActive ? 'active' : ''}`}
                    onClick={() => { handleSelect(String(c._id)); setSwitcherOpen(false); }}
                  >
                    <span className="switcher-item-icon">
                      {c.type === 'group' ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="1.5"/>
                          <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.5"/>
                          <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                          <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.5"/>
                          <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                      )}
                    </span>
                    <span className="switcher-item-name">{name}</span>
                    {isActive && <span className="switcher-item-badge">current</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <style>{`
        .chat-layout {
          display: flex;
          flex: 1;
          height: 100%;
          overflow: hidden;
          background: var(--bg-1);
        }
        .sidebar-panel {
          width: 320px;
          flex-shrink: 0;
          border-right: 1px solid var(--border);
          display: flex;
          flex-direction: column;
        }
        .main-panel {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
        }
        @media (max-width: 768px) {
          .sidebar-panel { width: 100%; }
          .hidden-mobile { display: none !important; }
          .main-panel { width: 100%; }
        }

        /* ── Cmd+K Switcher ── */
        .switcher-overlay {
          position: fixed; inset: 0; z-index: 2000;
          background: rgba(0,0,0,0.5);
          display: flex; align-items: flex-start; justify-content: center;
          padding-top: 80px;
          animation: fadeIn 0.1s ease;
        }
        .switcher-modal {
          width: 100%; max-width: 480px; margin: 0 16px;
          background: var(--bg-2); border: 1px solid var(--border-strong);
          border-radius: var(--radius-xl); overflow: hidden;
          box-shadow: var(--shadow-lg);
          animation: slideUp 0.15s ease;
        }
        .switcher-search-row {
          display: flex; align-items: center; gap: 10px;
          padding: 14px 16px; border-bottom: 1px solid var(--border);
        }
        .switcher-input {
          flex: 1; font-size: 15px; color: var(--text-0);
          background: none; border: none; outline: none;
          font-family: var(--font-sans);
        }
        .switcher-input::placeholder { color: var(--text-3); }
        .switcher-esc {
          font-size: 11px; color: var(--text-3);
          background: var(--bg-3); border: 1px solid var(--border);
          border-radius: 6px; padding: 2px 6px;
          font-family: var(--font-mono); cursor: pointer; flex-shrink: 0;
        }
        .switcher-list { max-height: 320px; overflow-y: auto; padding: 6px; }
        .switcher-empty {
          padding: 20px; text-align: center;
          font-size: 13px; color: var(--text-3);
        }
        .switcher-item {
          display: flex; align-items: center; gap: 10px;
          width: 100%; padding: 10px 12px; border-radius: var(--radius);
          text-align: left; color: var(--text-1); transition: background var(--transition);
        }
        .switcher-item:hover, .switcher-item:focus { background: var(--bg-3); }
        .switcher-item.active { background: var(--accent-dim); color: var(--accent); }
        .switcher-item-icon { color: var(--text-3); flex-shrink: 0; display: flex; }
        .switcher-item.active .switcher-item-icon { color: var(--accent); }
        .switcher-item-name { flex: 1; font-size: 14px; font-weight: 500; }
        .switcher-item-badge {
          font-size: 11px; color: var(--accent); background: var(--accent-dim);
          padding: 2px 7px; border-radius: var(--radius-full); flex-shrink: 0;
        }
      `}</style>
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      color: 'var(--text-3)', gap: 16, padding: 32,
    }}>
      <svg width="56" height="56" viewBox="0 0 24 24" fill="none" opacity="0.2">
        <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M7 11V7a5 5 0 0110 0v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <circle cx="12" cy="16.5" r="1.5" fill="currentColor"/>
      </svg>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-1)', marginBottom: 6 }}>
          Select a conversation
        </p>
        <p style={{ fontSize: 13, lineHeight: 1.5 }}>
          All messages are end-to-end encrypted
        </p>
      </div>
    </div>
  );
}
