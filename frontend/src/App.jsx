/**
 * SecureChat — End-to-End Encrypted Messaging
 * Copyright (c) 2026 Roman Parish
 * Licensed under the MIT License — see LICENSE file for details
 *
 * https://github.com/roman-parish/securechat
 */
import { useState, Component } from 'react';
import { ThemeProvider } from './contexts/ThemeContext.jsx';
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx';
import { SocketProvider } from './contexts/SocketContext.jsx';
import { ChatProvider } from './contexts/ChatContext.jsx';
import AuthPage from './components/AuthPage.jsx';
import ChatLayout from './components/ChatLayout.jsx';
import AdminPage from './components/AdminPage.jsx';

function AppInner() {
  const { user, loading } = useAuth();
  const [showAdmin, setShowAdmin] = useState(false);

  if (loading) return <SplashScreen />;
  if (!user) return <AuthPage />;

  // Check admin access
  const admins = (import.meta.env.VITE_ADMIN_USERNAMES || 'w5rcp')
    .split(',').map(u => u.trim().toLowerCase());
  const isAdmin = admins.includes(user.username?.toLowerCase());

  if (showAdmin && isAdmin) {
    return <AdminPage onBack={() => setShowAdmin(false)} />;
  }

  return (
    <SocketProvider>
      <ChatProvider>
        <ChatLayout onOpenAdmin={isAdmin ? () => setShowAdmin(true) : null} />
      </ChatProvider>
    </SocketProvider>
  );
}

// Shown after a page refresh — asks for password to restore keys into session
function KeyUnlockScreen() {
  const { user, unlockKeys, logout } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleUnlock = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await unlockKeys(password);
    } catch (err) {
      setError(err.message || 'Incorrect password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flex: 1, background: 'var(--bg-0)', padding: 24,
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Glow */}
      <div style={{
        position: 'absolute', width: 600, height: 600, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(108,99,255,0.12) 0%, transparent 70%)',
        top: '50%', left: '50%', transform: 'translate(-50%,-50%)', pointerEvents: 'none',
      }} />

      <div style={{
        width: '100%', maxWidth: 400, background: 'var(--bg-2)',
        border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)',
        padding: '40px 32px', position: 'relative', zIndex: 1,
        animation: 'slideUp 0.4s ease',
      }}>
        {/* Icon */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: 'rgba(108,99,255,0.12)', border: '1px solid rgba(108,99,255,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="11" width="18" height="11" rx="2" stroke="var(--accent)" strokeWidth="1.5"/>
              <path d="M7 11V7a5 5 0 0110 0v4" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round"/>
              <circle cx="12" cy="16.5" r="1.5" fill="var(--accent)"/>
            </svg>
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Unlock your messages</h2>
          <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
            Welcome back, <strong>{user?.displayName || user?.username}</strong>.<br/>
            Enter your password to decrypt your messages.
          </p>
        </div>

        {/* Why box */}
        <div style={{
          background: 'var(--bg-3)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', padding: '12px 14px',
          marginBottom: 24, fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6,
        }}>
          <strong style={{ color: 'var(--text-1)', display: 'block', marginBottom: 4 }}>
            Why do I need to do this?
          </strong>
          Your encryption keys are protected by your password. Each time you open the app,
          your password temporarily unlocks your keys in memory — they're never stored unprotected.
        </div>

        <form onSubmit={handleUnlock} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 500 }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Your account password"
              autoFocus
              required
              style={{
                background: 'var(--bg-3)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', padding: '12px 14px',
                fontSize: 16, color: 'var(--text-0)',
              }}
            />
          </div>

          {error && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--red-dim)', border: '1px solid rgba(255,87,87,0.2)',
              borderRadius: 'var(--radius)', padding: '10px 12px',
              fontSize: 13, color: 'var(--red)',
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="var(--red)" strokeWidth="1.5"/>
                <path d="M12 8v5M12 16.5v.5" stroke="var(--red)" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!password || loading}
            style={{
              background: 'var(--accent)', color: 'white',
              borderRadius: 'var(--radius)', padding: 13,
              fontSize: 16, fontWeight: 500,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: (!password || loading) ? 0.6 : 1,
              cursor: (!password || loading) ? 'default' : 'pointer',
              transition: 'all var(--transition)',
            }}
          >
            {loading
              ? <span style={{
                  width: 18, height: 18, border: '2px solid rgba(255,255,255,0.3)',
                  borderTopColor: 'white', borderRadius: '50%',
                  animation: 'spin 0.6s linear infinite', display: 'block',
                }} />
              : 'Unlock'
            }
          </button>
        </form>

        <button
          onClick={logout}
          style={{
            width: '100%', marginTop: 12, padding: '10px',
            fontSize: 13, color: 'var(--text-3)', textAlign: 'center',
          }}
        >
          Sign out instead
        </button>
      </div>
    </div>
  );
}

function SplashScreen() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flex: 1, background: 'var(--bg-1)',
    }}>
      <div style={{ textAlign: 'center' }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" style={{ margin: '0 auto', display: 'block' }}>
          <rect x="3" y="11" width="18" height="11" rx="2" stroke="var(--accent)" strokeWidth="1.5"/>
          <path d="M7 11V7a5 5 0 0110 0v4" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round"/>
          <circle cx="12" cy="16" r="1.5" fill="var(--accent)"/>
        </svg>
        <p style={{ color: 'var(--text-2)', marginTop: 16, fontSize: 14 }}>Loading SecureChat…</p>
      </div>
    </div>
  );
}

function reportError(payload) {
  try {
    navigator.sendBeacon('/api/errors', new Blob(
      [JSON.stringify({ ...payload, userAgent: navigator.userAgent })],
      { type: 'application/json' }
    ));
  } catch {
    // reporting must never throw
  }
}

// Global handlers for errors outside the React tree
if (typeof window !== 'undefined') {
  window.addEventListener('error', (e) => {
    reportError({ type: 'uncaught', message: e.message, stack: e.error?.stack, url: e.filename, line: e.lineno, col: e.colno });
  });
  window.addEventListener('unhandledrejection', (e) => {
    const msg = e.reason instanceof Error ? e.reason.message : String(e.reason);
    reportError({ type: 'unhandledrejection', message: msg, stack: e.reason?.stack });
  });
}

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(err) {
    return { error: err };
  }
  componentDidCatch(err, info) {
    reportError({
      type: 'react-error',
      message: err.message,
      stack: err.stack,
      componentStack: info?.componentStack,
      url: window.location.href,
    });
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flex: 1, background: 'var(--bg-0)', padding: 32, flexDirection: 'column', gap: 16,
        }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--red)', opacity: 0.7 }}>
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M12 8v5M12 16.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <div style={{ textAlign: 'center', maxWidth: 360 }}>
            <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-0)', marginBottom: 8 }}>
              Something went wrong
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 20, lineHeight: 1.6 }}>
              {this.state.error?.message || 'An unexpected error occurred.'}
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: 'var(--accent)', color: 'white', borderRadius: 'var(--radius)',
                padding: '10px 24px', fontSize: 14, fontWeight: 500,
              }}
            >
              Reload app
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ThemeProvider>
      <ErrorBoundary>
        <AuthProvider>
          <AppInner />
        </AuthProvider>
      </ErrorBoundary>
    </ThemeProvider>
  );
}
