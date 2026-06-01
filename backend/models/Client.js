const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    place: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    amountTaken: { type: Number, required: true, min: 0 },
    dateTaken: { type: Date, required: true },
    interestRate: { type: Number, required: true, min: 0 },
    weeklyPayment: { type: Number, required: true, min: 0 },
    username: { type: String, required: true, unique: true, trim: true, lowercase: true },
    password: { type: String, required: true },
    profilePhoto: { type: String, default: '' },
    renewalHistory: [
      {
        renewedAt: { type: Date, default: Date.now },
        previousAmountTaken: { type: Number, min: 0 },
        previousDateTaken: { type: Date },
        previousInterestRate: { type: Number, min: 0 },
        previousWeeklyPayment: { type: Number, min: 0 },
        newAmountTaken: { type: Number, min: 0 },
        newDateTaken: { type: Date },
        newInterestRate: { type: Number, min: 0 },
        newWeeklyPayment: { type: Number, min: 0 },
        note: { type: String, trim: true, default: '' },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Client', clientSchema);
