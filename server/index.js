const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

// ── Middleware ──
app.use(cors());
app.use(express.json());

// ── Serve static frontend files ──
app.use(express.static(path.join(__dirname, '../public')));

// ── API Routes ──
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/bugs',          require('./routes/bugs'));
app.use('/api/users',         require('./routes/users'));
app.use('/api/notifications', require('./routes/notifications'));

// ── All routes serve the public folder ──
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/login.html'));
});

app.get('/admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin.html'));
});

app.get('/tester.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/tester.html'));
});

app.get('/developer.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/developer.html'));
});

// ── Start Server ──
app.listen(PORT, () => {
  console.log(`BugTracker server running on port ${PORT}`);
  console.log('RESEND KEY:', process.env.RESEND_API_KEY ? 'LOADED' : 'MISSING');
  console.log('SUPABASE:', process.env.SUPABASE_URL ? 'LOADED' : 'MISSING');
});