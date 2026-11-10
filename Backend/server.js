const path = require('path');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const { initializeDatabase, db } = require('./db');
const { getUserByUsername, verifyPassword, createSessionRecord, revokeSessionToken, getUserById, getSessionByToken } = require('./auth');
const { requireAuth, requireAdmin, requireRole, authStatus, requireCsrf } = require('./middleware');
const { sanitizeUsername, isValidRole } = require('./auth');
const { validateUsername, validatePassword, validateRole, handleValidationError } = require('./validate');
const userRoutes = require('./users');
const purchaseRequestRoutes = require('./purchaseRequests');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const allowedOrigin = process.env.ALLOWED_ORIGIN || 'http://localhost:3000';

initializeDatabase();

app.use(helmet({
  contentSecurityPolicy: false,
}));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));

const corsHeaders = [
  'Origin',
  'X-Requested-With',
  'Content-Type',
  'Accept',
  'X-CSRF-Token',
];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && origin !== allowedOrigin) {
    return res.status(403).json({ error: 'Origin not allowed.' });
  }
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Headers', corsHeaders.join(', '));
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again later.' },
  skipSuccessfulRequests: true,
});

app.use((req, res, next) => {
  if (!req.cookies.csrf_token) {
    const token = require('crypto').randomBytes(32).toString('hex');
    res.cookie('csrf_token', token, {
      httpOnly: false,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 1000,
    });
  }
  next();
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, status: 'healthy' });
});

app.get('/api/auth/status', requireAuth, authStatus);

app.post('/api/auth/login', loginLimiter, async (req, res) => {
  const username = sanitizeUsername(req.body?.username || '');
  const password = req.body?.password || '';

  const usernameError = validateUsername(username);
  if (usernameError) {
    return res.status(400).json({ error: 'Invalid username or password.' });
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    return res.status(400).json({ error: 'Invalid username or password.' });
  }

  const user = getUserByUsername(username);
  if (!user || user.status !== 'active') {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  try {
    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const session = createSessionRecord(user);
    const csrfToken = req.cookies.csrf_token || require('crypto').randomBytes(32).toString('hex');

    res.cookie('session_token', session.token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: Number(process.env.SESSION_TTL_MS || 8 * 60 * 60 * 1000),
    });

    res.cookie('csrf_token', csrfToken, {
      httpOnly: false,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 1000,
    });

    res.json({
      message: 'Login successful.',
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Login error:', error.message);
    res.status(500).json({ error: 'Unable to log in.' });
  }
});

app.post('/api/auth/logout', requireAuth, requireCsrf, (req, res) => {
  const token = req.cookies.session_token;
  if (token) {
    revokeSessionToken(token);
  }

  res.clearCookie('session_token', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
  res.clearCookie('csrf_token', {
    httpOnly: false,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
  res.json({ message: 'Logged out successfully.' });
});

app.use('/api/users', (req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return requireCsrf(req, res, next);
  }
  return next();
});
app.use('/api/users', userRoutes);

// Purchase request routes
app.use('/api/purchase-requests', (req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return requireCsrf(req, res, next);
  }
  return next();
});

app.use('/api/purchase-requests', purchaseRequestRoutes);

const frontendDir = path.join(__dirname, '..', 'Frontend');

const staticAssetPaths = ['/styles.css', '/script.js', '/header.html', '/footer.html'];
for (const assetPath of staticAssetPaths) {
  app.get(assetPath, (req, res) => {
    const fileName = assetPath.replace('/', '');
    res.sendFile(path.join(frontendDir, fileName));
  });
}

app.get('/dashboard.html', requireAuth, (req, res) => {
  res.sendFile(path.join(frontendDir, 'dashboard.html'));
});

app.get('/user.html', requireAuth, requireAdmin, (req, res) => {
  res.sendFile(path.join(frontendDir, 'user.html'));
});

app.get('/purchase-order.html', requireAuth, requireRole('requestor'), (req, res) => {
  res.sendFile(path.join(frontendDir, 'purchase-order.html'));
});
app.get(
    '/view-requests.html',
    requireAuth,
    requireRole('requestor', 'approver'),
    (req, res) => {
        res.sendFile(path.join(frontendDir, 'view-requests.html'));
    }
);

app.get('/', (req, res) => {
  if (req.cookies.session_token) {
    const session = getSessionByToken(req.cookies.session_token);
    if (session) {
      return res.redirect('/dashboard.html');
    }
  }
  res.sendFile(path.join(frontendDir, 'index.html'));
});

app.get('/index.html', (req, res) => {
  if (req.cookies.session_token) {
    const session = getSessionByToken(req.cookies.session_token);
    if (session) {
      return res.redirect('/dashboard.html');
    }
  }
  res.sendFile(path.join(frontendDir, 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  if (res.headersSent) {
    return next(err);
  }
  res.status(500).json({ error: 'Internal server error.' });
});

app.listen(PORT, () => {
  console.log(`PO-Software server running on http://localhost:${PORT}`);
});
