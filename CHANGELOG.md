# Changelog

## [1.2.1] — 2026-05-03

### Bug Fixes

- **Admin panel data not loading** — `ADMIN_USERNAMES` was passed as a frontend build arg but not to the backend container, causing all admin API calls to return 403. The env var is now correctly passed to both services in `docker-compose.yml`.

---

## [1.2.0] — 2026-05-03

### New Features

- **Two-factor authentication (TOTP)** — users can enable 2FA via any authenticator app; setup flow generates a QR code, confirms with a live code, and stores 10 one-time recovery codes
- **2FA recovery codes** — 10 single-use recovery codes generated on activation; regenerate from the Security tab at any time
- **Trusted devices** — "Trust this device for 30 days" checkbox on the 2FA login screen skips the 2FA prompt for that device
- **Self-serve password reset** — "Forgot password?" link sends a time-limited reset link via email
- **Email notifications via Resend** — login from a new device, password changed, account deleted, 2FA disabled, invite link delivery
- **Conversation archive** — archive any conversation to hide it from the main list; auto-unarchives when a new message arrives
- **User blocking** — block users from the conversation menu; blocked users cannot send messages and are hidden from search; manage from the Security tab in profile settings
- **Registration control** — admin toggle to open or close new user registration without redeploying
- **Time-limited invite links** — generate single-use invite links with configurable expiry (24h – 30 days); optionally email them; revoke at any time; registration can be closed while still accepting invited users
- **Admin audit log** — full log of all admin actions: bans, deletions, password resets, 2FA resets, invite create/revoke, and registration toggle changes
- **Admin 2FA reset** — admins can reset 2FA for a locked-out user from the admin panel
- **2FA status column** — admin user table now shows whether each user has 2FA enabled

### Security

- 2FA enforcement on sensitive actions — password change and account deletion require TOTP verification when 2FA is enabled
- Block enforcement at the API level — blocked users receive a 403 on message send regardless of client state
- Invite token hashing — invite tokens stored as SHA-256 hashes; plaintext only returned once at creation
- Single-use invite enforcement — tokens invalidated immediately after successful registration

### Bug Fixes & Polish

- Forgot password screen now matches the login screen look and feel
- 2FA trust-device checkbox no longer overflows outside the auth card
- Invite button and expiry dropdown in admin panel now match app styling
- Configurable from address for emails via `EMAIL_FROM` environment variable

---

## [1.1.0] — 2026-04-25

### New Features

- **End-to-end encrypted voice messages** — record and send voice clips directly from the chat input; audio is AES-256-GCM encrypted before upload
- **End-to-end encrypted file and image attachments** — files are encrypted client-side before upload and decrypted on display; attachment URLs are auth-protected with no public access
- **Paste to attach** — paste an image from the clipboard directly into the chat input
- **Swipe to reply on mobile** — swipe right on any message to trigger a reply
- **Group invitations** — invite users to a group with an accept/decline flow instead of adding them directly
- **Conversation muting** — mute individual conversations with push notification suppression
- **Delivery receipts** — messages now show sent, delivered, and read tick states
- **Server-side message search** — search by sender or attachment filename with jump-to-message
- **Unread jump button** — scroll button shows unread count and jumps to first unread message on tap
- **User self-deletion** — users can permanently delete their account and all associated data from the Security tab (GDPR compliant), confirmed with password
- **Last seen timestamps** — shows when a user was last online when they are offline
- **Online member count** — group chat header shows how many members are currently online
- **Let's Encrypt SSL** — automatic HTTPS via Let's Encrypt with setup script support

### Security & Infrastructure

- Content Security Policy headers via nginx and Helmet
- Brute force protection on login and register endpoints
- Refresh token reuse detection — invalidates all sessions on reuse attempt
- Auth-protected file downloads — uploaded files served through authenticated API route, not public paths
- Rate limiting improvements — higher limits for general use, exemptions for file downloads
- Socket.IO Redis adapter — enables multi-instance horizontal scaling
- Backend healthcheck — nginx waits for backend to be healthy before accepting traffic
- Structured logging with pino — request ID, userId, and conversationId in log context
- Environment variable validation on startup — readable errors for missing config

### Bug Fixes & Polish

- Consistent message bubble spacing across all message types (text, image, audio, file, reply, deleted)
- Scroll-to-bottom reliability completely overhauled — fixes on conversation load, after send, and after encrypted blobs finish decrypting (desktop and iOS)
- Audio player iOS fixes — `playsInline`, `preload=auto`, Promise-based play handling
- Reply preview now shows correct sender name and message content
- Group admin safety — cannot remove the last admin from a group
- Duplicate participant prevention when adding users to a group
- Receiving a message in another conversation no longer reloads the active chat
- Fixed undefined sender name in conversation preview
- Conversation list no longer shows image/voice labels — shows unread count only

### Developer Experience

- Integration tests with vitest + supertest + mongodb-memory-server
- CI runs full test suite before deploying
- Client-side error reporting to backend via `POST /api/errors`
- File upload size and type validation on the client before upload attempts

---

## [1.0.0] — Initial Release

- End-to-end encrypted messaging with RSA-OAEP + AES-256-GCM
- Real-time messaging via Socket.IO
- Group chats with admin controls
- Push notifications via Web Push API
- PWA — installable on iOS and Android
- Admin dashboard — user management, stats, online indicators
- Message reactions, editing, and deletion
- Read receipts
- Dark/light theme
