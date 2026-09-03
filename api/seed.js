import crypto from 'crypto';

// In-memory database dengan default users
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

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Cek testuser di memory
    const testuser = memoryDB.users['testuser'];
    
    if (testuser) {
      return res.json({ 
        success: true, 
        message: 'User testuser sudah ada',
        username: 'testuser',
        password: 'password123',
        info: 'Gunakan credentials ini untuk login'
      });
    }

    // Jika belum ada, buat user test
    const salt = '1234567890abcdef1234567890abcdef';
    const hash = 'c80c55a4cce4f5f3a6b9e5c9c1c0e4f5b9c8f5c9b8d0e1f2a3b4c5d6e7f8a9';

    memoryDB.users['testuser'] = {
      username: 'testuser',
      hash,
      salt,
      createdAt: new Date().toISOString()
    };

    // Coba save ke KV juga
    if (global.kv) {
      try {
        await global.kv.set('user:testuser', JSON.stringify(memoryDB.users['testuser']));
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
