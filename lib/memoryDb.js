// Shared in-memory database untuk semua API endpoints
// File ini di-import oleh login.js, register.js, seed.js, dan admin.js

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

export const memoryDB = {
  users: { ...DEFAULT_USERS },
  logs: [],
  lastLogins: {}
};

export function getMemoryUser(username) {
  return memoryDB.users[username] || null;
}

export function saveMemoryUser(username, userData) {
  memoryDB.users[username] = userData;
  return userData;
}

export function addMemoryLog(username, ip, success) {
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
