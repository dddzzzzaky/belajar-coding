// Shared in-memory database untuk semua API endpoints
// Persistent across function invocations dalam same process

// Shared in-memory database untuk semua API endpoints
// Persistent across function invocations dalam same process

const DEFAULT_USERS = {
  'testuser': {
    username: 'testuser',
    hash: 'c80c55a4cce4f5f3a6b9e5c9c1c0e4f5b9c8f5c9b8d0e1f2a3b4c5d6e7f8a9',
    salt: '1234567890abcdef1234567890abcdef',
    createdAt: '2026-09-03T00:00:00.000Z'
  }
};

// Use global to persist across invocations
if (!global.memoryDBInstance) {
  global.memoryDBInstance = {
    users: { ...DEFAULT_USERS },
    logs: [],
    lastLogins: {}
  };
}

export const memoryDB = global.memoryDBInstance;

export function getMemoryUser(username) {
  return memoryDB.users[username] || null;
}

export function saveMemoryUser(username, userData) {
  memoryDB.users[username] = userData;
  return userData;
}

export async function addMemoryLog(username, ip, success) {
  const entry = {
    username,
    ip,
    success,
    time: new Date().toISOString()
  };
  memoryDB.logs.push(entry);
  if (memoryDB.logs.length > 500) {
    memoryDB.logs = memoryDB.logs.slice(-500);
  }

  try {
    if (global.kv) {
      await global.kv.lpush('login_logs', JSON.stringify(entry));
      await global.kv.ltrim('login_logs', 0, 499);
    }
  } catch (e) {
    console.log('KV log failed:', e.message);
  }

  return entry;
}

export function saveMemoryLastLogin(username, ip) {
  memoryDB.lastLogins[username] = {
    ip,
    time: new Date().toISOString()
  };
}

export function getMemoryLastLogin(username) {
  return memoryDB.lastLogins[username] || null;
}
