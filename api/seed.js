import { memoryDB, saveMemoryUser } from '../lib/memoryDb.js';

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Check if testuser already exists in memory
    if (memoryDB.users['testuser']) {
      return res.json({ 
        success: true, 
        message: 'User testuser sudah ada',
        username: 'testuser',
        password: 'password123',
        info: 'Gunakan credentials ini untuk login'
      });
    }

    // If not, create testuser
    const salt = '1234567890abcdef1234567890abcdef';
    const hash = 'c80c55a4cce4f5f3a6b9e5c9c1c0e4f5b9c8f5c9b8d0e1f2a3b4c5d6e7f8a9';

    saveMemoryUser('testuser', {
      username: 'testuser',
      hash,
      salt,
      createdAt: new Date().toISOString()
    });

    // Try save to KV also
    if (global.kv) {
      try {
        await global.kv.set('user:testuser', JSON.stringify({
          username: 'testuser',
          hash,
          salt,
          createdAt: new Date().toISOString()
        }));
        await global.kv.sadd('all_users', 'testuser');
      } catch (e) {
        console.log('KV save failed (but memory saved):', e.message);
      }
    }

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

// Initialize KV
if (typeof window === 'undefined') {
  import('@vercel/kv')
    .then(({ kv }) => {
      global.kv = kv;
    })
    .catch(() => console.log('KV not available'));
}
