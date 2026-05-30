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
  },
  { timestamps: true }
);

module.exports = mongoose.model('Client', clientSchema);
