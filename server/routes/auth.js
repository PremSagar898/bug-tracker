const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const https = require('https');
const supabase = require('../config/db');

// ── Send email via Brevo API ──
function sendEmail(to, subject, html) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      sender: { name: 'BugTracker', email: 'premsagarajmira889@gmail.com' },
      to: [{ email: to }],
      subject: subject,
      htmlContent: html
    });

    const options = {
      hostname: 'api.brevo.com',
      path: '/v3/smtp/email',
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': process.env.BREVO_API_KEY,
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(data)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(body));
        } else {
          reject(new Error('Brevo API error: ' + body));
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function generateOTP(){
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ── SEND OTP ──
router.post('/send-otp', async (req, res) => {
  try {
    const { email, name } = req.body;
    if(!email || !name){
      return res.status(400).json({ message: 'Email and name are required.' });
    }

    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase().trim())
      .single();

    if(existing){
      return res.status(400).json({ message: 'Email already registered. Please sign in.' });
    }

    await supabase.from('otp_codes').delete().eq('email', email.toLowerCase().trim());

    const otp = generateOTP();
    const expiryMs = Date.now() + 10 * 60 * 1000;
    const otpValue = otp + '|' + expiryMs;

    const { error } = await supabase
      .from('otp_codes')
      .insert({
        email: email.toLowerCase().trim(),
        otp: otpValue,
        expires_at: new Date(expiryMs).toISOString(),
        used: false
      });

    if(error) throw error;

    await sendEmail(
      email,
      'BugTracker — Your Verification Code',
      `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#fff;border-radius:16px;border:1.5px solid #e8eaff;">
        <h2 style="font-size:20px;font-weight:700;color:#111827;margin-bottom:8px;">Verify your email</h2>
        <p style="font-size:14px;color:#6b7280;margin-bottom:24px;">Hi <strong>${name}</strong>, use this code to verify your BugTracker account.</p>
        <div style="background:#f4f5fb;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
          <div style="font-family:'Courier New',monospace;font-size:36px;font-weight:800;letter-spacing:10px;color:#4f46e5;">${otp}</div>
        </div>
        <p style="font-size:13px;color:#9ca3af;">This code expires in <strong>10 minutes</strong>.</p>
      </div>`
    );

    res.json({ message: 'OTP sent successfully.' });

  } catch(err) {
    console.error('Send OTP error:', err);
    res.status(500).json({ message: 'Failed to send verification code. Please try again.' });
  }
});

// ── VERIFY OTP ──
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp, name, password, role } = req.body;

    if(!email || !otp || !name || !password || !role){
      return res.status(400).json({ message: 'All fields are required.' });
    }
    if(!['admin','tester','developer'].includes(role)){
      return res.status(400).json({ message: 'Invalid role.' });
    }
    if(password.length < 8){
      return res.status(400).json({ message: 'Password must be at least 8 characters.' });
    }

    const { data: records, error: otpErr } = await supabase
      .from('otp_codes')
      .select('*')
      .eq('email', email.toLowerCase().trim())
      .eq('used', false)
      .order('created_at', { ascending: false })
      .limit(1);

    if(otpErr || !records || records.length === 0){
      return res.status(400).json({ message: 'No verification code found. Please request a new one.' });
    }

    const otpRecord = records[0];
    const parts = otpRecord.otp.split('|');
    const storedOtp = parts[0];
    const expiryMs = parseInt(parts[1]);

    if(storedOtp !== otp.trim()){
      return res.status(400).json({ message: 'Invalid verification code. Please try again.' });
    }

    if(Date.now() > expiryMs){
      return res.status(400).json({ message: 'Verification code has expired. Please request a new one.' });
    }

    await supabase.from('otp_codes').update({ used: true }).eq('id', otpRecord.id);

    const { data: existing } = await supabase
      .from('users').select('id').eq('email', email.toLowerCase().trim()).single();
    if(existing){
      return res.status(400).json({ message: 'Email already registered.' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const { data: user, error: createErr } = await supabase
      .from('users')
      .insert({ name: name.trim(), email: email.toLowerCase().trim(), password: hashed, role })
      .select().single();

    if(createErr) throw createErr;

    await supabase.from('notifications').insert({
      user_name: 'Admin',
      message: `New ${role} registered: ${user.name} (${user.email})`,
      bug_id: null,
      type: 'user'
    });

    // Welcome email (non-critical)
    try {
      await sendEmail(
        email,
        'Welcome to BugTracker!',
        `<div style="font-family:Arial,sans-serif;padding:32px;">
          <h2>Welcome, ${user.name}! 🎉</h2>
          <p>Your account has been created. Role: <strong>${role}</strong></p>
        </div>`
      );
    } catch(e){ console.log('Welcome email skipped:', e.message); }

    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });

  } catch(err) {
    console.error('Verify OTP error:', err);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

// ── LOGIN ──
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if(!email || !password){
      return res.status(400).json({ message: 'Email and password required.' });
    }
    const { data: user, error } = await supabase
      .from('users').select('*').eq('email', email.trim().toLowerCase()).single();

    if(error || !user){
      return res.status(400).json({ message: 'Invalid email or password.' });
    }
    const match = await bcrypt.compare(password, user.password);
    if(!match){
      return res.status(400).json({ message: 'Invalid email or password.' });
    }
    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch(err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;