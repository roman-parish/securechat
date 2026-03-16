db = db.getSiblingDB('securechat');

db.createCollection('users');
db.createCollection('conversations');
db.createCollection('messages');
db.createCollection('push_subscriptions');

db.users.createIndex({ username: 1 }, { unique: true });
db.users.createIndex({ email: 1 }, { unique: true });
db.conversations.createIndex({ participants: 1 });
db.messages.createIndex({ conversationId: 1, createdAt: -1 });
db.messages.createIndex({ createdAt: 1 }, { expireAfterSeconds: 2592000 }); // 30 day TTL optional
