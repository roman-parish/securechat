/**
 * SecureChat — End-to-End Encrypted Messaging
 * Copyright (c) 2026 Roman Parish
 * Licensed under the MIT License — see LICENSE file for details
 *
 * https://github.com/roman-parish/securechat
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { apiFetch } from '../utils/api.js';
import { decryptFile } from '../utils/crypto.js';

const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

function AttachmentView({ attachment, isOwn, onLightbox, encryptedKeys, currentUserId }) {
  const myKey = encryptedKeys?.find(k => String(k.userId) === String(currentUserId))?.encryptedKey;
  const decryptOpts = { encryptedKey: myKey, fileIv: attachment.fileIv, mimetype: attachment.mimetype, userId: currentUserId };
  const src = useAuthBlob(attachment.url, decryptOpts);
  if (attachment.mimetype?.startsWith('image/')) {
    return (
      <div className="msg-attachment">
        {src
          ? <img src={src} alt={attachment.originalName || 'image'} className="attach-img"
              onClick={e => { e.stopPropagation(); onLightbox(src); }} />
          : <div className="attach-img-placeholder" />
        }
      </div>
    );
  }
  if (attachment.mimetype?.startsWith('audio/')) {
    return (
      <div className="msg-attachment">
        <AudioPlayer url={src} isOwn={isOwn} />
      </div>
    );
  }
  return (
    <div className="msg-attachment">
      <a href={attachment.url} target="_blank" rel="noopener noreferrer" className="attach-file">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        <span>{attachment.originalName || 'Download file'}</span>
      </a>
    </div>
  );
}

function useAuthBlob(url, { encryptedKey, fileIv, mimetype, userId } = {}) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    if (!url) return;
    if (!url.startsWith('/api/uploads/secure/')) { setSrc(url); return; }
    let objectUrl;
    const token = localStorage.getItem('accessToken');
    fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => r.ok ? r.arrayBuffer() : null)
      .then(async (buf) => {
        if (!buf) return;
        let finalBuf = buf;
        if (encryptedKey && fileIv && userId) {
          try {
            finalBuf = await decryptFile(buf, fileIv, encryptedKey, userId);
          } catch {
            return;
          }
        } else {
          return;
        }
        objectUrl = URL.createObjectURL(new Blob([finalBuf], { type: mimetype || 'application/octet-stream' }));
        setSrc(objectUrl);
      })
      .catch(() => {});
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [url, encryptedKey, fileIv, mimetype, userId]);
  return src;
}

function AudioPlayer({ url, isOwn }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const toggle = useCallback((e) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) {
      audio.pause();
    } else {
      const p = audio.play();
      if (p !== undefined) p.catch(() => {});
    }
  }, []);

  const handleTimeUpdate = () => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    setCurrentTime(audio.currentTime);
    setProgress((audio.currentTime / audio.duration) * 100);
  };

  const handleLoadedMetadata = () => {
    const d = audioRef.current?.duration;
    if (d && isFinite(d)) setDuration(d);
  };

  const handleEnded = () => { setPlaying(false); setProgress(0); setCurrentTime(0); };

  const seek = (e) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    audio.currentTime = ratio * audio.duration;
  };

  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  if (!url) {
    return (
      <div className={`audio-player ${isOwn ? 'own' : ''}`} style={{ opacity: 0.4 }}>
        <button className="audio-play-btn" disabled>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M5 3l14 9-14 9V3z"/></svg>
        </button>
        <div className="audio-track"><div className="audio-track-fill" style={{ width: '0%' }} /></div>
        <span className="audio-time">—:——</span>
      </div>
    );
  }

  return (
    <div className={`audio-player ${isOwn ? 'own' : ''}`}>
      <audio
        ref={audioRef}
        src={url}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        preload="auto"
        playsInline
      />
      <button className="audio-play-btn" onClick={toggle}>
        {playing
          ? <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
          : <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M5 3l14 9-14 9V3z"/></svg>
        }
      </button>
      <div className="audio-track" onClick={seek}>
        <div className="audio-track-fill" style={{ width: `${progress}%` }} />
      </div>
      <span className="audio-time">{fmt(currentTime)}{duration ? ` / ${fmt(duration)}` : ''}</span>
    </div>
  );
}

function replyPreviewText(replyTo, plaintext) {
  const mt = replyTo.attachment?.mimetype || '';
  if (mt.startsWith('audio/')) return '🎤 Voice message';
  if (mt.startsWith('image/')) return '🖼 Image';
  if (mt) return '📎 Attachment';
  if (plaintext) return plaintext.length > 60 ? plaintext.slice(0, 60) + '…' : plaintext;
  return 'Message';
}

export default function MessageBubble({ msg, plaintext, replyPlaintext, isOwn, isConsecutive, onReply, onEdit, onDelete, currentUserId }) {
  const [lightbox, setLightbox] = useState(null);
  const [showActions, setShowActions] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const [swipeX, setSwipeX] = useState(0);
  const swipeStart = useRef(null);
  const rowRef = useRef(null);
  const pickerRef = useRef(null);
  const menuRef = useRef(null);

  // Close everything on outside tap
  useEffect(() => {
    if (!showActions && !showPicker && !showMenu) return;
    const handler = (e) => {
      if (rowRef.current?.contains(e.target)) return;
      setShowActions(false);
      setShowPicker(false);
      setShowMenu(false);
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [showActions, showPicker, showMenu]);

  const handleReact = async (emoji) => {
    setShowPicker(false);
    setShowActions(false);
    try {
      await apiFetch(`/messages/${msg._id}/react`, {
        method: 'POST',
        body: JSON.stringify({ emoji }),
      });
    } catch {}
  };

  const handleCopy = () => {
    if (!plaintext) return;
    navigator.clipboard.writeText(plaintext).then(() => {
      setCopied(true);
      setShowActions(false);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const SWIPE_THRESHOLD = 60;

  const handleTouchStart = (e) => {
    swipeStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    setSwipeX(0);
  };

  const handleTouchMove = (e) => {
    if (!swipeStart.current) return;
    const dx = e.touches[0].clientX - swipeStart.current.x;
    const dy = e.touches[0].clientY - swipeStart.current.y;
    // Only track horizontal swipes — ignore if mostly vertical (scrolling)
    if (Math.abs(dy) > Math.abs(dx)) return;
    if (dx > 0) {
      e.preventDefault();
      setSwipeX(Math.min(dx, SWIPE_THRESHOLD + 10));
    }
  };

  const handleTouchEnd = () => {
    if (swipeX >= SWIPE_THRESHOLD) {
      onReply?.();
    }
    setSwipeX(0);
    swipeStart.current = null;
  };

  const handleBubbleTap = (e) => {
    if (isDeleted) return;
    e.stopPropagation();
    // Toggle action bar — tap again to dismiss
    setShowActions(s => !s);
    setShowPicker(false);
    setShowMenu(false);
  };

  // Grouped reactions: emoji → { count, mine }
  const grouped = (msg.reactions || []).reduce((acc, r) => {
    if (!acc[r.emoji]) acc[r.emoji] = { count: 0, mine: false };
    acc[r.emoji].count++;
    if (String(r.userId) === String(currentUserId)) acc[r.emoji].mine = true;
    return acc;
  }, {});

  const isDeleted = msg.type === 'deleted';
  const isDecrypting = !isDeleted && plaintext === undefined;
  const failed = plaintext === '[Unable to decrypt]' || plaintext === '[Not encrypted for this device]';
  const canEdit = isOwn && !isDeleted && plaintext && !failed && (Date.now() - new Date(msg.createdAt).getTime() < 15 * 60 * 1000);

  return (
    <div
      ref={rowRef}
      className={`msg-row ${isOwn ? 'own' : ''} ${isConsecutive ? 'consecutive' : ''}`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {!isOwn && !isConsecutive && (
        <div className="msg-sender-name">{msg.sender?.displayName || msg.sender?.username}</div>
      )}

      {swipeX > 10 && (
        <div className="swipe-reply-icon" style={{ opacity: Math.min(swipeX / SWIPE_THRESHOLD, 1) }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M3 10h13a5 5 0 0 1 0 10H3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M7 6L3 10l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      )}
      <div className="msg-group" style={swipeX > 0 ? { transform: `translateX(${swipeX}px)`, transition: 'none' } : { transition: 'transform 0.2s ease' }}>

        {/* Inline action bar — appears on tap, floats above bubble */}
        {showActions && !isDeleted && (
          <div className={`msg-action-bar ${isOwn ? 'own' : ''}`}>
            <button className="act-btn" onClick={() => { setShowActions(false); setShowPicker(p => !p); }} title="React">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M8 14s1.5 2 4 2 4-2 4-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <circle cx="9" cy="10" r="1" fill="currentColor"/>
                <circle cx="15" cy="10" r="1" fill="currentColor"/>
              </svg>
            </button>
            <button className="act-btn" onClick={() => { setShowActions(false); onReply?.(); }} title="Reply">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M3 10h13a5 5 0 0 1 0 10H3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M7 6L3 10l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            {plaintext && !isDeleted && (
              <button className="act-btn" onClick={handleCopy} title="Copy">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="currentColor" strokeWidth="1.5"/>
                </svg>
              </button>
            )}
            {canEdit && (
              <button className="act-btn" onClick={() => { setShowActions(false); onEdit?.(msg); }} title="Edit">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            )}
            {isOwn && (
              <button className="act-btn danger" onClick={() => { setShowActions(false); onDelete?.(msg, true); }} title="Delete for everyone">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            )}
            {!isOwn && (
              <button className="act-btn danger" onClick={() => { setShowActions(false); onDelete?.(msg, false); }} title="Delete for me">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            )}
          </div>
        )}

        {/* Reaction picker */}
        {showPicker && (
          <div className={`reaction-picker ${isOwn ? 'own' : ''}`} ref={pickerRef}>
            {REACTIONS.map(emoji => (
              <button key={emoji} className="picker-btn" onClick={() => handleReact(emoji)}>{emoji}</button>
            ))}
          </div>
        )}

        {/* Bubble */}
        <div
          className={`bubble ${isOwn ? 'own' : ''} ${failed ? 'failed' : ''} ${isDeleted ? 'deleted' : ''} ${showActions ? 'active' : ''}`}
          onClick={handleBubbleTap}
        >
          {isDeleted ? (
            <p className="deleted-text">🗑 Message deleted</p>
          ) : isDecrypting ? (
            <div className="decrypting">
              <span className="decrypt-dots"><span /><span /><span /></span>
            </div>
          ) : (
            <>
              {msg.replyTo && (
                <div className="reply-preview-bubble">
                  <div className="reply-bar-inner" />
                  <div>
                    <span className="reply-author">{msg.replyTo.sender?.displayName || msg.replyTo.sender?.username || 'Someone'}</span>
                    <span className="reply-text">{replyPreviewText(msg.replyTo, replyPlaintext)}</span>
                  </div>
                </div>
              )}
              {msg.attachment && (
                <AttachmentView
                  attachment={msg.attachment}
                  isOwn={isOwn}
                  onLightbox={setLightbox}
                  encryptedKeys={msg.encryptedKeys}
                  currentUserId={currentUserId}
                />
              )}
              {plaintext && plaintext !== '📎' && plaintext !== '🎤' && <p className="msg-text">{plaintext}</p>}
              <div className="msg-meta">
                {msg.editedAt && <span className="edited-tag">edited</span>}
                <span className="msg-time">{format(new Date(msg.createdAt), 'h:mm a')}</span>
                {isOwn && (() => {
                  const isRead = msg.readBy?.length > 1;
                  const isDelivered = msg.deliveredTo?.length > 0;
                  const color = isRead
                    ? 'rgba(255,255,255,0.95)'
                    : isDelivered
                      ? 'rgba(255,255,255,0.55)'
                      : 'rgba(255,255,255,0.35)';
                  return (
                    <svg width="15" height="10" viewBox="0 0 15 10" fill="none" style={{ color }}>
                      {(isRead || isDelivered) ? (
                        <>
                          <path d="M1 5L4 8.5L9.5 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M5.5 5L8.5 8.5L14 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </>
                      ) : (
                        <path d="M1 5L4 8.5L9.5 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      )}
                    </svg>
                  );
                })()}
              </div>
            </>
          )}
        </div>

        {/* Reactions */}
        {Object.keys(grouped).length > 0 && (
          <div className={`reactions ${isOwn ? 'own' : ''}`}>
            {Object.entries(grouped).map(([emoji, { count, mine }]) => (
              <button
                key={emoji}
                className={`reaction-chip ${mine ? 'mine' : ''}`}
                onClick={() => handleReact(emoji)}
              >
                {emoji}{count > 1 && <span className="reaction-count">{count}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {lightbox && (
        <div className="lightbox-overlay" onClick={() => setLightbox(null)}>
          <button className="lightbox-back" onClick={() => setLightbox(null)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Back
          </button>
          <img
            src={lightbox}
            className="lightbox-img"
            onClick={e => e.stopPropagation()}
          />
          <a
            href={lightbox}
            download
            className="lightbox-download"
            onClick={e => e.stopPropagation()}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <polyline points="7 10 12 15 17 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            Save Image
          </a>
        </div>
      )}

      {copied && <div className="copied-toast">Copied!</div>}

      <style>{`
        .swipe-reply-icon {
          position: absolute; left: 4px; top: 50%; transform: translateY(-50%);
          color: var(--accent); pointer-events: none; z-index: 5;
        }
        .copied-toast {
          position: absolute; top: -28px; left: 50%; transform: translateX(-50%);
          background: var(--bg-4); color: var(--text-0); font-size: 11px; font-weight: 500;
          padding: 4px 10px; border-radius: 10px; pointer-events: none;
          animation: fadeIn 0.1s ease;
          white-space: nowrap; z-index: 20;
        }
        .msg-row {
          display: flex; flex-direction: column;
          padding: 2px 16px; position: relative;
        }
        .msg-row:not(.consecutive) { margin-top: 12px; }
        .msg-row.own { align-items: flex-end; }
        .msg-sender-name { font-size: 11px; color: var(--text-3); margin-bottom: 3px; margin-left: 4px; }
        .msg-group {
          position: relative; display: flex; flex-direction: column;
          max-width: min(72%, 480px);
        }
        .msg-row.own .msg-group { align-items: flex-end; }

        /* Inline action bar */
        .msg-action-bar {
          display: flex; align-items: center; gap: 2px;
          background: var(--bg-2); border: 1px solid var(--border-strong);
          border-radius: var(--radius-lg); padding: 4px 6px;
          box-shadow: var(--shadow);
          margin-bottom: 6px;
          align-self: flex-start;
          animation: slideUp 0.12s ease;
          z-index: 10;
        }
        .msg-action-bar.own { align-self: flex-end; }
        .act-btn {
          width: 34px; height: 34px; border-radius: var(--radius-sm);
          display: flex; align-items: center; justify-content: center;
          color: var(--text-2); transition: all var(--transition);
        }
        .act-btn:hover, .act-btn:active { background: var(--bg-4); color: var(--text-0); }
        .act-btn.danger { color: var(--red); }
        .act-btn.danger:hover, .act-btn.danger:active { background: var(--red-dim); }

        /* Reaction picker */
        .reaction-picker {
          position: absolute; bottom: calc(100% + 6px); left: 0; z-index: 20;
          background: var(--bg-2); border: 1px solid var(--border-strong);
          border-radius: var(--radius-lg); padding: 7px 9px;
          display: flex; gap: 4px; box-shadow: var(--shadow);
          animation: slideUp 0.15s ease;
        }
        .reaction-picker.own { left: auto; right: 0; }
        .picker-btn {
          font-size: 20px; width: 36px; height: 36px;
          border-radius: var(--radius-sm); transition: all var(--transition);
          display: flex; align-items: center; justify-content: center;
        }
        .picker-btn:hover, .picker-btn:active { background: var(--bg-4); transform: scale(1.2); }

        /* Bubble */
        .bubble {
          background: var(--bg-3); border-radius: var(--radius-lg);
          padding: 9px 13px; max-width: 100%;
          border: 1px solid var(--border); position: relative; cursor: pointer;
          transition: filter var(--transition);
          -webkit-user-select: none; user-select: none;
        }
        .bubble.own { background: var(--accent); border-color: transparent; }
        .bubble.failed { opacity: 0.5; }
        .bubble.deleted {
          background: transparent; border: 1px solid var(--border);
          opacity: 0.6; cursor: default;
        }
        .bubble.own.deleted { background: transparent; border-color: rgba(255,255,255,0.2); }
        .bubble.active { filter: brightness(1.12); }
        .bubble.own.active { filter: brightness(1.1); }
        .deleted-text { font-size: 14px; color: var(--text-3); font-style: italic; }
        .msg-text {
          font-size: 15px; line-height: 1.5;
          white-space: pre-wrap; word-break: break-word; color: var(--text-0);
          -webkit-user-select: text; user-select: text;
        }
        .bubble.own .msg-text { color: white; }
        .msg-meta { display: flex; align-items: center; gap: 4px; justify-content: flex-end; margin-top: 3px; }
        .msg-time { font-size: 11px; color: rgba(255,255,255,0.45); }
        .bubble:not(.own) .msg-time { color: var(--text-3); }
        .edited-tag { font-size: 10px; color: rgba(255,255,255,0.4); font-style: italic; }
        .bubble:not(.own) .edited-tag { color: var(--text-3); }
        .decrypting { display: flex; align-items: center; justify-content: center; padding: 4px; }
        .decrypt-dots { display: flex; gap: 4px; }
        .decrypt-dots span {
          width: 6px; height: 6px; background: var(--text-3); border-radius: 50%;
          animation: pulse 1.2s infinite;
        }
        .decrypt-dots span:nth-child(2) { animation-delay: 0.2s; }
        .decrypt-dots span:nth-child(3) { animation-delay: 0.4s; }
        .reply-preview-bubble {
          display: flex; gap: 8px; margin-bottom: 7px;
          background: rgba(0,0,0,0.15); border-radius: var(--radius-sm); padding: 5px 8px;
        }
        .reply-bar-inner { width: 2px; background: rgba(255,255,255,0.35); border-radius: 2px; flex-shrink: 0; }
        .reply-author { display: block; font-size: 11px; opacity: 0.7; font-weight: 500; }
        .reply-text { display: block; font-size: 12px; opacity: 0.55; }
        .reactions { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 5px; }
        .reactions.own { justify-content: flex-end; }
        .reaction-chip {
          background: var(--bg-3); border: 1px solid var(--border-strong);
          border-radius: var(--radius-full); padding: 3px 8px;
          font-size: 14px; display: flex; align-items: center; gap: 4px;
          transition: all var(--transition); cursor: pointer;
        }
        .reaction-chip:hover { background: var(--bg-4); border-color: var(--accent); }
        .reaction-chip.mine { background: var(--accent-dim); border-color: var(--accent); }
        .reaction-count { font-size: 11px; color: var(--text-2); font-weight: 500; }
        .reaction-chip.mine .reaction-count { color: var(--accent-light); }
        .lightbox-overlay {
          position: fixed; inset: 0; z-index: 200;
          background: rgba(0,0,0,0.95);
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          overflow: auto;
          animation: fadeIn 0.15s ease;
          -webkit-overflow-scrolling: touch;
        }
        .lightbox-back {
          position: absolute; top: max(16px, env(safe-area-inset-top, 16px)); left: 16px;
          display: flex; align-items: center; gap: 8px;
          color: white; font-size: 15px; font-weight: 500;
          background: rgba(255,255,255,0.15); border-radius: var(--radius);
          padding: 8px 14px; backdrop-filter: blur(10px);
          transition: background var(--transition);
        }
        .lightbox-back:hover { background: rgba(255,255,255,0.25); }
        .lightbox-img {
          max-width: min(100vw, 100%);
          max-height: calc(100dvh - 120px);
          width: auto; height: auto;
          object-fit: contain;
          display: block;
          /* Show at natural resolution — no upscaling beyond original size */
          image-rendering: auto;
        }
        .lightbox-download {
          position: absolute; bottom: max(24px, env(safe-area-inset-bottom, 24px)); 
          display: flex; align-items: center; gap: 8px;
          color: white; font-size: 14px; font-weight: 500;
          background: rgba(255,255,255,0.15); border-radius: var(--radius);
          padding: 10px 20px; backdrop-filter: blur(10px);
          transition: background var(--transition);
        }
        .lightbox-download:hover { background: rgba(255,255,255,0.25); }
        .msg-attachment { margin-bottom: 6px; }
        .attach-img {
          max-width: 180px; max-height: 200px; border-radius: var(--radius);
          display: block; object-fit: contain; cursor: pointer;
          background: rgba(0,0,0,0.1);
          transition: opacity var(--transition);
        }
        .attach-img:hover { opacity: 0.85; }
        .attach-img-placeholder {
          width: 180px; height: 200px; border-radius: var(--radius);
          background: rgba(0,0,0,0.15); animation: pulse 1.5s infinite;
        }
        .attach-file {
          display: flex; align-items: center; gap: 6px;
          padding: 6px 10px; background: rgba(0,0,0,0.15);
          border-radius: var(--radius-sm); font-size: 13px;
          color: inherit; text-decoration: none;
          transition: background var(--transition);
        }
        .attach-file:hover { background: rgba(0,0,0,0.25); }
        .attach-file span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 160px; }
        .audio-player {
          display: flex; align-items: center; gap: 8px;
          padding: 4px 0; min-width: 180px;
        }
        .audio-play-btn {
          width: 32px; height: 32px; flex-shrink: 0; border-radius: 50%;
          background: rgba(255,255,255,0.2);
          display: flex; align-items: center; justify-content: center;
          color: white; transition: background var(--transition);
        }
        .audio-player:not(.own) .audio-play-btn { background: var(--bg-4); color: var(--text-0); }
        .audio-play-btn:hover { background: rgba(255,255,255,0.35); }
        .audio-player:not(.own) .audio-play-btn:hover { background: var(--bg-5, var(--bg-4)); }
        .audio-track {
          flex: 1; height: 4px; background: rgba(255,255,255,0.25);
          border-radius: 2px; cursor: pointer; position: relative;
        }
        .audio-player:not(.own) .audio-track { background: var(--border-strong); }
        .audio-track-fill {
          height: 100%; border-radius: 2px; background: white;
          transition: width 0.1s linear;
        }
        .audio-player:not(.own) .audio-track-fill { background: var(--accent); }
        .audio-time {
          font-size: 11px; color: rgba(255,255,255,0.7);
          white-space: nowrap; font-variant-numeric: tabular-nums;
        }
        .audio-player:not(.own) .audio-time { color: var(--text-3); }
      `}</style>
    </div>
  );
}
