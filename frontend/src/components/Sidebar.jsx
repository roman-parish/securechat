/**
 * SecureChat — End-to-End Encrypted Messaging
 * Copyright (c) 2026 Roman Parish
 * Licensed under the MIT License — see LICENSE file for details
 *
 * https://github.com/w5rcp-romanparish/securechat
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useChat } from '../contexts/ChatContext.jsx';
import { useSocket } from '../contexts/SocketContext.jsx';
import { apiFetch } from '../utils/api.js';
import Avatar from './Avatar.jsx';
import NewChatModal from './NewChatModal.jsx';
import ProfileModal from './ProfileModal.jsx';
import { format } from 'date-fns';

export default function Sidebar({ onSelectConversation, activeConversationId: activeConvIdProp, onRemoveActive, onOpenAdmin }) {
  const { user, logout } = useAuth();
  const { conversations, activeConversationId, onlineUsers, unreadCounts, loading, removeConversation, typingMap } = useChat();
  const { connected } = useSocket();
  const [search, setSearch] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  const filtered = conversations.filter(conv => {
    const name = getConvName(conv, user);
    return name.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="header-top">
          <div className="logo">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="11" width="18" height="11" rx="2" fill="var(--accent)" opacity="0.3"/>
              <rect x="3" y="11" width="18" height="11" rx="2" stroke="var(--accent)" strokeWidth="1.5"/>
              <path d="M7 11V7a5 5 0 0110 0v4" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <span>SecureChat</span>
            {!connected && <span className="offline-badge">offline</span>}
          </div>
          <div className="header-actions">
            <button className="icon-btn" onClick={() => setShowNewChat(true)} title="New conversation">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
            {onOpenAdmin && (
              <button className="icon-btn" onClick={onOpenAdmin} title="Admin panel">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2L3 7l9 5 9-5-9-5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                  <path d="M3 12l9 5 9-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M3 17l9 5 9-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            )}
            <button className="icon-btn" onClick={() => setShowProfile(true)} title="Profile">
              <Avatar user={user} size={28} />
            </button>
          </div>
        </div>
        <div className="search-box">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="7" stroke="var(--text-3)" strokeWidth="1.5"/>
            <path d="M16.5 16.5l4 4" stroke="var(--text-3)" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <input
            type="text"
            placeholder="Search conversations..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="conv-list">
        {loading
          ? Array.from({ length: 5 }).map((_, i) => <SkeletonItem key={i} />)
          : filtered.length === 0
            ? (
              <div className="empty-list">
                {search ? 'No conversations found' : 'No conversations yet'}
                <button onClick={() => setShowNewChat(true)}>Start one</button>
              </div>
            )
            : filtered.map(conv => (
              <ConvItem
                key={conv._id}
                conv={conv}
                user={user}
                active={conv._id === activeConversationId}
                onlineUsers={onlineUsers}
                unread={unreadCounts[String(conv._id)] || 0}
                typingUsers={typingMap[String(conv._id)] || []}
                onClick={() => onSelectConversation(conv._id)}
                onRemove={() => removeConversation(conv._id)}
              />
            ))
        }
      </div>

      {showNewChat && <NewChatModal onClose={() => setShowNewChat(false)} />}
      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}

      <style>{`
        .sidebar { display: flex; flex-direction: column; height: 100%; }
        .sidebar-header { padding: 16px; border-bottom: 1px solid var(--border); }
        .header-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
        .logo { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 16px; }
        .offline-badge {
          font-size: 10px; font-weight: 500;
          background: var(--red-dim); color: var(--red);
          border-radius: var(--radius-full); padding: 2px 6px;
        }
        .header-actions { display: flex; align-items: center; gap: 4px; }
        .icon-btn {
          width: 34px; height: 34px;
          display: flex; align-items: center; justify-content: center;
          border-radius: var(--radius); color: var(--text-2);
          transition: all var(--transition);
        }
        .icon-btn:hover { background: var(--bg-3); color: var(--text-0); }
        .search-box {
          display: flex; align-items: center; gap: 8px;
          background: var(--bg-3); border-radius: var(--radius);
          padding: 9px 12px; border: 1px solid transparent;
          transition: border-color var(--transition);
        }
        .search-box:focus-within { border-color: var(--accent); }
        .search-box input { flex: 1; font-size: 14px; color: var(--text-1); }
        .search-box input::placeholder { color: var(--text-3); }
        .conv-list {
          flex: 1; overflow-y: auto; padding: 8px;
          padding-bottom: max(8px, env(safe-area-inset-bottom, 0px));
        }
        .empty-list {
          display: flex; flex-direction: column; align-items: center;
          gap: 8px; padding: 40px 20px;
          color: var(--text-3); font-size: 14px; text-align: center;
        }
        .empty-list button { color: var(--accent); font-size: 13px; font-weight: 500; }
        .empty-list button:hover { text-decoration: underline; }
      `}</style>
    </div>
  );
}

function convTimestamp(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now - d) / 86400000);
  if (diffDays === 0) return format(d, 'h:mm a');
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return format(d, 'EEE');
  return format(d, 'dd/MM/yy');
}

function convPreview(conv, currentUser) {
  if (!conv.lastMessage) return 'Start a conversation';
  const sender = conv.lastMessage.sender;
  if (!sender) return 'New message';
  const isMe = String(sender._id) === String(currentUser._id);
  const name = isMe ? 'You' : (sender.displayName || sender.username);
  return `${name}: New message`;
}

function ConvItem({ conv, user, active, onlineUsers, unread, typingUsers, onClick, onRemove }) {
  const [showMenu, setShowMenu] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const menuRef = useRef(null);

  // Close menu when clicking outside
  useEffect(() => {
    if (!showMenu) return;
    const close = (e) => {
      if (!menuRef.current?.contains(e.target)) setShowMenu(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [showMenu]);

  const other = conv.type === 'direct'
    ? conv.participants?.find(p => String(p._id) !== String(user._id))
    : null;

  const name = conv.type === 'group' ? conv.name : (other?.displayName || other?.username || 'Unknown');
  const isOnline = other && onlineUsers.has(String(other._id));
  const hasUnread = unread > 0;
  // Show ··· button: always on touch devices, on hover for mouse devices
  const showMoreBtn = isHovered || showMenu;

  return (
    <div
      className={`conv-item ${active ? 'active' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => { setIsHovered(false); setShowMenu(false); }}
      onClick={() => { if (showMenu) { setShowMenu(false); return; } setIsHovered(false); onClick(); }}
    >
      <div className="conv-avatar">
        {conv.type === 'group' ? (
          <div className="group-avatar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="1.5"/>
              <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
        ) : (
          <Avatar user={other} size={44} onlineState={isOnline ? true : null} />
        )}
      </div>

      <div className="conv-content">
        <div className="conv-top">
          <span className={`conv-name ${hasUnread ? 'unread' : ''}`}>{name}</span>
          {!showMoreBtn && (
            <span className="conv-time">{convTimestamp(conv.lastActivity || conv.updatedAt)}</span>
          )}
        </div>
        <div className="conv-bottom">
          {typingUsers.length > 0 ? (
            <span className="conv-preview typing-preview">
              <span className="typing-dots-inline"><span/><span/><span/></span>
              {typingUsers.map(u => u.username).join(', ')} typing
            </span>
          ) : (
            <span className={`conv-preview ${hasUnread ? 'unread' : ''}`}>
              {convPreview(conv, user)}
            </span>
          )}
          {hasUnread && !showMoreBtn && (
            <span className="unread-badge">{unread > 99 ? '99+' : unread}</span>
          )}
        </div>
      </div>

      {/* ··· button — replaces timestamp/badge on hover, always shown on touch */}
      <button
        className={`conv-more-btn ${showMoreBtn ? 'visible' : ''}`}
        onClick={e => { e.stopPropagation(); setShowMenu(s => !s); }}
        title="Options"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <circle cx="5" cy="12" r="1.5" fill="currentColor"/>
          <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
          <circle cx="19" cy="12" r="1.5" fill="currentColor"/>
        </svg>
      </button>

      {/* Options menu */}
      {showMenu && (
        <div className="conv-menu" ref={menuRef} onClick={e => e.stopPropagation()}>
          <button onClick={() => { setShowMenu(false); onRemove(); }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Remove conversation
          </button>
        </div>
      )}

      <style>{`
        .conv-item {
          display: flex; align-items: center; gap: 12px;
          padding: 10px 12px; border-radius: var(--radius);
          cursor: pointer; transition: background var(--transition);
          position: relative;
        }
        .conv-item:hover, .conv-item:hover .conv-more-btn { background: var(--bg-3); }
        .conv-item.active { background: var(--accent-dim); }
        .conv-avatar { flex-shrink: 0; }
        .group-avatar {
          width: 44px; height: 44px; background: var(--bg-4);
          border-radius: 50%; display: flex; align-items: center;
          justify-content: center; color: var(--text-2);
        }
        .conv-content { flex: 1; min-width: 0; }
        .conv-top {
          display: flex; align-items: center;
          justify-content: space-between; margin-bottom: 3px;
        }
        .conv-name {
          font-size: 14px; font-weight: 500; color: var(--text-1);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          flex: 1; min-width: 0;
        }
        .conv-name.unread { font-weight: 700; color: var(--text-0); }
        .conv-time { font-size: 11px; color: var(--text-3); flex-shrink: 0; margin-left: 8px; }
        .conv-bottom { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
        .conv-preview {
          font-size: 12px; color: var(--text-3);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          flex: 1; min-width: 0;
        }
        .conv-preview.unread { color: var(--text-1); font-weight: 500; }
        .typing-preview {
          color: var(--accent) !important; display: flex;
          align-items: center; gap: 5px; font-size: 12px;
        }
        .typing-dots-inline { display: flex; gap: 2px; align-items: center; }
        .typing-dots-inline span {
          width: 4px; height: 4px; background: var(--accent);
          border-radius: 50%; animation: pulse 1.2s infinite;
        }
        .typing-dots-inline span:nth-child(2) { animation-delay: 0.2s; }
        .typing-dots-inline span:nth-child(3) { animation-delay: 0.4s; }
        .unread-badge {
          background: var(--accent); color: white;
          font-size: 11px; font-weight: 700;
          border-radius: var(--radius-full); padding: 2px 7px;
          flex-shrink: 0; min-width: 20px; text-align: center;
        }
        .conv-more-btn {
          flex-shrink: 0; width: 28px; height: 28px;
          display: flex; align-items: center; justify-content: center;
          border-radius: var(--radius-sm); color: var(--text-2);
          opacity: 0; pointer-events: none;
          transition: all var(--transition);
        }
        .conv-more-btn.visible {
          opacity: 1; pointer-events: auto;
        }
        .conv-more-btn:hover { background: var(--bg-4); color: var(--text-0); }
        /* Always show on touch devices */
        @media (hover: none) {
          .conv-more-btn { opacity: 1; pointer-events: auto; }
        }
        .conv-menu {
          position: absolute; right: 8px; top: calc(100% - 4px);
          background: var(--bg-2); border: 1px solid var(--border-strong);
          border-radius: var(--radius); padding: 4px;
          box-shadow: var(--shadow); z-index: 50; min-width: 180px;
          animation: slideUp 0.1s ease;
        }
        .conv-menu button {
          display: flex; align-items: center; gap: 8px;
          width: 100%; padding: 8px 10px; border-radius: var(--radius-sm);
          font-size: 13px; color: var(--red);
          transition: background var(--transition);
        }
        .conv-menu button:hover { background: var(--red-dim); }
      `}</style>
    </div>
  );
}


function SkeletonItem() {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '10px 12px', alignItems: 'center' }}>
      <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--bg-3)', animation: 'pulse 1.5s infinite' }} />
      <div style={{ flex: 1 }}>
        <div style={{ height: 14, width: '60%', background: 'var(--bg-3)', borderRadius: 4, marginBottom: 8, animation: 'pulse 1.5s infinite' }} />
        <div style={{ height: 12, width: '80%', background: 'var(--bg-3)', borderRadius: 4, animation: 'pulse 1.5s infinite' }} />
      </div>
    </div>
  );
}

function getConvName(conv, user) {
  if (conv.type === 'group') return conv.name || 'Group';
  const other = conv.participants?.find(p => String(p._id) !== String(user._id));
  return other?.displayName || other?.username || 'Unknown';
}
