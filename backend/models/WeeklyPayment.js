const mongoose = require('mongoose');

const weeklyPaymentSchema = new mongoose.Schema(
  {
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
    weekStart: { type: Date, required: true },
    paid: { type: Boolean, default: false },
    paidAt: { type: Date },
    amount: { type: Number, required: true },
    reminderSent: { type: Boolean, default: false },
    reminderSentAt: { type: Date },
    reminderMessage: { type: String, default: '' },
  },
  { timestamps: true }
);

weeklyPaymentSchema.index({ client: 1, weekStart: 1 }, { unique: true });

module.exports = mongoose.model('WeeklyPayment', weeklyPaymentSchema);
