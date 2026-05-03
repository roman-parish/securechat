/**
 * SecureChat — End-to-End Encrypted Messaging
 * Copyright (c) 2026 Roman Parish
 * Licensed under the MIT License — see LICENSE file for details
 *
 * https://github.com/roman-parish/securechat
 */
import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useSocket } from './SocketContext.jsx';
import { useAuth } from './AuthContext.jsx';
import { apiFetch } from '../utils/api.js';

const ChatContext = createContext(null);

export function ChatProvider({ children }) {
  const { socket } = useSocket();
  const { user: authUser, setUser: setAuthUser } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [archivedConversations, setArchivedConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const [onlineListLoaded, setOnlineListLoaded] = useState(false);
  const [typingMap, setTypingMap] = useState({}); // convId -> [usernames]
  const [unreadCounts, setUnreadCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [invitations, setInvitations] = useState([]);
  const activeConvRef = useRef(null);

  useEffect(() => { activeConvRef.current = activeConversationId; }, [activeConversationId]);

  // Tab title unread count
  useEffect(() => {
    const total = Object.values(unreadCounts).reduce((a, b) => a + b, 0);
    document.title = total > 0 ? `(${total}) SecureChat` : 'SecureChat';
  }, [unreadCounts]);

  const loadConversations = useCallback(async () => {
    try {
      const [active, archived] = await Promise.all([
        apiFetch('/conversations'),
        apiFetch('/conversations?archived=true'),
      ]);
      setConversations(active);
      setArchivedConversations(archived);
    } catch (err) {
      console.error('Failed to load conversations:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadInvitations = useCallback(async () => {
    try {
      const data = await apiFetch('/conversations/invitations');
      setInvitations(data || []);
    } catch {
      // non-critical — ignore
    }
  }, []);

  useEffect(() => { loadConversations(); loadInvitations(); }, [loadConversations, loadInvitations]);

  useEffect(() => {
    if (!socket) return;

    const onUsersOnlineList = ({ userIds }) => {
      setOnlineUsers(new Set(userIds.map(String)));
      setOnlineListLoaded(true);
    };

    const onUserOnline = ({ userId }) =>
      setOnlineUsers(prev => new Set([...prev, String(userId)]));

    const onUserOffline = ({ userId, lastSeen }) => {
      setOnlineUsers(prev => { const n = new Set(prev); n.delete(String(userId)); return n; });
      // Persist lastSeen on conversation participants so the UI can show "last seen X ago"
      if (lastSeen) {
        setConversations(prev => prev.map(conv => ({
          ...conv,
          participants: conv.participants?.map(p =>
            String(p._id) === String(userId) ? { ...p, lastSeen } : p
          ),
        })));
      }
    };

    const onConversationNew = (conv) =>
      setConversations(prev => [conv, ...prev.filter(c => String(c._id) !== String(conv._id))]);

    const onConversationUpdated = (conv) =>
      setConversations(prev => prev.map(c => String(c._id) === String(conv._id) ? { ...c, ...conv } : c));

    const onConversationRemoved = ({ conversationId }) =>
      setConversations(prev => prev.filter(c => String(c._id) !== String(conversationId)));

    const onUserUpdated = (updatedUser) => {
      const uid = String(updatedUser._id);
      if (authUser && String(authUser._id) === uid) {
        setAuthUser(prev => ({ ...prev, ...updatedUser }));
      }
      setConversations(prev => prev.map(conv => ({
        ...conv,
        participants: conv.participants?.map(p =>
          String(p._id) === uid ? { ...p, ...updatedUser } : p
        ),
      })));
    };

    const onMessageNew = (message) => {
      const msgConvId = String(message.conversationId);

      // Move out of archive if it was archived — new message unarchives it
      setArchivedConversations(prev => {
        const archivedConv = prev.find(c => String(c._id) === msgConvId);
        if (archivedConv) {
          const updated = { ...archivedConv, lastMessage: message, lastActivity: message.createdAt };
          setConversations(p =>
            p.some(c => String(c._id) === msgConvId) ? p
              : [updated, ...p].sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity))
          );
          return prev.filter(c => String(c._id) !== msgConvId);
        }
        return prev;
      });

      setConversations(prev => {
        const exists = prev.some(c => String(c._id) === msgConvId);
        if (!exists) {
          apiFetch(`/conversations/${msgConvId}`)
            .then(conv => setConversations(p =>
              p.some(c => String(c._id) === msgConvId) ? p
                : [{ ...conv, lastMessage: message, lastActivity: message.createdAt }, ...p]
            )).catch(() => {});
          return prev;
        }
        return prev.map(conv =>
          String(conv._id) === msgConvId
            ? { ...conv, lastMessage: message, lastActivity: message.createdAt }
            : conv
        ).sort((a, b) => new Date(b.lastActivity || b.updatedAt) - new Date(a.lastActivity || a.updatedAt));
      });
      if (msgConvId !== String(activeConvRef.current)) {
        setUnreadCounts(prev => ({ ...prev, [msgConvId]: (prev[msgConvId] || 0) + 1 }));
      }
    };

    // Typing indicators in sidebar
    const onTypingStart = ({ conversationId, userId, username }) => {
      const cid = String(conversationId);
      setTypingMap(prev => ({
        ...prev,
        [cid]: [...(prev[cid] || []).filter(u => u.username !== username), { userId, username }],
      }));
    };
    const onTypingStop = ({ conversationId, userId }) => {
      const cid = String(conversationId);
      setTypingMap(prev => ({
        ...prev,
        [cid]: (prev[cid] || []).filter(u => String(u.userId) !== String(userId)),
      }));
    };

    const onInvitationNew = (inv) => {
      setInvitations(prev => [...prev.filter(i => String(i._id) !== String(inv._id)), inv]);
    };

    const onConnect = () => {
      setOnlineListLoaded(false);
      // Fallback: if online list doesn't arrive within 5s, mark as loaded anyway
      // so the UI doesn't get stuck showing "E2E Encrypted" forever
      setTimeout(() => setOnlineListLoaded(prev => { return true; }), 5000);
    };

    socket.on('connect', onConnect);
    socket.on('invitation:new', onInvitationNew);
    socket.on('users:online-list', onUsersOnlineList);
    socket.on('user:online', onUserOnline);
    socket.on('user:offline', onUserOffline);
    socket.on('conversation:new', onConversationNew);
    socket.on('conversation:updated', onConversationUpdated);
    socket.on('conversation:removed', onConversationRemoved);
    socket.on('user:updated', onUserUpdated);
    socket.on('message:new', onMessageNew);
    socket.on('typing:start', onTypingStart);
    socket.on('typing:stop', onTypingStop);

    return () => {
      socket.off('connect', onConnect);
      socket.off('invitation:new', onInvitationNew);
      socket.off('users:online-list', onUsersOnlineList);
      socket.off('user:online', onUserOnline);
      socket.off('user:offline', onUserOffline);
      socket.off('conversation:new', onConversationNew);
      socket.off('conversation:updated', onConversationUpdated);
      socket.off('conversation:removed', onConversationRemoved);
      socket.off('user:updated', onUserUpdated);
      socket.off('message:new', onMessageNew);
      socket.off('typing:start', onTypingStart);
      socket.off('typing:stop', onTypingStop);
    };
  }, [socket, authUser, setAuthUser]);

  const updateConversation = useCallback((id, updater) => {
    setConversations(prev => prev.map(c => String(c._id) === String(id) ? updater(c) : c));
  }, []);

  const removeConversation = useCallback(async (id) => {
    const strId = String(id);
    try {
      await apiFetch(`/conversations/${strId}`, { method: 'DELETE' });
      setConversations(prev => prev.filter(c => String(c._id) !== strId));
      setUnreadCounts(prev => { const n = { ...prev }; delete n[strId]; return n; });
    } catch (err) {
      console.error('Failed to remove conversation:', err);
    }
  }, []);

  const setActiveConversation = useCallback((id) => {
    const strId = id ? String(id) : null;
    setActiveConversationId(strId);
    if (strId) setUnreadCounts(prev => ({ ...prev, [strId]: 0 }));
  }, []);

  const addConversation = useCallback((conv) =>
    setConversations(prev => [conv, ...prev.filter(c => String(c._id) !== String(conv._id))]),
  []);

  const removeInvitation = useCallback((invId) =>
    setInvitations(prev => prev.filter(i => String(i._id) !== String(invId))),
  []);

  const archiveConversation = useCallback(async (id) => {
    const strId = String(id);
    try {
      await apiFetch(`/conversations/${strId}/archive`, { method: 'POST' });
      setConversations(prev => {
        const conv = prev.find(c => String(c._id) === strId);
        if (conv) setArchivedConversations(p => [conv, ...p]);
        return prev.filter(c => String(c._id) !== strId);
      });
    } catch (err) {
      console.error('Failed to archive conversation:', err);
    }
  }, []);

  const unarchiveConversation = useCallback(async (id) => {
    const strId = String(id);
    try {
      await apiFetch(`/conversations/${strId}/unarchive`, { method: 'POST' });
      setArchivedConversations(prev => {
        const conv = prev.find(c => String(c._id) === strId);
        if (conv) setConversations(p => [conv, ...p]);
        return prev.filter(c => String(c._id) !== strId);
      });
    } catch (err) {
      console.error('Failed to unarchive conversation:', err);
    }
  }, []);

  const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0);

  return (
    <ChatContext.Provider value={{
      conversations, archivedConversations, activeConversationId, setActiveConversation,
      onlineUsers, onlineListLoaded, typingMap, unreadCounts, totalUnread, loading,
      loadConversations, addConversation, removeConversation, updateConversation,
      archiveConversation, unarchiveConversation,
      invitations, removeInvitation,
    }}>
      {children}
    </ChatContext.Provider>
  );
}

export const useChat = () => useContext(ChatContext);
