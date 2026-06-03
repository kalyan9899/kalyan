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

collectionEntrySchema.index({ entryDate: -1 });
collectionEntrySchema.index({ createdAt: -1 });
collectionEntrySchema.index({ name: 1 });
collectionEntrySchema.index({ client: 1, entryDate: -1 });

module.exports = mongoose.model('CollectionEntry', collectionEntrySchema);
