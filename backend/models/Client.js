const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema(
  {
    uniqueNo: { type: String, trim: true },
    name: { type: String, required: true, trim: true },
    place: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    amountTaken: { type: Number, required: true, min: 0 },
    dateTaken: { type: Date, required: true },
    totalWeeks: { type: Number, enum: [12, 25], default: 25 },
    interestRate: { type: Number, required: true, min: 0 },
    planInterestAmount: { type: Number, min: 0 },
    totalPayable: { type: Number, min: 0 },
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
    topUpHistory: [
      {
        topUpAt: { type: Date, default: Date.now },
        previousAmountTaken: { type: Number, min: 0 },
        previousDateTaken: { type: Date },
        previousInterestRate: { type: Number, min: 0 },
        previousWeeklyPayment: { type: Number, min: 0 },
        oldTotalPayable: { type: Number, min: 0 },
        amountAlreadyPaid: { type: Number, min: 0 },
        previousRemainingAmount: { type: Number, min: 0 },
        newAmountTaken: { type: Number, min: 0 },
        newInterestRate: { type: Number, min: 0 },
        newInterestAmount: { type: Number, min: 0 },
        newTotalPayable: { type: Number, min: 0 },
        newWeeklyPayment: { type: Number, min: 0 },
        totalWeeks: { type: Number, default: 25 },
        firstPaymentDate: { type: Date },
        note: { type: String, trim: true, default: '' },
      },
    ],
  },
  { timestamps: true }
);

clientSchema.index({ name: 1 });
clientSchema.index({ uniqueNo: 1 }, { unique: true, sparse: true });
clientSchema.index({ place: 1 });
clientSchema.index({ phone: 1 });
clientSchema.index({ createdAt: -1 });
clientSchema.index({ dateTaken: 1 });

module.exports = mongoose.model('Client', clientSchema);
