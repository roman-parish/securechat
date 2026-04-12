/**
 * SecureChat — End-to-End Encrypted Messaging
 * Copyright (c) 2026 Roman Parish
 * Licensed under the MIT License — see LICENSE file for details
 *
 * https://github.com/roman-parish/securechat
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useSocket } from '../contexts/SocketContext.jsx';
import { useChat } from '../contexts/ChatContext.jsx';
import { apiFetch, apiUpload } from '../utils/api.js';
import { decryptMessage, bufToB64, b64ToBuf } from '../utils/crypto.js';
import Avatar from './Avatar.jsx';
import MessageBubble from './MessageBubble.jsx';
import GroupInfoModal from './GroupInfoModal.jsx';
import { format, isToday, isYesterday, formatDistanceToNow } from 'date-fns';

function formatLastSeen(lastSeen) {
  if (!lastSeen) return 'Offline';
  const d = new Date(lastSeen);
  if (isToday(d)) return `Last seen today at ${format(d, 'h:mm a')}`;
  if (isYesterday(d)) return `Last seen yesterday at ${format(d, 'h:mm a')}`;
  return `Last seen ${formatDistanceToNow(d, { addSuffix: true })}`;
}

export default function ChatWindow({ conversationId, onBack }) {
  const { user } = useAuth();
  const { socket } = useSocket();
  const { onlineUsers, onlineListLoaded } = useChat();
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [decrypted, setDecrypted] = useState({});
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [typingUsers, setTypingUsers] = useState([]);
  const [replyTo, setReplyTo] = useState(null);
  const [editingMsg, setEditingMsg] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [serverSearchResults, setServerSearchResults] = useState([]);
  const [serverSearchLoading, setServerSearchLoading] = useState(false);
  const [jumpHighlight, setJumpHighlight] = useState(null);
  const searchTimerRef = useRef(null);
  const [atBottom, setAtBottom] = useState(true);
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [showUserProfile, setShowUserProfile] = useState(false);
  const [attachment, setAttachment] = useState(null); // { file, previewUrl, type }
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const messagesAreaRef = useRef(null);
  const typingTimerRef = useRef(null);
  const conversationRef = useRef(null);
  const textareaRef = useRef(null);
  const decryptedRef = useRef({});

  const setMsg = useCallback((id, text) => {
    decryptedRef.current[id] = text;
    setDecrypted(prev => ({ ...prev, [id]: text }));
  }, []);

  const userIdRef = useRef(null);
  useEffect(() => { userIdRef.current = user?._id; }, [user]);

  const decryptOne = useCallback(async (msg) => {
    const userId = userIdRef.current;
    if (!userId || decryptedRef.current[msg._id] !== undefined) return;
    if (msg.type === 'system' || msg.type === 'deleted') {
      setMsg(msg._id, msg.type === 'deleted' ? '🗑 Message deleted' : msg.encryptedContent);
      return;
    }
    const keys = msg.encryptedKeys;
    if (!keys?.length) { setMsg(msg._id, '[No keys]'); return; }
    const keyEntry = keys.find(k => String(k.userId) === String(userId));
    if (!keyEntry) { setMsg(msg._id, '[Not encrypted for this device]'); return; }
    const plain = await decryptMessage(msg.encryptedContent, msg.iv, keyEntry.encryptedKey, userId);
    setMsg(msg._id, plain);
  }, [setMsg]);

  // Load conversation + messages
  useEffect(() => {
    if (!conversationId) return;
    let cancelled = false;
    setLoading(true);
    setMessages([]);
    setDecrypted({});
    decryptedRef.current = {};
    setConversation(null);
    setTypingUsers([]);
    setHasMore(true);
    setSearchOpen(false);
    setSearchQuery('');

    Promise.all([
      apiFetch(`/conversations/${conversationId}`),
      apiFetch(`/messages/${conversationId}?limit=50`),
    ]).then(([conv, msgs]) => {
      if (cancelled) return;
      setConversation(conv);
      conversationRef.current = conv;
      setMessages(msgs);
      setHasMore(msgs.length === 50);
      msgs.forEach(m => decryptOne(m));
    }).catch(console.error)
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [conversationId, decryptOne]);

  // Load older messages (pagination)
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !messages.length) return;
    setLoadingMore(true);
    const oldest = messages[0];
    try {
      const older = await apiFetch(`/messages/${conversationId}?limit=50&before=${encodeURIComponent(oldest.createdAt)}`);
      if (older.length === 0) { setHasMore(false); return; }
      setHasMore(older.length === 50);
      older.forEach(m => decryptOne(m));
      // Preserve scroll position when prepending
      const area = messagesAreaRef.current;
      const prevHeight = area?.scrollHeight || 0;
      setMessages(prev => [...older, ...prev]);
      requestAnimationFrame(() => {
        if (area) area.scrollTop = area.scrollHeight - prevHeight;
      });
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, messages, conversationId, decryptOne]);

  // Debounced server search for attachment filenames and sender names
  useEffect(() => {
    clearTimeout(searchTimerRef.current);
    if (!searchQuery || !conversationId) {
      setServerSearchResults([]);
      return;
    }
    searchTimerRef.current = setTimeout(async () => {
      setServerSearchLoading(true);
      try {
        const results = await apiFetch(`/messages/${conversationId}/search?q=${encodeURIComponent(searchQuery)}`);
        setServerSearchResults(results || []);
      } catch {
        setServerSearchResults([]);
      } finally {
        setServerSearchLoading(false);
      }
    }, 400);
    return () => clearTimeout(searchTimerRef.current);
  }, [searchQuery, conversationId]);

  // Load messages around a timestamp and scroll to a specific message
  const jumpToMessage = useCallback(async (targetId, timestamp) => {
    // Check if already in loaded messages
    const alreadyLoaded = messages.find(m => String(m._id) === String(targetId));
    if (alreadyLoaded) {
      setJumpHighlight(String(targetId));
      setTimeout(() => {
        document.getElementById(`msg-${targetId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
      setTimeout(() => setJumpHighlight(null), 2000);
      return;
    }
    // Load messages up to just after the target timestamp
    const afterTs = new Date(new Date(timestamp).getTime() + 1000).toISOString();
    try {
      const batch = await apiFetch(`/messages/${conversationId}?limit=50&before=${encodeURIComponent(afterTs)}`);
      if (!batch?.length) return;
      batch.forEach(m => decryptOne(m));
      setMessages(batch);
      setHasMore(true); // may have older messages
      setJumpHighlight(String(targetId));
      requestAnimationFrame(() => {
        setTimeout(() => {
          document.getElementById(`msg-${targetId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      });
      setTimeout(() => setJumpHighlight(null), 2000);
    } catch {
      // ignore
    }
  }, [messages, conversationId, decryptOne]);

  // Socket events
  useEffect(() => {
    if (!socket || !conversationId) return;
    socket.emit('conversation:join', conversationId);

    const onNewMessage = (msg) => {
      if (String(msg.conversationId) !== String(conversationId)) return;
      setMessages(prev => {
        if (prev.find(m => m._id === msg._id)) return prev;
        decryptOne(msg);
        return [...prev, msg];
      });
      // Acknowledge delivery immediately
      socket.emit('message:delivered', { messageId: msg._id });
      apiFetch(`/messages/${conversationId}/read`, { method: 'POST' }).catch(() => {});
    };

    const onMessageDelivered = ({ messageId, userId }) => {
      setMessages(prev => prev.map(m =>
        String(m._id) === String(messageId) && !m.deliveredTo?.find(d => String(d.userId) === String(userId))
          ? { ...m, deliveredTo: [...(m.deliveredTo || []), { userId }] }
          : m
      ));
    };

    const onTypingStart = ({ userId: tid, username, conversationId: cid }) => {
      if (String(cid) !== String(conversationId)) return;
      if (String(tid) === String(userIdRef.current)) return;
      setTypingUsers(prev => prev.includes(username) ? prev : [...prev, username]);
    };

    const onTypingStop = ({ conversationId: cid, userId: tid }) => {
      if (String(cid) !== String(conversationId)) return;
      setTypingUsers([]);
    };

    const onReaction = ({ messageId, reactions }) => {
      setMessages(prev => prev.map(m =>
        String(m._id) === String(messageId) ? { ...m, reactions } : m
      ));
    };

    const onMessagesRead = ({ conversationId: cid, userId: uid, messageIds }) => {
      if (String(cid) !== String(conversationId)) return;
      setMessages(prev => prev.map(m =>
        messageIds.includes(String(m._id)) && !m.readBy?.find(r => String(r.userId) === String(uid))
          ? { ...m, readBy: [...(m.readBy || []), { userId: uid }] }
          : m
      ));
    };

    const onMessageEdited = (editedMsg) => {
      if (String(editedMsg.conversationId) !== String(conversationId)) return;
      setMessages(prev => prev.map(m => String(m._id) === String(editedMsg._id) ? editedMsg : m));
      // Re-decrypt
      delete decryptedRef.current[editedMsg._id];
      decryptOne(editedMsg);
    };

    const onMessageDeleted = ({ messageId, forEveryone }) => {
      if (forEveryone) {
        setMessages(prev => prev.map(m =>
          String(m._id) === String(messageId) ? { ...m, type: 'deleted' } : m
        ));
        setMsg(messageId, '🗑 Message deleted');
      } else {
        setMessages(prev => prev.filter(m => String(m._id) !== String(messageId)));
      }
    };

    socket.on('message:new', onNewMessage);
    socket.on('typing:start', onTypingStart);
    socket.on('typing:stop', onTypingStop);
    socket.on('message:reaction', onReaction);
    socket.on('messages:read', onMessagesRead);
    socket.on('message:edited', onMessageEdited);
    socket.on('message:deleted', onMessageDeleted);
    socket.on('message:delivered', onMessageDelivered);

    return () => {
      socket.emit('conversation:leave', conversationId);
      socket.off('message:new', onNewMessage);
      socket.off('typing:start', onTypingStart);
      socket.off('typing:stop', onTypingStop);
      socket.off('message:reaction', onReaction);
      socket.off('messages:read', onMessagesRead);
      socket.off('message:edited', onMessageEdited);
      socket.off('message:deleted', onMessageDeleted);
      socket.off('message:delivered', onMessageDelivered);
    };
  }, [socket, conversationId, decryptOne, setMsg]);

  // Scroll to bottom helper — uses scrollTop directly for iOS reliability
  const scrollToBottom = (smooth = false) => {
    const area = messagesAreaRef.current;
    if (!area) return;
    area.scrollTo({ top: area.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  };

  // Scroll to bottom when initial load completes
  const initialLoadDone = useRef(false);
  useEffect(() => {
    if (!loading && !initialLoadDone.current) {
      initialLoadDone.current = true;
      // Two attempts — one immediate, one after fonts/images settle
      scrollToBottom(false);
      setTimeout(() => scrollToBottom(false), 100);
      setAtBottom(true);
    }
  }, [loading]);

  // Auto-scroll when new messages arrive and user is at bottom
  useEffect(() => {
    if (atBottom && initialLoadDone.current) {
      scrollToBottom(true);
    }
  }, [messages, typingUsers, atBottom]);

  // Mark read on mount and when active
  useEffect(() => {
    if (conversationId) {
      apiFetch(`/messages/${conversationId}/read`, { method: 'POST' }).catch(() => {});
    }
  }, [conversationId]);

  const autoResize = (el) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  };

  const handleTyping = (e) => {
    setText(e.target.value);
    autoResize(e.target);
    if (socket) {
      socket.emit('typing:start', { conversationId, userId: user?._id, username: user?.displayName || user?.username });
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(
        () => socket.emit('typing:stop', { conversationId, userId: user?._id }), 2000
      );
    }
  };

  const sendMessage = async (e) => {
    e?.preventDefault();
    const content = text.trim();
    if ((!content && !attachment) || sending) return;
    const conv = conversationRef.current;
    if (!conv) return;

    // Edit mode
    if (editingMsg) {
      setEditingMsg(null);
      setText('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      try {
        const payload = await buildEncryptedPayload(content, conv.participants, userIdRef.current);
        await apiFetch(`/messages/${editingMsg._id}`, { method: 'PUT', body: JSON.stringify(payload) });
        setMsg(editingMsg._id, content);
      } catch (err) {
        console.error('Edit failed:', err);
      }
      return;
    }

    setSending(true);
    setText('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    const pendingAttachment = attachment;
    setAttachment(null);

    try {
      let uploadedAttachment = null;
      if (pendingAttachment) {
        try {
          const form = new FormData();
          form.append('file', pendingAttachment.file);
          uploadedAttachment = await apiUpload('/uploads', form);
        } catch {
          setSendError('Attachment failed to upload — sending text only.');
          setTimeout(() => setSendError(''), 4000);
        }
      }
      const msgContent = content || '';
      const payload = await buildEncryptedPayload(msgContent || (pendingAttachment ? '📎' : ''), conv.participants, userIdRef.current);
      if (replyTo) payload.replyTo = replyTo._id;
      if (uploadedAttachment) payload.attachment = uploadedAttachment;
      const msg = await apiFetch(`/messages/${conversationId}`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setMsg(msg._id, content);
      setMessages(prev => prev.find(m => m._id === msg._id) ? prev : [...prev, msg]);
      setReplyTo(null);
      setAtBottom(true);
    } catch (err) {
      setText(content);
      setSendError(err.message || 'Failed to send message.');
      setTimeout(() => setSendError(''), 5000);
      console.error('Send failed:', err);
    } finally {
      setSending(false);
      socket?.emit('typing:stop', { conversationId, userId: user?._id });
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(e); }
    if (e.key === 'Escape') { setEditingMsg(null); setReplyTo(null); setText(''); }
  };

  const handleEdit = (msg) => {
    setEditingMsg(msg);
    setReplyTo(null);
    setText(decrypted[msg._id] || '');
    setTimeout(() => {
      textareaRef.current?.focus();
      autoResize(textareaRef.current);
    }, 50);
  };

  const handleDelete = async (msg, forEveryone) => {
    await apiFetch(`/messages/${msg._id}?forEveryone=${forEveryone}`, { method: 'DELETE' });
    if (!forEveryone) {
      setMessages(prev => prev.filter(m => m._id !== msg._id));
    }
  };

  const handlePin = async (msg) => {
    const pinned = conversation?.pinnedMessage;
    const alreadyPinned = pinned && String(pinned.messageId) === String(msg._id);
    if (alreadyPinned) {
      await apiFetch(`/conversations/${conversationId}/pin`, { method: 'DELETE' });
    } else {
      await apiFetch(`/conversations/${conversationId}/pin`, {
        method: 'POST',
        body: JSON.stringify({ messageId: msg._id }),
      });
    }
  };

  const myId = String(user?._id);
  const conv = conversation;
  const otherUser = conv?.type === 'direct'
    ? conv.participants?.find(p => String(p._id) !== myId)
    : null;
  const convName = conv
    ? conv.type === 'group' ? conv.name
      : otherUser?.displayName || otherUser?.username || 'Unknown'
    : '';
  const isOtherOnline = otherUser && onlineUsers.has(String(otherUser._id));

  // Search filter
  const searchResults = searchQuery
    ? messages.filter(m => {
        const plain = decrypted[m._id] || '';
        return plain.toLowerCase().includes(searchQuery.toLowerCase());
      })
    : null;

  const displayMessages = searchResults || messages;
  const grouped = groupByDate(displayMessages);

  return (
    <div className="chat-window">
      {/* Header */}
      <div className="chat-header">
        <button className="back-btn" onClick={onBack}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        {otherUser
          ? <div style={{ cursor: 'pointer' }} onClick={() => setShowUserProfile(true)}>
              <Avatar user={otherUser} size={36} onlineState={isOtherOnline ? true : null} />
            </div>
          : <div className="group-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="1.5"/>
                <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="1.5"/>
              </svg>
            </div>
        }
        <div className="chat-header-info" style={otherUser ? { cursor: 'pointer' } : {}} onClick={otherUser ? () => setShowUserProfile(true) : undefined}>
          <span className="chat-name">{convName}</span>
          <span className="chat-status">
            {conv?.type === 'group'
              ? (() => {
                  const total = conv.participants?.length ?? 0;
                  const online = conv.participants?.filter(p => onlineUsers.has(String(p._id))).length ?? 0;
                  return online > 0 ? `${total} members, ${online} online` : `${total} members`;
                })()
              : isOtherOnline
                ? <span style={{ color: 'var(--green)' }}>● Online</span>
                : onlineListLoaded
                  ? <span style={{ color: 'var(--text-3)' }}>{formatLastSeen(otherUser?.lastSeen)}</span>
                  : 'E2E Encrypted'}
          </span>
        </div>
        <button
          className="header-btn"
          onClick={() => { setSearchOpen(s => !s); setSearchQuery(''); }}
          title="Search messages"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M16.5 16.5l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
        {conv?.type === 'group' && (
          <button className="header-btn" onClick={() => setShowGroupInfo(true)} title="Group info">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        )}
      </div>

      {/* Pinned message banner */}
      {conversation?.pinnedMessage?.messageId && (() => {
        const pinned = conversation.pinnedMessage;
        const pinnedMsg = messages.find(m => String(m._id) === String(pinned.messageId));
        const preview = pinnedMsg
          ? (decrypted[pinnedMsg._id] || pinnedMsg.attachment?.filename || 'Attachment')
          : 'Pinned message';
        return (
          <div className="pinned-banner" onClick={() => pinnedMsg && jumpToMessage(pinnedMsg._id, pinnedMsg.createdAt)}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
              <path d="M12 2l3 6 6 1-4.5 4 1 6L12 16l-5.5 3 1-6L3 9l6-1z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="pinned-preview">{preview}</span>
            <button className="pinned-close" onClick={e => { e.stopPropagation(); apiFetch(`/conversations/${conversationId}/pin`, { method: 'DELETE' }); }} title="Unpin">✕</button>
          </div>
        );
      })()}

      {/* Search bar */}
      {searchOpen && (
        <>
          <div className="search-bar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="7" stroke="var(--text-3)" strokeWidth="1.5"/>
              <path d="M16.5 16.5l4 4" stroke="var(--text-3)" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <input
              autoFocus
              placeholder="Search messages..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            {serverSearchLoading && <span className="spinner" style={{ width: 12, height: 12, flexShrink: 0 }} />}
            {!serverSearchLoading && searchResults && (
              <span className="search-count">{searchResults.length} result{searchResults.length !== 1 ? 's' : ''}</span>
            )}
          </div>
          {serverSearchResults.length > 0 && (
            <div className="search-server-results">
              <div className="search-server-label">Jump to in history</div>
              {serverSearchResults.map(r => {
                const senderName = r.sender?.displayName || r.sender?.username || 'Unknown';
                const label = r.attachment?.filename
                  ? r.attachment.filename
                  : `${r.type} from ${senderName}`;
                const dateStr = format(new Date(r.createdAt), 'MMM d, yyyy');
                return (
                  <button
                    key={r._id}
                    className="search-server-item"
                    onClick={() => jumpToMessage(r._id, r.createdAt)}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="1.5"/>
                      <polyline points="14 2 14 8 20 8" stroke="currentColor" strokeWidth="1.5"/>
                    </svg>
                    <span className="search-server-name">{label}</span>
                    <span className="search-server-meta">{senderName} · {dateStr}</span>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Messages */}
      <div
        className="messages-area"
        ref={messagesAreaRef}
        onScroll={e => {
          const el = e.currentTarget;
          setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
          // Load more when near top
          if (el.scrollTop < 100 && !loadingMore && hasMore && !searchQuery) loadMore();
        }}
      >
        {loading ? (
          <div className="msg-loading"><span className="spinner" /></div>
        ) : (
          <>
            {loadingMore && <div className="loading-more"><span className="spinner" style={{width:16,height:16}} /></div>}
            {!hasMore && messages.length > 0 && (
              <div className="history-start">Beginning of conversation</div>
            )}
            {displayMessages.length === 0 && !loading && (
              <div className="no-messages">
                {searchQuery ? `No messages matching "${searchQuery}"` : 'Send your first message!'}
              </div>
            )}
            {grouped.map(({ date, msgs }) => (
              <div key={date}>
                <div className="date-separator"><span>{date}</span></div>
                {msgs.map((msg, i) => {
                  const prev = i > 0 ? msgs[i - 1] : null;
                  const consecutive = prev &&
                    String(prev.sender._id) === String(msg.sender._id) &&
                    new Date(msg.createdAt) - new Date(prev.createdAt) < 5 * 60 * 1000;
                  const isHighlighted = jumpHighlight === String(msg._id);
                  return (
                    <div
                      key={msg._id}
                      id={`msg-${msg._id}`}
                      className={isHighlighted ? 'msg-jump-highlight' : undefined}
                    >
                      <MessageBubble
                        msg={msg}
                        plaintext={decrypted[msg._id]}
                        isOwn={String(msg.sender._id) === myId}
                        isConsecutive={consecutive}
                        onReply={() => { setReplyTo(msg); setEditingMsg(null); textareaRef.current?.focus(); }}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                        onPin={handlePin}
                        currentUserId={myId}
                      />
                    </div>
                  );
                })}
              </div>
            ))}
            {typingUsers.length > 0 && (
              <div className="typing-indicator">
                <div className="typing-dots"><span /><span /><span /></div>
                <span>{typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing…</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Scroll to bottom */}
      {!atBottom && (
        <button className="scroll-to-bottom" onClick={() => {
          scrollToBottom(true);
          setAtBottom(true);
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      )}

      {/* Attachment preview */}
      {attachment && (
        <div className="attachment-preview">
          {attachment.previewUrl
            ? <img src={attachment.previewUrl} alt="preview" className="attach-img-preview" />
            : <div className="attach-file-preview">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <span>{attachment.file.name}</span>
              </div>
          }
          <button className="attach-remove" onClick={() => setAttachment(null)}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      )}

      {/* Edit banner */}
      {editingMsg && (
        <div className="context-bar edit-bar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <div className="context-content">
            <span className="context-label">Editing message</span>
            <span className="context-text">{decrypted[editingMsg._id]?.slice(0, 60) || ''}</span>
          </div>
          <button onClick={() => { setEditingMsg(null); setText(''); }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      )}

      {/* Reply banner */}
      {replyTo && !editingMsg && (
        <div className="context-bar reply-bar-wrap">
          <div className="reply-accent-bar" />
          <div className="context-content">
            <span className="context-label">{replyTo.sender?.displayName || replyTo.sender?.username}</span>
            <span className="context-text">{decrypted[replyTo._id]?.slice(0, 60) || '🔒 Message'}</span>
          </div>
          <button onClick={() => setReplyTo(null)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      )}

      {/* Send error banner */}
      {sendError && (
        <div className="send-error-bar">{sendError}</div>
      )}

      {/* Input */}
      <form className="chat-input-bar" onSubmit={sendMessage}>
        <div className="input-wrapper">
          <textarea
            ref={textareaRef}
            placeholder={editingMsg ? 'Edit message…' : 'Message…'}
            value={text}
            onChange={handleTyping}
            onKeyDown={handleKeyDown}
            rows={1}
            style={{ resize: 'none' }}
          />
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf,text/plain,audio/*,video/*"
          style={{ display: 'none' }}
          onChange={e => {
            const file = e.target.files?.[0];
            if (!file) return;
            e.target.value = '';
            const MAX_BYTES = 20 * 1024 * 1024; // 20 MB
            const ALLOWED_TYPES = [
              'image/', 'audio/', 'video/',
              'application/pdf', 'text/plain',
              'application/msword',
              'application/vnd.openxmlformats-officedocument',
              'application/zip', 'application/x-zip',
            ];
            if (file.size > MAX_BYTES) {
              setSendError(`File too large — maximum size is 20 MB (this file is ${(file.size / 1024 / 1024).toFixed(1)} MB)`);
              setTimeout(() => setSendError(''), 4000);
              return;
            }
            const allowed = ALLOWED_TYPES.some(t => file.type.startsWith(t));
            if (!allowed) {
              setSendError(`File type not supported: ${file.type || 'unknown'}`);
              setTimeout(() => setSendError(''), 4000);
              return;
            }
            const isImg = file.type.startsWith('image/');
            setAttachment({ file, previewUrl: isImg ? URL.createObjectURL(file) : null, type: isImg ? 'image' : 'file' });
          }}
        />
        {!editingMsg && (
          <button type="button" className="attach-btn" onClick={() => fileInputRef.current?.click()} title="Attach file">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66L9.41 17.41A2 2 0 0 1 6.59 14.6l8.49-8.49" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        )}
        <button type="submit" className={`send-btn ${editingMsg ? 'edit-mode' : ''}`} disabled={(!text.trim() && !attachment) || sending}>
          {sending
            ? <span className="spinner" style={{ width: 16, height: 16 }} />
            : editingMsg
              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              : <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M22 2L11 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  <path d="M22 2L15 22l-4-9-9-4 20-7z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
          }
        </button>
      </form>

      {showUserProfile && otherUser && (
        <div className="user-profile-overlay" onClick={() => setShowUserProfile(false)}>
          <div className="user-profile-card" onClick={e => e.stopPropagation()}>
            <button className="close-profile-btn" onClick={() => setShowUserProfile(false)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
            <div className="profile-avatar-wrap">
              <Avatar user={otherUser} size={72} />
              <div className={`profile-online-dot ${isOtherOnline ? 'online' : ''}`} />
            </div>
            <h3 className="profile-display-name">{otherUser.displayName || otherUser.username}</h3>
            <p className="profile-username">@{otherUser.username}</p>
            {otherUser.customStatus && <p className="profile-custom-status">💬 {otherUser.customStatus}</p>}
            {otherUser.bio && <p className="profile-bio">{otherUser.bio}</p>}
            <div className="profile-status-row">
              {isOtherOnline
                ? <span className="online-pill">● Online</span>
                : onlineListLoaded
                  ? <span className="offline-pill">{formatLastSeen(otherUser?.lastSeen)}</span>
                  : <span className="encrypted-pill">🔒 E2E Encrypted</span>
              }
            </div>
          </div>
        </div>
      )}

      {showGroupInfo && conv && (
        <GroupInfoModal
          conversation={conv}
          onClose={() => setShowGroupInfo(false)}
          onUpdated={(updated) => {
            setConversation(prev => ({ ...prev, ...updated }));
            conversationRef.current = { ...conversationRef.current, ...updated };
          }}
        />
      )}

      <style>{`
        .chat-window { display: flex; flex-direction: column; height: 100%; overflow: hidden; position: relative; background: var(--bg-1); }
        .user-profile-overlay {
          position: fixed; inset: 0; z-index: 100;
          background: rgba(0,0,0,0.6);
          display: flex; align-items: center; justify-content: center;
          padding: 20px; animation: fadeIn 0.15s ease;
        }
        .user-profile-card {
          background: var(--bg-2); border: 1px solid var(--border);
          border-radius: var(--radius-xl); padding: 32px 24px;
          width: 100%; max-width: 300px;
          display: flex; flex-direction: column; align-items: center; gap: 8px;
          position: relative; animation: slideUp 0.2s ease;
        }
        .close-profile-btn {
          position: absolute; top: 12px; right: 12px;
          width: 28px; height: 28px; border-radius: var(--radius-sm);
          display: flex; align-items: center; justify-content: center;
          color: var(--text-3); transition: all var(--transition);
        }
        .close-profile-btn:hover { background: var(--bg-3); color: var(--text-0); }
        .profile-avatar-wrap { position: relative; margin-bottom: 4px; }
        .profile-online-dot {
          position: absolute; bottom: 3px; right: 3px;
          width: 14px; height: 14px; border-radius: 50%;
          background: var(--text-3); border: 2px solid var(--bg-2);
        }
        .profile-online-dot.online { background: var(--green); }
        .profile-display-name { font-size: 18px; font-weight: 600; color: var(--text-0); }
        .profile-username { font-size: 13px; color: var(--text-3); }
        .profile-custom-status {
          font-size: 13px; color: var(--accent); text-align: center; max-width: 240px;
        }
        .profile-bio {
          font-size: 13px; color: var(--text-2); text-align: center;
          line-height: 1.5; max-width: 240px;
        }
        .profile-status-row { margin-top: 4px; }
        .online-pill {
          font-size: 13px; color: var(--green);
          background: rgba(61,214,140,0.1); padding: 4px 12px;
          border-radius: var(--radius-full);
        }
        .offline-pill {
          font-size: 13px; color: var(--text-3);
          background: var(--bg-3); padding: 4px 12px;
          border-radius: var(--radius-full);
        }
        .encrypted-pill {
          font-size: 13px; color: var(--text-3);
          background: var(--bg-3); padding: 4px 12px;
          border-radius: var(--radius-full);
        }
        .chat-header {
          display: flex; align-items: center; gap: 10px;
          padding: 10px 14px; border-bottom: 1px solid var(--border);
          background: var(--bg-1); flex-shrink: 0;
        }
        .back-btn { display: none; color: var(--text-2); padding: 6px; border-radius: var(--radius-sm); }
        .back-btn:hover { color: var(--text-0); background: var(--bg-3); }
        @media (max-width: 768px) { .back-btn { display: flex; align-items: center; } }
        .group-icon {
          width: 36px; height: 36px; border-radius: 50%;
          background: var(--bg-4); display: flex; align-items: center;
          justify-content: center; color: var(--text-2); flex-shrink: 0;
        }
        .chat-header-info { flex: 1; min-width: 0; }
        .chat-name { display: block; font-weight: 600; font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .chat-status { display: block; font-size: 12px; color: var(--text-3); }
        .header-btn {
          width: 34px; height: 34px; border-radius: var(--radius-sm);
          display: flex; align-items: center; justify-content: center;
          color: var(--text-2); transition: all var(--transition); flex-shrink: 0;
        }
        .header-btn:hover { background: var(--bg-3); color: var(--text-0); }
        .pinned-banner {
          display: flex; align-items: center; gap: 8px;
          padding: 7px 14px; background: var(--bg-2);
          border-bottom: 1px solid var(--border); flex-shrink: 0;
          cursor: pointer; color: var(--accent); font-size: 12px;
        }
        .pinned-banner:hover { background: var(--bg-3); }
        .pinned-preview { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-1); }
        .pinned-close { background: none; border: none; color: var(--text-3); cursor: pointer; font-size: 12px; padding: 0 2px; line-height: 1; }
        .pinned-close:hover { color: var(--text-0); }
        .search-bar {
          display: flex; align-items: center; gap: 8px;
          padding: 8px 14px; background: var(--bg-2);
          border-bottom: 1px solid var(--border); flex-shrink: 0;
        }
        .search-bar input { flex: 1; font-size: 14px; color: var(--text-0); }
        .search-bar input::placeholder { color: var(--text-3); }
        .search-count { font-size: 12px; color: var(--text-3); white-space: nowrap; }
        .search-server-results {
          background: var(--bg-2); border-bottom: 1px solid var(--border);
          max-height: 180px; overflow-y: auto; flex-shrink: 0;
        }
        .search-server-label {
          padding: 4px 14px; font-size: 10px; font-weight: 600;
          text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-3);
        }
        .search-server-item {
          display: flex; align-items: center; gap: 8px;
          padding: 6px 14px; width: 100%; text-align: left;
          color: var(--text-1); transition: background var(--transition);
        }
        .search-server-item:hover { background: var(--bg-3); }
        .search-server-name {
          flex: 1; font-size: 13px; white-space: nowrap;
          overflow: hidden; text-overflow: ellipsis;
        }
        .search-server-meta { font-size: 11px; color: var(--text-3); white-space: nowrap; flex-shrink: 0; }
        @keyframes jump-flash {
          0%,100% { background: transparent; }
          30% { background: rgba(108,99,255,0.18); }
        }
        .msg-jump-highlight { animation: jump-flash 2s ease; border-radius: 6px; }
        .messages-area {
          flex: 1; overflow-y: auto; padding: 8px 0;
          display: flex; flex-direction: column;
          -webkit-overflow-scrolling: touch;
        }
        .msg-loading, .no-messages {
          display: flex; flex-direction: column; align-items: center;
          justify-content: center; flex: 1; gap: 12px;
          color: var(--text-3); font-size: 14px; text-align: center;
        }
        .loading-more { display: flex; justify-content: center; padding: 12px; }
        .history-start {
          text-align: center; padding: 12px; font-size: 12px;
          color: var(--text-3); font-style: italic;
        }
        .date-separator { display: flex; align-items: center; justify-content: center; padding: 8px 16px; }
        .date-separator span {
          font-size: 11px; color: var(--text-3);
          background: var(--bg-3); padding: 3px 10px; border-radius: var(--radius-full);
        }
        .typing-indicator {
          display: flex; align-items: center; gap: 10px;
          padding: 6px 20px; color: var(--text-3); font-size: 13px;
        }
        .typing-dots { display: flex; gap: 3px; }
        .typing-dots span {
          width: 6px; height: 6px; background: var(--text-3);
          border-radius: 50%; animation: pulse 1.2s infinite;
        }
        .typing-dots span:nth-child(2) { animation-delay: 0.2s; }
        .typing-dots span:nth-child(3) { animation-delay: 0.4s; }
        .scroll-to-bottom {
          position: absolute; bottom: 90px; right: 16px; z-index: 10;
          width: 36px; height: 36px; border-radius: 50%;
          background: var(--bg-2); border: 1px solid var(--border-strong);
          color: var(--text-1); display: flex; align-items: center; justify-content: center;
          box-shadow: var(--shadow); transition: all var(--transition);
          animation: fadeIn 0.15s ease;
        }
        .scroll-to-bottom:hover { background: var(--bg-4); }
        .send-error-bar {
          padding: 8px 14px; font-size: 13px;
          color: #ff6b6b; background: rgba(255,107,107,0.1);
          border-top: 1px solid rgba(255,107,107,0.2);
        }
        .context-bar {
          display: flex; align-items: center; gap: 10px;
          padding: 8px 14px; flex-shrink: 0;
          border-top: 1px solid var(--border);
        }
        .edit-bar { background: rgba(108,99,255,0.08); }
        .reply-bar-wrap { background: var(--bg-2); }
        .reply-accent-bar { width: 3px; height: 36px; background: var(--accent); border-radius: 2px; flex-shrink: 0; }
        .context-content { flex: 1; min-width: 0; }
        .context-label { display: block; font-size: 12px; color: var(--accent); font-weight: 500; }
        .context-text { display: block; font-size: 12px; color: var(--text-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .context-bar > button { color: var(--text-3); padding: 4px; border-radius: var(--radius-sm); }
        .context-bar > button:hover { color: var(--text-0); background: var(--bg-3); }
        .chat-input-bar {
          display: flex; align-items: flex-end; gap: 10px;
          padding: 10px 14px;
          padding-bottom: max(10px, env(safe-area-inset-bottom, 0px));
          border-top: 1px solid var(--border);
          background: var(--bg-1); flex-shrink: 0;
        }
        .input-wrapper {
          flex: 1; background: var(--bg-3); border-radius: var(--radius-lg);
          border: 1px solid var(--border); transition: border-color var(--transition);
        }
        .input-wrapper:focus-within { border-color: var(--accent); }
        .input-wrapper textarea {
          width: 100%; padding: 11px 14px;
          font-size: 16px; line-height: 1.5; color: var(--text-0);
          max-height: 120px; overflow-y: auto; background: transparent;
          -webkit-text-size-adjust: 100%;
        }
        .input-wrapper textarea::placeholder { color: var(--text-3); }
        .send-btn {
          width: 42px; height: 42px; flex-shrink: 0;
          background: var(--accent); color: white;
          border-radius: 50%; display: flex; align-items: center;
          justify-content: center; transition: all var(--transition);
        }
        .send-btn.edit-mode { background: var(--green); }
        .send-btn:hover:not(:disabled) { filter: brightness(1.15); transform: scale(1.05); }
        .send-btn:disabled { opacity: 0.4; cursor: default; transform: none; }
        .attach-btn {
          width: 38px; height: 38px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          color: var(--text-2); border-radius: var(--radius-sm);
          transition: all var(--transition);
        }
        .attach-btn:hover { color: var(--text-0); background: var(--bg-3); }
        .attachment-preview {
          position: relative; padding: 8px 14px;
          border-top: 1px solid var(--border); background: var(--bg-2);
          flex-shrink: 0;
        }
        .attach-img-preview {
          max-height: 120px; max-width: 200px; border-radius: var(--radius);
          object-fit: cover;
        }
        .attach-file-preview {
          display: flex; align-items: center; gap: 8px;
          padding: 8px 12px; background: var(--bg-3);
          border-radius: var(--radius); font-size: 13px; color: var(--text-1);
          width: fit-content;
        }
        .attach-remove {
          position: absolute; top: 4px; right: 10px;
          width: 20px; height: 20px; border-radius: 50%;
          background: var(--bg-4); color: var(--text-2);
          display: flex; align-items: center; justify-content: center;
          transition: all var(--transition);
        }
        .attach-remove:hover { background: var(--red-dim); color: var(--red); }
        .spinner {
          width: 20px; height: 20px; border: 2px solid rgba(255,255,255,0.3);
          border-top-color: white; border-radius: 50%;
          animation: spin 0.6s linear infinite; display: inline-block;
        }
      `}</style>
    </div>
  );
}

async function buildEncryptedPayload(plaintext, participants, senderId) {
  const aesKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, new TextEncoder().encode(plaintext));
  const rawAesKey = await crypto.subtle.exportKey('raw', aesKey);
  const encryptedKeys = [];
  const seen = new Set();
  for (const p of participants) {
    const pid = String(p._id);
    if (seen.has(pid) || !p.publicKey) continue;
    try {
      const pubKey = await crypto.subtle.importKey('spki', b64ToBuf(p.publicKey), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
      const wrapped = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, pubKey, rawAesKey);
      encryptedKeys.push({ userId: pid, encryptedKey: bufToB64(wrapped) });
      seen.add(pid);
    } catch (err) {
      console.error(`[encrypt] Failed for ${p.username || pid}:`, err);
    }
  }
  if (encryptedKeys.length === 0) throw new Error('Could not encrypt for any participant');
  return { encryptedContent: bufToB64(ciphertext), iv: bufToB64(iv), encryptedKeys };
}

function groupByDate(messages) {
  const groups = [];
  let curDate = null, curMsgs = [];
  messages.forEach(msg => {
    const d = new Date(msg.createdAt);
    const label = isToday(d) ? 'Today' : isYesterday(d) ? 'Yesterday' : format(d, 'MMMM d, yyyy');
    if (label !== curDate) {
      if (curDate) groups.push({ date: curDate, msgs: curMsgs });
      curDate = label; curMsgs = [msg];
    } else curMsgs.push(msg);
  });
  if (curDate) groups.push({ date: curDate, msgs: curMsgs });
  return groups;
}
