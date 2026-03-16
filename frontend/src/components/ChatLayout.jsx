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

export default function ChatLayout({ onOpenAdmin }) {
  const { setActiveConversation } = useChat();
  const [activeConversationId, setActive] = useState(null);
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
