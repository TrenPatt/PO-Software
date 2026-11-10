const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'po_software.db');
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

const validRoles = ['requestor', 'approver', 'admin'];

function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('requestor', 'approver', 'admin')),
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'disabled')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      session_token TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS purchase_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      requester_id INTEGER NOT NULL,
      item_name TEXT NOT NULL,
      vendor TEXT NOT NULL,
      description TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_cost REAL NOT NULL,
      justification TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Pending'
        CHECK(status IN ('Pending', 'Approved', 'Denied')),
      submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (requester_id) REFERENCES users(id)
        ON DELETE CASCADE

      
    );
    
  `);
  
  // Add cancellation support to existing purchase requests
  const requestColumns = db.prepare(
      "PRAGMA table_info(purchase_requests)"
  ).all();

  if (!requestColumns.some(column => column.name === 'cancelled_at')) {
      db.exec(`
          ALTER TABLE purchase_requests
          ADD COLUMN cancelled_at TEXT
      `);
  }

  // Add departments to users
  const userColumns = db.prepare(
    'PRAGMA table_info(users)'
  ).all();

  if (!userColumns.some(column => column.name === 'department')) {
    db.exec('ALTER TABLE users ADD COLUMN department TEXT');
  }

  // Add approval details to purchase requests
  const approvalColumns = [
    ['department', 'TEXT'],
    ['decided_by', 'INTEGER'],
    ['decided_at', 'TEXT'],
    ['decision_comment', 'TEXT']
  ];

  for (const [name, type] of approvalColumns) {
    if (!requestColumns.some(column => column.name === name)) {
        db.exec(
            `ALTER TABLE purchase_requests ADD COLUMN ${name} ${type}`
        );
    }
  }

  const adminCount = db.prepare('SELECT COUNT(*) AS count FROM users WHERE role = ? AND status = ?').get('admin', 'active').count;
  if (adminCount === 0) {
    console.warn('No active admin user found. Use "npm run create-admin" to bootstrap one.');
  }
}

module.exports = {
  db,
  validRoles,
  initializeDatabase,
};
