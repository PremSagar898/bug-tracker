const express = require('express');
const router = express.Router();
const supabase = require('../config/db');
const authMiddleware = require('../middleware/auth');

// ── Generate Bug ID ──
async function generateBugId() {
  const { data, error } = await supabase
    .from('bug_counter')
    .select('counter')
    .eq('id', 1)
    .single();

  if (error) throw error;
  const newCounter = data.counter + 1;

  await supabase
    .from('bug_counter')
    .update({ counter: newCounter })
    .eq('id', 1);

  return 'BUG-' + String(newCounter).padStart(4, '0');
}

// ── GET ALL BUGS (Admin) ──
router.get('/', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied.' });
    }
    const { data, error } = await supabase
      .from('bugs')
      .select('*, comments(*)')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

// ── GET MY BUGS (Tester - own submitted bugs) ──
router.get('/mine', authMiddleware, async (req, res) => {
  try {
    let query = supabase.from('bugs').select('*, comments(*)');

    if (req.user.role === 'tester') {
      query = query.eq('reporter', req.user.name);
    } else if (req.user.role === 'developer') {
      query = query.eq('assigned_to', req.user.name);
    } else {
      return res.status(403).json({ message: 'Access denied.' });
    }

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

// ── GET SINGLE BUG ──
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('bugs')
      .select('*, comments(*)')
      .eq('id', req.params.id)
      .single();

    if (error || !data) return res.status(404).json({ message: 'Bug not found.' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

// ── SUBMIT BUG (Tester) ──
router.post('/', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'tester') {
      return res.status(403).json({ message: 'Only testers can submit bugs.' });
    }

    const { title, description, project, priority, environment, browser, steps, screenshot } = req.body;
    if (!title || !description || !project || !priority) {
      return res.status(400).json({ message: 'Title, description, project and priority are required.' });
    }

    const bugId = await generateBugId();

    const { data, error } = await supabase
      .from('bugs')
      .insert({
        id: bugId,
        title,
        description,
        project,
        priority,
        environment: environment || '',
        browser: browser || '',
        steps: steps || '',
        screenshot: screenshot || false,
        reporter: req.user.name,
        reporter_id: req.user.id,
        status: 'Open'
      })
      .select()
      .single();

    if (error) throw error;

    // Notify admin
    await supabase.from('notifications').insert({
      user_name: 'Admin',
      message: `New bug reported: ${title} by ${req.user.name}`,
      bug_id: bugId,
      type: 'new'
    });

    res.status(201).json(data);
  } catch (err) {
    console.error('Submit bug error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// ── UPDATE BUG (Admin / Developer) ──
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { status, assigned_to, assigned_to_id, priority, title, description } = req.body;

    // Get current bug
    const { data: bug, error: fetchErr } = await supabase
      .from('bugs')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (fetchErr || !bug) return res.status(404).json({ message: 'Bug not found.' });

    const updates = {};
    if (status)       updates.status = status;
    if (priority)     updates.priority = priority;
    if (title)        updates.title = title;
    if (description)  updates.description = description;
    if (assigned_to) {
      updates.assigned_to    = assigned_to;
      updates.assigned_to_id = assigned_to_id || null;
      updates.assigned_at    = new Date().toISOString();
      updates.status         = 'In Progress';
    }
    if (status === 'Resolved') {
      updates.resolved_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('bugs')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    // Notify reporter if status changed
    if (status && status !== bug.status) {
      await supabase.from('notifications').insert({
        user_name: bug.reporter,
        message: `Your bug ${req.params.id} status changed to "${status}"`,
        bug_id: req.params.id,
        type: status === 'Resolved' ? 'resolved' : 'update'
      });
    }

    // Notify developer if assigned
    if (assigned_to && assigned_to !== bug.assigned_to) {
      await supabase.from('notifications').insert({
        user_name: assigned_to,
        message: `Bug ${req.params.id} assigned to you: ${bug.title}`,
        bug_id: req.params.id,
        type: 'assigned'
      });
      // Also notify reporter
      await supabase.from('notifications').insert({
        user_name: bug.reporter,
        message: `Your bug ${req.params.id} was assigned to ${assigned_to}`,
        bug_id: req.params.id,
        type: 'assigned'
      });
    }

    res.json(data);
  } catch (err) {
    console.error('Update bug error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// ── ADD COMMENT ──
router.post('/:id/comments', authMiddleware, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ message: 'Comment text required.' });

    const { data: bug } = await supabase
      .from('bugs')
      .select('reporter, assigned_to, title')
      .eq('id', req.params.id)
      .single();

    if (!bug) return res.status(404).json({ message: 'Bug not found.' });

    const { data, error } = await supabase
      .from('comments')
      .insert({
        bug_id: req.params.id,
        author: req.user.name,
        author_id: req.user.id,
        text
      })
      .select()
      .single();

    if (error) throw error;

    // Notify reporter
    if (bug.reporter !== req.user.name) {
      await supabase.from('notifications').insert({
        user_name: bug.reporter,
        message: `${req.user.name} commented on your bug ${req.params.id}`,
        bug_id: req.params.id,
        type: 'comment'
      });
    }
    // Notify developer
    if (bug.assigned_to && bug.assigned_to !== req.user.name) {
      await supabase.from('notifications').insert({
        user_name: bug.assigned_to,
        message: `${req.user.name} commented on bug ${req.params.id}`,
        bug_id: req.params.id,
        type: 'comment'
      });
    }
    // Notify admin
    await supabase.from('notifications').insert({
      user_name: 'Admin',
      message: `${req.user.name} commented on ${req.params.id}`,
      bug_id: req.params.id,
      type: 'comment'
    });

    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;