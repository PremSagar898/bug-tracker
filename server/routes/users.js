const express = require('express');
const router = express.Router();
const supabase = require('../config/db');
const authMiddleware = require('../middleware/auth');

// ── GET ALL USERS (Admin only) ──
router.get('/', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied.' });
    }
    const { data, error } = await supabase
      .from('users')
      .select('id, name, email, role, joined_at')
      .order('joined_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

// ── GET USERS BY ROLE (Admin only) ──
router.get('/role/:role', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied.' });
    }
    const { data, error } = await supabase
      .from('users')
      .select('id, name, email, role, joined_at')
      .eq('role', req.params.role)
      .order('joined_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;