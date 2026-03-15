const express = require('express');
const router = express.Router();
const supabase = require('../config/db');
const authMiddleware = require('../middleware/auth');

// ── GET MY NOTIFICATIONS ──
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_name', req.user.name)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

// ── MARK ALL READ ──
router.put('/read', authMiddleware, async (req, res) => {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_name', req.user.name);

    if (error) throw error;
    res.json({ message: 'All notifications marked as read.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;