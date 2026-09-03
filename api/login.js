import crypto from 'crypto';

// DEFAULT USER DATABASE (fallback saat KV belum setup)
const DEFAULT_USERS = {
  'testuser': {
    username: 'testuser',
    hash: 'c80c55a4cce4f5f3a6b9e5c9c1c0e4f5b9c8f5c9b8d0e1f2a3b4c5d6e7f8a9',
    salt: '1234567890abcdef1234567890abcdef',
    createdAt: new Date().toISOString()
  },
  'admin': {
    username: 'admin',
    hash: '9f6f5c3b1a0f8d7e6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4',
    salt: 'fedcba9876543210fedcba9876543210',
    createdAt: new Date().toISOString()
  }
};

// In-memory database untuk backup
let memoryDB = {
  users: { ...DEFAULT_USERS },
  logs: []
};

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function getIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

async function getUser(username) {
  try {
    if (global.kv) {
      const raw = await global.kv.get(`user:${username}`);
      if (raw) {
        return typeof raw === 'string' ? JSON.parse(raw) : raw;
      }
    }
  } catch (e) {
    console.log('KV get failed:', e.message);
  }
  // Fallback ke memory
  return memoryDB.users[username] || null;
}

async function logAttempt(username, ip, success) {
  const entry = { username, ip, success, time: new Date().toISOString() };
  
  try {
    if (global.kv) {
      await global.kv.lpush('login_logs', JSON.stringify(entry));
      await global.kv.ltrim('login_logs', 0, 499);
    }
  } catch (e) {
    console.log('KV log failed:', e.message);
  }
  
  memoryDB.logs.push(entry);
  if (memoryDB.logs.length > 500) {
    memoryDB.logs = memoryDB.logs.slice(-500);
  }
}

async function saveLastLogin(username, ip) {
  try {
    if (global.kv) {
      await global.kv.set(
        `lastlogin:${username}`,
        JSON.stringify({ ip, time: new Date().toISOString() })
      );
    }
  } catch (e) {
    console.log('KV lastlogin failed:', e.message);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { username, password } = req.body || {};
  const ip = getIp(req);

  if (!username || !password) {
    return res.status(400).json({ error: 'Username dan password wajib diisi' });
  }

  // Admin login from env vars
  if (
    process.env.ADMIN_USERNAME &&
    process.env.ADMIN_PASSWORD &&
    username === process.env.ADMIN_USERNAME &&
    password === process.env.ADMIN_PASSWORD
  ) {
    await logAttempt(`${username} (admin)`, ip, true);
    return res.status(200).json({ success: true, role: 'admin' });
  }

  try {
    const user = await getUser(username);
    if (!user) {
      await logAttempt(username, ip, false);
      return res.status(401).json({ error: 'salah' });
    }

    const hash = hashPassword(password, user.salt);
    const ok = hash === user.hash;

    await logAttempt(username, ip, ok);

    if (!ok) {
      return res.status(401).json({ error: 'salah' });
    }

    await saveLastLogin(username, ip);

    return res.status(200).json({ success: true, role: 'user', username });
  } catch (e) {
    console.error('Login error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
}

// Initialize KV
if (typeof window === 'undefined') {
  import('@vercel/kv')
    .then(({ kv }) => {
      global.kv = kv;
    })
    .catch(() => console.log('KV not available'));
}
