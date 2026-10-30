const express = require('express');
const { db } = require('./db');
const { requireAdmin, requireAuth, getUserCounts } = require('./middleware');
const { validateUsername, validatePassword, validateRole, validateSearchQuery, handleValidationError } = require('./validate');
const { hashPassword, sanitizeUsername } = require('./auth');

const router = express.Router();

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: { id: req.user.id, username: req.user.username, role: req.user.role, status: req.user.status } });
});

router.get('/users', requireAuth, requireAdmin, (req, res) => {
  const search = req.query.search || '';
  const validationError = validateSearchQuery(search);
  if (validationError) {
    return handleValidationError(res, validationError);
  }

  const trimmed = search.trim();
  let query = 'SELECT id, username, role, status, created_at FROM users';
  const params = [];

  if (trimmed) {
    query += ' WHERE username LIKE ? OR role LIKE ?';
    params.push(`%${trimmed}%`, `%${trimmed}%`);
  }

  query += ' ORDER BY created_at DESC';
  const users = db.prepare(query).all(...params);

  res.json({ users });
});

router.post('/users', requireAuth, requireAdmin, async (req, res) => {
  const username = sanitizeUsername(req.body?.username);
  const password = req.body?.password;
  const role = req.body?.role;

  const usernameError = validateUsername(username);
  if (usernameError) {
    return handleValidationError(res, usernameError);
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    return handleValidationError(res, passwordError);
  }

  const roleError = validateRole(role);
  if (roleError) {
    return handleValidationError(res, roleError);
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(409).json({ error: 'Username already exists.' });
  }

  try {
    const passwordHash = await hashPassword(password);
    const result = db.prepare(`
      INSERT INTO users (username, password_hash, role, status)
      VALUES (?, ?, ?, 'active')
    `).run(username, passwordHash, role);

    const createdUser = db.prepare('SELECT id, username, role, status, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ user: createdUser, message: 'User created successfully.' });
  } catch (error) {
    console.error('User creation failed:', error.message);
    res.status(500).json({ error: 'Unable to create user.' });
  }
});

router.delete('/users/:id', requireAuth, requireAdmin, (req, res) => {
  const targetId = Number(req.params.id);
  if (!Number.isInteger(targetId) || targetId <= 0) {
    return res.status(400).json({ error: 'Invalid user ID.' });
  }

  if (targetId === req.user.id) {
    return res.status(400).json({ error: 'You cannot delete your own account.' });
  }

  const targetUser = db.prepare('SELECT id, role, status FROM users WHERE id = ?').get(targetId);
  if (!targetUser) {
    return res.status(404).json({ error: 'User not found.' });
  }

  const adminCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE role = ? AND status = ?').get('admin', 'active').count;
  if (targetUser.role === 'admin' && adminCount <= 1) {
    return res.status(400).json({ error: 'Cannot remove the last active administrator.' });
  }

  if (targetUser.status !== 'active') {
    return res.status(400).json({ error: 'Only active users can be deleted.' });
  }

  const transaction = db.transaction(() => {
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(targetId);
    db.prepare('DELETE FROM users WHERE id = ?').run(targetId);
  });

  try {
    transaction();
    res.json({ message: 'User deleted successfully.' });
  } catch (error) {
    console.error('User deletion failed:', error.message);
    res.status(500).json({ error: 'Unable to delete user.' });
  }
});

router.get('/users/stats', requireAuth, requireAdmin, (req, res) => {
  res.json(getUserCounts());
});

module.exports = router;
