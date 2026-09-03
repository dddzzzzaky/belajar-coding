import { kv } from '@vercel/kv';
import crypto from 'crypto';

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Cek apakah user test sudah ada
    const existing = await kv.get('user:testuser');
    if (existing) {
      return res.json({ 
        success: true, 
        message: 'User testuser sudah ada',
        username: 'testuser',
        password: 'password123'
      });
    }

    // Buat user test
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashPassword('password123', salt);

    await kv.set('user:testuser', JSON.stringify({
      username: 'testuser',
      hash,
      salt
    }));

    return res.json({ 
      success: true, 
      message: 'User test berhasil dibuat',
      username: 'testuser',
      password: 'password123',
      nextStep: 'Coba login dengan credentials ini'
    });
  } catch (e) {
    console.error('Seed error:', e);
    return res.status(500).json({
      error: 'Server error saat seeding data'
    });
  }
}
