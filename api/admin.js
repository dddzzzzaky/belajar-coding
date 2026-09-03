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
  },
  logs: []
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { adminUser, adminPass } = req.body || {};

  if (
    !process.env.ADMIN_USERNAME ||
    !process.env.ADMIN_PASSWORD ||
    adminUser !== process.env.ADMIN_USERNAME ||
    adminPass !== process.env.ADMIN_PASSWORD
  ) {
    return res.status(403).json({ error: 'Bukan administrator' });
  }

  try {
    let usernames = [];
    let logs = [...memoryDB.logs];

    // Try to get from KV
    try {
      if (global.kv) {
        const kvUsers = (await global.kv.smembers('all_users')) || [];
        usernames = [...new Set([...usernames, ...kvUsers])];
        
        const kvLogs = (await global.kv.lrange('login_logs', 0, 99)) || [];
        logs = [...kvLogs.map(l => typeof l === 'string' ? JSON.parse(l) : l), ...logs];
      }
    } catch (e) {
      console.log('KV fetch failed:', e.message);
    }

    // Add users from memory
    usernames = [...new Set([...usernames, ...Object.keys(memoryDB.users)])];

    // Get user details
    const users = [];
    for (const u of usernames) {
      let user = memoryDB.users[u];
      
      // Try KV if not in memory
      if (!user && global.kv) {
        try {
          const raw = await global.kv.get(`user:${u}`);
          user = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null;
        } catch (e) {
          console.log('KV user fetch failed:', e.message);
        }
      }

      if (user) {
        let lastLogin = null;
        
        // Try to get last login from KV
        if (global.kv) {
          try {
            const raw = await global.kv.get(`lastlogin:${u}`);
            lastLogin = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null;
          } catch (e) {
            console.log('KV lastlogin fetch failed:', e.message);
          }
        }

        users.push({
          username: u,
          createdAt: user.createdAt || null,
          lastLoginIp: lastLogin?.ip || '-',
          lastLoginTime: lastLogin?.time || null
        });
      }
    }

    return res.status(200).json({
      totalUsers: users.length,
      users,
      logs: logs.slice(0, 100)
    });
  } catch (e) {
    console.error('Admin error:', e);
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
