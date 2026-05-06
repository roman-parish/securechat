/**
 * SecureChat — End-to-End Encrypted Messaging
 * Copyright (c) 2026 Roman Parish
 * Licensed under the MIT License — see LICENSE file for details
 *
 * https://github.com/roman-parish/securechat
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
  const { conversations, archivedConversations, activeConversationId, onlineUsers, unreadCounts, loading, removeConversation, archiveConversation, unarchiveConversation, blockUser, typingMap, invitations, removeInvitation } = useChat();
  const { connected } = useSocket();
  const [search, setSearch] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [toast, setToast] = useState('');
  const { updateConversation } = useChat();

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  }, []);

  const handleMuteToggle = useCallback(async (convId, currentlyMuted) => {
    try {
      await apiFetch(`/conversations/${convId}/mute`, {
        method: currentlyMuted ? 'DELETE' : 'POST',
      });
      updateConversation(convId, conv => ({
        ...conv,
        mutedBy: currentlyMuted
          ? (conv.mutedBy || []).filter(m => String(m.userId) !== String(user._id))
          : [...(conv.mutedBy || []), { userId: user._id, until: null }],
      }));
    } catch {
      showToast('Failed to update mute — please try again');
    }
  }, [user._id, updateConversation, showToast]);

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
              <rect x="3" y="11" width="18" height="11" rx="3" fill="var(--accent)" opacity="0.2"/>
              <rect x="3" y="11" width="18" height="11" rx="3" stroke="var(--accent)" strokeWidth="1.5"/>
              <path d="M7 11V7a5 5 0 0110 0v4" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round"/>
              <circle cx="12" cy="16.5" r="1.5" fill="var(--accent)"/>
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
                  <path d="M12 3L4 7v6c0 4.4 3.4 8.5 8 9.5C16.6 21.5 20 17.4 20 13V7l-8-4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
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

      {toast && <div className="sidebar-toast">{toast}</div>}

      {invitations.length > 0 && (
        <InvitationPanel
          invitations={invitations}
          onAccept={async (inv) => {
            try {
              const conv = await apiFetch(`/conversations/${inv.conversationId}/invitations/${inv._id}/accept`, { method: 'POST' });
              removeInvitation(inv._id);
              onSelectConversation(conv._id);
            } catch {
              showToast('Failed to accept invitation');
            }
          }}
          onDecline={async (inv) => {
            try {
              await apiFetch(`/conversations/${inv.conversationId}/invitations/${inv._id}/decline`, { method: 'POST' });
              removeInvitation(inv._id);
            } catch {
              showToast('Failed to decline invitation');
            }
          }}
        />
      )}

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
                onArchive={() => archiveConversation(conv._id)}
                onBlock={async (userId) => { await blockUser(userId); removeConversation(conv._id); }}
                onMuteToggle={handleMuteToggle}
              />
            ))
        }

        {/* Archived section */}
        {archivedConversations.length > 0 && (
          <>
            <button className="archived-toggle" onClick={() => setShowArchived(s => !s)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Archived ({archivedConversations.length})
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ marginLeft: 'auto', transform: showArchived ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            {showArchived && archivedConversations.map(conv => (
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
                onUnarchive={() => unarchiveConversation(conv._id)}
                onMuteToggle={handleMuteToggle}
                isArchived
              />
            ))}
          </>
        )}
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
          padding-bottom: 8px;
        }
        .archived-toggle {
          display: flex; align-items: center; gap: 7px;
          width: 100%; padding: 8px 12px; margin-top: 4px;
          font-size: 12px; font-weight: 500; color: var(--text-3);
          border-radius: var(--radius); transition: all var(--transition);
        }
        .archived-toggle:hover { background: var(--bg-3); color: var(--text-1); }
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

function convPreview(conv, currentUser, hasUnread) {
  const msg = conv.lastMessage;
  if (!msg) return 'Start a conversation';

  const isMe = String(msg.sender?._id || msg.sender) === String(currentUser._id);
  const senderName = isMe ? 'You' : (msg.sender?.displayName || msg.sender?.username || '');
  const prefix = conv.type === 'group' ? `${senderName}: ` : (isMe ? 'You: ' : '');

  switch (msg.type) {
    case 'image': return `${prefix}📷 Photo`;
    case 'audio': return `${prefix}🎤 Voice message`;
    case 'file':  return `${prefix}📎 ${msg.attachment?.originalName || 'File'}`;
    case 'system': return msg.attachment?.originalName || 'System message';
    default:      return hasUnread ? `${prefix}New Message` : '';
  }
}

function ConvItem({ conv, user, active, onlineUsers, unread, typingUsers, onClick, onRemove, onArchive, onUnarchive, onBlock, onMuteToggle, isArchived }) {
  const [showMenu, setShowMenu] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const menuRef = useRef(null);

  const mutedEntry = conv.mutedBy?.find(m => String(m.userId) === String(user._id));
  const isMuted = !!(mutedEntry && (!mutedEntry.until || new Date(mutedEntry.until) > new Date()));
  const muteLabel = isMuted && mutedEntry?.until
    ? `Muted until ${format(new Date(mutedEntry.until), 'MMM d, h:mm a')}`
    : isMuted ? 'Muted' : null;

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
          {isMuted && !showMoreBtn && (
            <svg className="mute-icon" width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M11 5L6 9H2v6h4l5 4V5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
              <line x1="23" y1="9" x2="17" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="17" y1="9" x2="23" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          )}
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
          ) : isMuted && muteLabel && !hasUnread ? (
            <span className="conv-preview muted-label">{muteLabel}</span>
          ) : (
            <span className={`conv-preview ${hasUnread ? 'unread' : ''}`}>
              {convPreview(conv, user, hasUnread)}
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
          <button className="menu-btn-normal" onClick={() => { setShowMenu(false); onMuteToggle(conv._id, isMuted); }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              {isMuted ? (
                <><path d="M11 5L6 9H2v6h4l5 4V5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></>
              ) : (
                <><path d="M11 5L6 9H2v6h4l5 4V5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><line x1="23" y1="9" x2="17" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><line x1="17" y1="9" x2="23" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></>
              )}
            </svg>
            {isMuted ? 'Unmute' : 'Mute'}
          </button>
          {isArchived ? (
            <button className="menu-btn-normal" onClick={() => { setShowMenu(false); onUnarchive(); }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Unarchive
            </button>
          ) : (
            <button className="menu-btn-normal" onClick={() => { setShowMenu(false); onArchive(); }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Archive
            </button>
          )}
          {conv.type === 'direct' && !isArchived && (() => {
            const other = conv.participants?.find(p => String(p._id) !== String(user?._id));
            return other ? (
              <button onClick={() => { setShowMenu(false); onBlock(other._id); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M4.93 4.93l14.14 14.14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                Block user
              </button>
            ) : null;
          })()}
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
        .mute-icon { color: var(--text-3); flex-shrink: 0; margin-left: 4px; }
        .muted-label { color: var(--text-3); font-style: italic; }
        .sidebar-toast {
          margin: 6px 8px 0;
          background: var(--red-dim); border: 1px solid rgba(255,87,87,0.25);
          border-radius: var(--radius); padding: 8px 12px;
          font-size: 13px; color: var(--red); text-align: center;
          animation: slideUp 0.2s ease;
        }
        .conv-menu button {
          display: flex; align-items: center; gap: 8px;
          width: 100%; padding: 8px 10px; border-radius: var(--radius-sm);
          font-size: 13px; color: var(--red);
          transition: background var(--transition);
        }
        .conv-menu button:hover { background: var(--red-dim); }
        .conv-menu .menu-btn-normal { color: var(--text-1); }
        .conv-menu .menu-btn-normal:hover { background: var(--bg-3); }
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

function InvitationPanel({ invitations, onAccept, onDecline }) {
  const [busy, setBusy] = useState({});

  const handle = async (inv, action) => {
    setBusy(prev => ({ ...prev, [inv._id]: true }));
    try { await action(inv); } finally {
      setBusy(prev => ({ ...prev, [inv._id]: false }));
    }
  };

  return (
    <div className="inv-panel">
      <div className="inv-panel-label">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="1.5"/>
          <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="1.5"/>
        </svg>
        Group Invitations · {invitations.length}
      </div>
      {invitations.map(inv => (
        <div key={inv._id} className="inv-item">
          <div className="inv-info">
            <span className="inv-group">{inv.conversationName}</span>
            <span className="inv-from">Invited by {inv.invitedBy?.displayName || inv.invitedBy?.username}</span>
          </div>
          <div className="inv-actions">
            <button
              className="inv-accept"
              disabled={busy[inv._id]}
              onClick={() => handle(inv, onAccept)}
            >
              {busy[inv._id] ? '…' : 'Join'}
            </button>
            <button
              className="inv-decline"
              disabled={busy[inv._id]}
              onClick={() => handle(inv, onDecline)}
            >
              ✕
            </button>
          </div>
        </div>
      ))}
      <style>{`
        .inv-panel {
          border-bottom: 1px solid var(--border);
          background: var(--bg-2); padding: 8px;
        }
        .inv-panel-label {
          display: flex; align-items: center; gap: 6px;
          font-size: 10px; font-weight: 600; text-transform: uppercase;
          letter-spacing: 0.05em; color: var(--accent);
          padding: 2px 4px 6px;
        }
        .inv-item {
          display: flex; align-items: center; gap: 8px;
          padding: 6px 4px; border-radius: var(--radius-sm);
        }
        .inv-info { flex: 1; min-width: 0; }
        .inv-group { display: block; font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .inv-from { display: block; font-size: 11px; color: var(--text-3); }
        .inv-actions { display: flex; gap: 4px; flex-shrink: 0; }
        .inv-accept {
          padding: 4px 10px; font-size: 12px; font-weight: 500;
          background: var(--accent); color: white; border-radius: var(--radius-sm);
          transition: all var(--transition);
        }
        .inv-accept:hover:not(:disabled) { filter: brightness(1.15); }
        .inv-accept:disabled { opacity: 0.5; }
        .inv-decline {
          width: 26px; height: 26px; display: flex; align-items: center; justify-content: center;
          font-size: 12px; color: var(--text-3); border-radius: var(--radius-sm);
          transition: all var(--transition);
        }
        .inv-decline:hover:not(:disabled) { background: var(--red-dim); color: var(--red); }
        .inv-decline:disabled { opacity: 0.5; }
      `}</style>
    </div>
  );
}

function getConvName(conv, user) {
  if (conv.type === 'group') return conv.name || 'Group';
  const other = conv.participants?.find(p => String(p._id) !== String(user._id));
  return other?.displayName || other?.username || 'Unknown';
}
