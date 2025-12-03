require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const path = require('path');

const { MONGO_URI, BASE_URL } = process.env;

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(cors({ origin: true, credentials: true }));

// connect to mongo
mongoose.connect(MONGO_URI || 'mongodb://localhost:27017/neonmafia', { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.error('MongoDB connection error', err));

// routes
const authRoutes = require('./routes/authRoutes');
app.use('/auth', authRoutes);

// Supabase OAuth exchange route (server-side)
const supabaseRoutes = require('./routes/supabaseRoutes');
app.use('/auth', supabaseRoutes);

// serve frontend static folder for the small demo pages
app.use('/', express.static(path.join(__dirname, '..', 'auth-frontend')));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Auth server listening on port ${PORT}`);
  console.log(`BASE_URL is ${BASE_URL || 'not-set'}`);
});
