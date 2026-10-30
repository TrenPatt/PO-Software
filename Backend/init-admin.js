
require('dotenv').config();

const { db, initializeDatabase } = require('./db');
const { hashPassword, sanitizeUsername } = require('./auth');

async function main() {
  initializeDatabase();

  const admins = [
    {
      username: process.env.ADMIN_USERNAME,
      password: process.env.ADMIN_PASSWORD
    },
    {
      username: process.env.ADMIN_USERNAME_2,
      password: process.env.ADMIN_PASSWORD_2
    },
    {
      username: process.env.ADMIN_USERNAME_3,
      password: process.env.ADMIN_PASSWORD_3
    }
  ];

  // Validate administrator credentials
  for (let i = 0; i < admins.length; i++) {
    const admin = admins[i];

    if (!admin.username || !admin.password) {
      throw new Error(`Missing credentials for administrator ${i + 1}.`);
    }

    admin.username = sanitizeUsername(admin.username);

    if (!admin.username || admin.username.length < 3) {
      throw new Error(`Administrator ${i + 1} must have a username of at least 3 characters.`);
    }
  }

  // Check for duplicate usernames
  const usernames = admins.map(admin => admin.username);

  if (new Set(usernames).size !== usernames.length) {
    throw new Error('Administrator usernames must be unique.');
  }

  // Create administrators
  for (const admin of admins) {
    const existing = db.prepare(
      'SELECT id FROM users WHERE username = ?'
    ).get(admin.username);

    if (existing) {
      console.log(`Admin ${admin.username} already exists. Skipping.`);
      continue;
    }

    const passwordHash = await hashPassword(admin.password);

    db.prepare(`
      INSERT INTO users (username, password_hash, role, status)
      VALUES (?, ?, 'admin', 'active')
    `).run(admin.username, passwordHash);

    console.log(`Administrator created: ${admin.username}`);
  }

  console.log('Administrator initialization completed.');
}

main().catch((error) => {
  console.error('Failed to bootstrap admins:', error.message);
  process.exit(1);
});
