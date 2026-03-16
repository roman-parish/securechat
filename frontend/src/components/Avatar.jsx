/**
 * SecureChat — End-to-End Encrypted Messaging
 * Copyright (c) 2026 Roman Parish
 * Licensed under the MIT License — see LICENSE file for details
 *
 * https://github.com/roman-parish/securechat
 */
export default function Avatar({ user, size = 36, showOnline = false, onlineState = null }) {
  const initials = user
    ? (user.displayName || user.username || '?').slice(0, 2).toUpperCase()
    : '?';

  const colors = [
    ['#6c63ff', '#4d44e0'],
    ['#3dd68c', '#22b86b'],
    ['#ff6b6b', '#e04f4f'],
    ['#ffd166', '#e0b44f'],
    ['#06d6a0', '#05b387'],
    ['#ef476f', '#c93258'],
  ];

  const colorIdx = user
    ? (user.username || '').charCodeAt(0) % colors.length
    : 0;
  const [from, to] = colors[colorIdx];

  return (
    <div style={{ position: 'relative', flexShrink: 0, width: size, height: size }}>
      {user?.avatar ? (
        <img
          src={user.avatar}
          alt={initials}
          style={{
            width: size, height: size,
            borderRadius: '50%', objectFit: 'cover',
          }}
        />
      ) : (
        <div style={{
          width: size, height: size, borderRadius: '50%',
          background: `linear-gradient(135deg, ${from}, ${to})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: size * 0.36, fontWeight: 600, color: 'white',
          flexShrink: 0,
        }}>
          {initials}
        </div>
      )}
      {(showOnline || onlineState !== null) && (
        <div style={{
          position: 'absolute', bottom: 0, right: 0,
          width: size * 0.28, height: size * 0.28,
          background: (showOnline || onlineState === true) ? 'var(--green)' : 'var(--text-3)',
          borderRadius: '50%',
          border: '2px solid var(--bg-1)',
        }} />
      )}
    </div>
  );
}
