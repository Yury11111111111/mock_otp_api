const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

const DEFAULT_SETTINGS = {
  posWebhookUrl: '',
  bnplWebhookUrl: '',
  maxRetries: 3,
  retryDelaySeconds: 5
};

function defaultDB() {
  return {
    users: [],        // { username, passwordHash, createdAt }
    applications: [],  // + owner: username
    settings: {},      // { [username]: {...DEFAULT_SETTINGS} }
    logs: []           // + owner: username (когда известен)
  };
}

function ensureDB() {
  if (!fs.existsSync(path.dirname(DB_PATH))) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  }
  if (!fs.existsSync(DB_PATH)) {
    writeDB(defaultDB());
  }
}

function readDB() {
  ensureDB();
  const raw = fs.readFileSync(DB_PATH, 'utf-8');
  try {
    const db = JSON.parse(raw);
    // на случай апгрейда со старой версии базы без users/per-user settings
    if (!db.users) db.users = [];
    if (!db.settings || Array.isArray(db.settings)) db.settings = {};
    return db;
  } catch (e) {
    const db = defaultDB();
    writeDB(db);
    return db;
  }
}

function writeDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
}

function addLog(entry) {
  const db = readDB();
  db.logs.unshift({ timestamp: new Date().toISOString(), ...entry });
  db.logs = db.logs.slice(0, 300); // храним последние 300 записей
  writeDB(db);
}

// ---- Пароли (без внешних зависимостей, через встроенный scrypt) ----
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const check = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(check, 'hex'));
}

// ---- Пользователи (тех. учётки) ----
function findUser(db, username) {
  return db.users.find((u) => u.username === username);
}

function createUser(db, username, password) {
  const user = { username, passwordHash: hashPassword(password), createdAt: new Date().toISOString() };
  db.users.push(user);
  db.settings[username] = { ...DEFAULT_SETTINGS };
  writeDB(db);
  return user;
}

// ---- Настройки конкретного пользователя ----
function getSettingsForUser(username) {
  const db = readDB();
  return db.settings[username] || { ...DEFAULT_SETTINGS };
}

function setSettingsForUser(username, patch) {
  const db = readDB();
  db.settings[username] = { ...(db.settings[username] || DEFAULT_SETTINGS), ...patch };
  writeDB(db);
  return db.settings[username];
}

module.exports = {
  readDB, writeDB, addLog, ensureDB,
  findUser, createUser, hashPassword, verifyPassword,
  getSettingsForUser, setSettingsForUser,
  DEFAULT_SETTINGS
};
