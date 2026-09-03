// Database abstraction layer
// Support KV (Vercel Redis) + fallback ke local memory

// User database fallback (local storage)
const localDB = {
  users: {
    'testuser': {
      username: 'testuser',
      hash: 'd4d0f19e3bb2e8c0e89a37c2ef8bbe0d9fe50caf0a7c4a13e8e92e5f8c1d7e6f',
      salt: '1234567890abcdef1234567890abcdef'
    },
    'admin': {
      username: 'admin',
      hash: 'a3a6d4e9b8c7f6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1b0a9f8e7d6c5b4a3',
      salt: 'fedcba9876543210fedcba9876543210'
    }
  },
  loginLogs: []
};

export async function getUser(username) {
  try {
    // Coba KV dulu
    if (global.kv) {
      const raw = await global.kv.get(`user:${username}`);
      if (raw) {
        return typeof raw === 'string' ? JSON.parse(raw) : raw;
      }
    }
  } catch (e) {
    console.log('KV get failed, using local DB:', e.message);
  }
  
  // Fallback ke local DB
  return localDB.users[username] || null;
}

export async function saveUser(username, hash, salt) {
  const userData = { username, hash, salt };
  
  // Simpan ke KV
  try {
    if (global.kv) {
      await global.kv.set(`user:${username}`, JSON.stringify(userData));
    }
  } catch (e) {
    console.log('KV save failed:', e.message);
  }
  
  // Simpan ke local DB juga (backup)
  localDB.users[username] = userData;
  
  return userData;
}

export async function logLogin(username, ip, success) {
  const entry = {
    username,
    ip,
    success,
    time: new Date().toISOString()
  };
  
  try {
    if (global.kv) {
      await global.kv.lpush('login_logs', JSON.stringify(entry));
      await global.kv.ltrim('login_logs', 0, 499);
    }
  } catch (e) {
    console.log('KV log failed:', e.message);
  }
  
  // Log ke local DB juga
  localDB.loginLogs.push(entry);
  if (localDB.loginLogs.length > 500) {
    localDB.loginLogs = localDB.loginLogs.slice(-500);
  }
}

export async function saveLastLogin(username, ip) {
  try {
    if (global.kv) {
      await global.kv.set(
        `lastlogin:${username}`,
        JSON.stringify({ ip, time: new Date().toISOString() })
      );
    }
  } catch (e) {
    console.log('KV lastlogin save failed:', e.message);
  }
}

// Initialize KV on first import
if (typeof window === 'undefined') {
  import('@vercel/kv').then(({ kv }) => {
    global.kv = kv;
  }).catch(e => {
    console.log('KV not available:', e.message);
  });
}
