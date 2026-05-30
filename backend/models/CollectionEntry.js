const mongoose = require('mongoose');

const collectionEntrySchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },
    collection: { type: Number, default: 0, min: 0 },
    charges: { type: Number, default: 0, min: 0 },
    payments: { type: Number, default: 0, min: 0 },
    previousAmount: { type: Number, default: 0, min: 0 },
    entryDate: { type: Date, default: Date.now },
    note: { type: String, trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('CollectionEntry', collectionEntrySchema);
