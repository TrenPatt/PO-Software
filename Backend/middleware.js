const { getSessionByToken } = require('./auth');
const { db } = require('./db');

function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies.session_token;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const session = getSessionByToken(token);
  if (!session || session.status !== 'active') {
    return res.status(401).json({ error: 'Session invalid or expired.' });
  }

  req.user = {
    id: session.user_id,
    username: session.username,
    role: session.role,
    status: session.status,
    department: session.department,
  };
  req.sessionToken = token;
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const allowed = new Set(roles);
    if (!allowed.has(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions.' });
    }

    next();
  };
}

function requireAdmin(req, res, next) {
  return requireRole('admin')(req, res, next);
}

function authStatus(req, res) {
  if (!req.user) {
    return res.status(401).json({ authenticated: false });
  }

  return res.json({
    authenticated: true,
    user: {
      id: req.user.id,
      username: req.user.username,
      role: req.user.role,
      status: req.user.status,
      department: req.user.department,
    },
  });
}

function requireCsrf(req, res, next) {
  const cookieToken = req.cookies && req.cookies.csrf_token;
  const headerToken = req.get('X-CSRF-Token');

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ error: 'Invalid CSRF token.' });
  }

  next();
}

function getUserCounts() {
  return {
    total: db.prepare('SELECT COUNT(*) AS count FROM users').get().count,
    activeAdmins: db.prepare('SELECT COUNT(*) AS count FROM users WHERE role = ? AND status = ?').get('admin', 'active').count,
  };
}

module.exports = {
  requireAuth,
  requireRole,
  requireAdmin,
  authStatus,
  requireCsrf,
  getUserCounts,
};
