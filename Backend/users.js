const express = require('express');
const { db } = require('./db');
const { requireAdmin, requireAuth, getUserCounts } = require('./middleware');
const { validateUsername, validatePassword, validateRole, validateSearchQuery, handleValidationError } = require('./validate');
const { hashPassword, sanitizeUsername } = require('./auth');

const router = express.Router();

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: { id: req.user.id, username: req.user.username, role: req.user.role, status: req.user.status, department: req.user.department } });
});

router.get('/users', requireAuth, requireAdmin, (req, res) => {
  const search = req.query.search || '';
  const validationError = validateSearchQuery(search);
  if (validationError) {
    return handleValidationError(res, validationError);
  }

  const trimmed = search.trim();
  let query = 'SELECT id, username, role, status, department, created_at FROM users';
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
  const department = typeof req.body?.department === 'string'
    ? req.body.department.trim()
    : '';

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

  if (department.length > 60 || (role !== 'admin' && !department)) {
    return res.status(400).json({
        error: 'A department (1–60 characters) is required for requestors and approvers.'
    });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(409).json({ error: 'Username already exists.' });
  }

  try {
    const passwordHash = await hashPassword(password);
    const result = db.prepare(`
      INSERT INTO users (username, password_hash, role, status, department)
      VALUES (?, ?, ?, 'active', ?)
    `).run(username, passwordHash, role, department || null);

    const createdUser = db.prepare('SELECT id, username, role, status, department, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ user: createdUser, message: 'User created successfully.' });
  } catch (error) {
    console.error('User creation failed:', error.message);
    res.status(500).json({ error: 'Unable to create user.' });
  }
});

// Admins can assign departments to existing accounts
router.patch('/users/:id/department', requireAuth, requireAdmin, (req, res) => {
  const userId = Number(req.params.id);
  const department = req.body?.department;

  // Validate user ID
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    return res.status(400).json({
      error: 'Invalid user ID.'
    });
  }

  // Validate department
  if (
      typeof department !== 'string' ||
      !department.trim() ||
      department.trim().length > 60
    ) {
        return res.status(400).json({
            error: 'Department must be 1–60 characters.'
        });
    }

    const existingUser = db.prepare(
        'SELECT id FROM users WHERE id = ?'
    ).get(userId);

    if (!existingUser) {
        return res.status(404).json({
            error: 'User not found.'
        });
    }

    try {
        db.transaction(() => {

            // Assign the user's department
            db.prepare(`
                UPDATE users
                SET department = ?
                WHERE id = ?
            `).run(department.trim(), userId);

            // Assign a department to older requests
            // that do not have one yet
            db.prepare(`
                UPDATE purchase_requests
                SET department = ?
                WHERE requester_id = ?
                AND department IS NULL
            `).run(department.trim(), userId);

        })();

        res.json({
            message: 'Department updated.'
        });

    } catch (error) {
        console.error('Department update failed:', error);

        res.status(500).json({
            error: 'Unable to update department.'
        });
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

  const targetUser = db.prepare('SELECT id, role, status, department FROM users WHERE id = ?').get(targetId);
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

  const usedInRequest = db.prepare(`
    SELECT id
    FROM purchase_requests
    WHERE requester_id = ?
       OR decided_by = ?
    LIMIT 1
`).get(targetId, targetId);

if (usedInRequest) {
    return res.status(409).json({
        error: 'This user has purchase request history and cannot be deleted.'
    });
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
