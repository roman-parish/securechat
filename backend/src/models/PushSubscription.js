import mongoose from 'mongoose';

const pushSubscriptionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  subscription: {
    endpoint: String,
    keys: {
      p256dh: String,
      auth: String,
    },
  },
  userAgent: String,
}, {
  timestamps: true,
});

pushSubscriptionSchema.index({ userId: 1 });

export default mongoose.model('PushSubscription', pushSubscriptionSchema);
