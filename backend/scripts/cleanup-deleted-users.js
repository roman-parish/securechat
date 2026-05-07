/**
 * One-time cleanup: remove anonymized null-sender messages left over from
 * the old account-deletion flow, then remove any conversations that are now
 * empty or contain only those ghost messages.
 *
 * Usage (on the server):
 *   MONGO_URI=<your-uri> node scripts/cleanup-deleted-users.js
 */
import 'dotenv/config';
import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) { console.error('MONGO_URI not set'); process.exit(1); }

await mongoose.connect(MONGO_URI);
console.log('Connected to MongoDB');

const Message = mongoose.model('Message', new mongoose.Schema({}, { strict: false }));
const Conversation = mongoose.model('Conversation', new mongoose.Schema({
  participants: [mongoose.Schema.Types.ObjectId],
}, { strict: false }));

// 1. Delete all null-sender messages (anonymized ghost messages)
const msgResult = await Message.deleteMany({ sender: null });
console.log(`Deleted ${msgResult.deletedCount} null-sender messages`);

// 2. Find conversations with no participants and delete them
const emptyConvs = await Conversation.find({ $or: [{ participants: { $size: 0 } }, { participants: [] }] });
for (const conv of emptyConvs) {
  await Message.deleteMany({ conversationId: conv._id });
  await Conversation.deleteOne({ _id: conv._id });
}
console.log(`Deleted ${emptyConvs.length} empty conversations`);

// 3. Find conversations where every remaining message has been deleted (no messages at all)
//    — leave those in place since they may still be valid active conversations

await mongoose.disconnect();
console.log('Done.');
