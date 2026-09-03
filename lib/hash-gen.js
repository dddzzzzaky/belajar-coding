import crypto from 'crypto';

// Hash generator helper - untuk generate hash yang benar
function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

// Generate hash untuk default users
const testSalt = '1234567890abcdef1234567890abcdef';
const adminSalt = 'fedcba9876543210fedcba9876543210';

const testHash = hashPassword('password123', testSalt);
const adminHash = hashPassword('admin123', adminSalt);

console.log('testuser hash:', testHash);
console.log('admin hash:', adminHash);
console.log('');
console.log('Paste ini ke api/login.js DEFAULT_USERS:');
console.log(`const DEFAULT_USERS = {
  'testuser': {
    username: 'testuser',
    hash: '${testHash}',
    salt: '${testSalt}'
  },
  'admin': {
    username: 'admin',
    hash: '${adminHash}',
    salt: '${adminSalt}'
  }
};`);
