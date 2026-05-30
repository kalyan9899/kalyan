const mongoose = require('mongoose');

const managerSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true, lowercase: true },
  password: { type: String, required: true },
  name: { type: String, default: 'Manager' },
});

module.exports = mongoose.model('Manager', managerSchema);
