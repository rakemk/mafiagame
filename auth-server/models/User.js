const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  fullName: { type: String, required: false },
  email: { type: String, required: true, unique: true, lowercase: true, index: true },
  password: { type: String, required: false },
  googleId: { type: String, required: false, index: true },
  emailVerified: { type: Boolean, default: false },
  verificationToken: { type: String, required: false, index: true },
  verificationExpires: { type: Date, required: false },
  createdAt: { type: Date, default: () => new Date() }
});

module.exports = mongoose.model('User', UserSchema);
