/**
 * SecureChat — End-to-End Encrypted Messaging
 * Copyright (c) 2026 Roman Parish
 * Licensed under the MIT License — see LICENSE file for details
 *
 * https://github.com/w5rcp-romanparish/securechat
 */
import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext.jsx';
import { getAccessToken } from '../utils/api.js';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { user } = useAuth();
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);

  const connect = useCallback(() => {
    if (!user) return;
    const token = getAccessToken();
    if (!token) return;

    // Don't create duplicate connections
    if (socketRef.current?.connected) return;

    const s = io(window.location.origin, {
      path: '/ws',
      auth: { token },
      // Allow both polling and websocket — critical for iOS Safari compatibility
      transports: ['polling', 'websocket'],
      upgrade: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      timeout: 20000,
    });

    s.on('connect', () => {
      console.log('[socket] Connected:', s.id);
      setConnected(true);
      // Tell server our current visibility state immediately on connect
      s.emit(document.visibilityState === 'visible' ? 'app:foreground' : 'app:background');
    });

    s.on('disconnect', (reason) => {
      console.log('[socket] Disconnected:', reason);
      setConnected(false);
      // If server closed connection, manually reconnect
      if (reason === 'io server disconnect') {
        s.connect();
      }
    });

    s.on('connect_error', (err) => {
      console.error('[socket] Connection error:', err.message);
      setConnected(false);
    });

    socketRef.current = s;
    setSocket(s);
  }, [user]);

  useEffect(() => {
    if (!user) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setSocket(null);
        setConnected(false);
      }
      return;
    }

    connect();

    // iOS Safari: reconnect + notify server of visibility state
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (!socketRef.current?.connected) {
          console.log('[socket] Page visible, reconnecting...');
          connect();
        } else {
          socketRef.current.emit('app:foreground');
        }
      } else {
        // App going to background — tell server so it knows to push instead of socket
        socketRef.current?.emit('app:background');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Emit initial visibility state
    if (socketRef.current?.connected) {
      socketRef.current.emit(
        document.visibilityState === 'visible' ? 'app:foreground' : 'app:background'
      );
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setSocket(null);
        setConnected(false);
      }
    };
  }, [user, connect]);

  return (
    <SocketContext.Provider value={{ socket, connected }}>
      {children}
    </SocketContext.Provider>
  );
}

export const useSocket = () => useContext(SocketContext);
