const mongoose = require('mongoose');

const weeklyPaymentSchema = new mongoose.Schema(
  {
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
    weekStart: { type: Date, required: true },
    paid: { type: Boolean, default: false },
    paidAt: { type: Date },
    amount: { type: Number, required: true },
    paymentStatus: {
      type: String,
      enum: ['pending', 'submitted', 'approved', 'rejected'],
      default: 'pending',
    },
    screenshot: { type: String, default: '' },
    screenshotUploadedAt: { type: Date },
    approvedAt: { type: Date },
    rejectedAt: { type: Date },
    managerNote: { type: String, default: '' },
    reminderSent: { type: Boolean, default: false },
    reminderSentAt: { type: Date },
    reminderMessage: { type: String, default: '' },
  },
  { timestamps: true }
);

weeklyPaymentSchema.index({ client: 1, weekStart: 1 }, { unique: true });
weeklyPaymentSchema.index({ weekStart: 1, paid: 1 });
weeklyPaymentSchema.index({ paid: 1, paidAt: -1 });
weeklyPaymentSchema.index({ paymentStatus: 1, screenshotUploadedAt: -1 });
weeklyPaymentSchema.index({ client: 1, paid: 1, weekStart: -1 });
weeklyPaymentSchema.index({ updatedAt: -1 });

module.exports = mongoose.model('WeeklyPayment', weeklyPaymentSchema);
