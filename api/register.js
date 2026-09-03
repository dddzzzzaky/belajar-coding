import crypto from 'crypto';

// In-memory database
let memoryDB = {
  users: {
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
  }
};

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

async function saveUser(username, hash, salt) {
  const userData = {
    username,
    salt,
    hash,
    createdAt: new Date().toISOString()
  };

  // Save to KV if available
  try {
    if (global.kv) {
      await global.kv.set(`user:${username}`, JSON.stringify(userData));
      await global.kv.sadd('all_users', username);
    }
  } catch (e) {
    console.log('KV save failed:', e.message);
  }

  // Save to memory (always works)
  memoryDB.users[username] = userData;
  return userData;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'Username dan password wajib diisi' });
  }

  if (username.length < 3) {
    return res.status(400).json({ error: 'Username minimal 3 karakter' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password minimal 6 karakter' });
  }

  // Prevent admin username
  if (
    process.env.ADMIN_USERNAME &&
    username.toLowerCase() === process.env.ADMIN_USERNAME.toLowerCase()
  ) {
    return res.status(409).json({ error: 'Username ini sudah dipakai' });
  }

  try {
    // Check if user exists in memory
    if (memoryDB.users[username]) {
      return res.status(409).json({ error: 'Username sudah terdaftar' });
    }

    // Check if exists in KV
    if (global.kv) {
      try {
        const existing = await global.kv.get(`user:${username}`);
        if (existing) {
          return res.status(409).json({ error: 'Username sudah terdaftar' });
        }
      } catch (e) {
        console.log('KV check failed:', e.message);
      }
    }

    // Create new user
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashPassword(password, salt);

    await saveUser(username, hash, salt);

    return res.status(201).json({ success: true, message: 'Berhasil daftar!' });
  } catch (e) {
    console.error('Register error:', e);
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
