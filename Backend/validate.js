const { validRoles } = require('./db');

function isNonEmptyString(value, min = 1, max = 50) {
  return typeof value === 'string' && value.trim().length >= min && value.trim().length <= max;
}

function validateUsername(username) {
  if (!isNonEmptyString(username, 3, 30)) {
    return 'Username must be 3-30 characters.';
  }

  if (!/^[a-zA-Z0-9._-]+$/.test(username.trim())) {
    return 'Username contains invalid characters.';
  }

  return null;
}

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    return 'Password must be 8-128 characters long.';
  }
  return null;
}

function validateRole(role) {
  if (!validRoles.includes(role)) {
    return 'Role is invalid.';
  }
  return null;
}

function validateSearchQuery(search) {
  if (search === undefined || search === null || search === '') {
    return null;
  }

  if (typeof search !== 'string') {
    return 'Search value must be text.';
  }

  const trimmed = search.trim();
  if (trimmed.length > 60) {
    return 'Search input is too long.';
  }

  return null;
}

function parseJsonBody(req, res, next) {
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Request body is invalid.' });
  }
  next();
}

function handleValidationError(res, message) {
  return res.status(400).json({ error: message });
}

module.exports = {
  validateUsername,
  validatePassword,
  validateRole,
  validateSearchQuery,
  parseJsonBody,
  handleValidationError,
};
