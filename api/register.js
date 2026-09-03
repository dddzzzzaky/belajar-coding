import { kv } from '@vercel/kv';
import crypto from 'crypto';

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'Username dan password wajib diisi' });
  }
  if (
    process.env.ADMIN_USERNAME &&
    username.toLowerCase() === process.env.ADMIN_USERNAME.toLowerCase()
  ) {
    return res.status(409).json({ error: 'Username ini sudah dipakai, coba yang lain' });
  }

  try {
    const existing = await kv.get(`user:${username}`);
    if (existing) {
      return res.status(409).json({ error: 'Username udah dipake, coba yang lain' });
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashPassword(password, salt);

    const userRecord = {
      username,
      salt,
      hash,
      createdAt: new Date().toISOString()
    };

    await kv.set(`user:${username}`, JSON.stringify(userRecord));
    await kv.sadd('all_users', username);

    return res.status(200).json({ success: true });
  } catch (e) {
    console.error('Register error:', e);
    return res.status(500).json({
      error: 'Server lagi bermasalah, kemungkinan database (KV) belum tersambung ke project ini.'
    });
  }
}
