const crypto = require('crypto');
const argon2 = require('argon2');
const { db, validRoles } = require('./db');

const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS || 8 * 60 * 60 * 1000);

function sanitizeUsername(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ');
}

function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function hashPassword(password) {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });
}

async function verifyPassword(password, hash) {
  return argon2.verify(hash, password);
}

function createSessionRecord(user) {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  const result = db.prepare(`
    INSERT INTO sessions (user_id, session_token, expires_at)
    VALUES (?, ?, ?)
  `).run(user.id, token, expiresAt);

  return {
    id: result.lastInsertRowid,
    token,
    expiresAt,
    userId: user.id,
  };
}

function getUserByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}

function getUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function getSessionByToken(token) {
  return db.prepare(`
    SELECT s.*, u.username, u.role, u.status
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.session_token = ? AND s.revoked_at IS NULL AND s.expires_at > ?
  `).get(token, new Date().toISOString());
}

function revokeSessionToken(token) {
  db.prepare('UPDATE sessions SET revoked_at = ? WHERE session_token = ? AND revoked_at IS NULL').run(new Date().toISOString(), token);
}

function revokeAllUserSessions(userId) {
  db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(new Date().toISOString(), userId);
}

function isValidRole(value) {
  return validRoles.includes(value);
}

module.exports = {
  sanitizeUsername,
  hashPassword,
  verifyPassword,
  createSessionRecord,
  getUserByUsername,
  getUserById,
  getSessionByToken,
  revokeSessionToken,
  revokeAllUserSessions,
  isValidRole,
  SESSION_TTL_MS,
};
