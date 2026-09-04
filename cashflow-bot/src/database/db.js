const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'cashflow.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS wallets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  emoji TEXT DEFAULT '💰',
  balance INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK(type IN ('income','expense')),
  emoji TEXT DEFAULT '📌',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_id INTEGER NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK(type IN ('income','expense','transfer_in','transfer_out')),
  amount INTEGER NOT NULL,
  description TEXT DEFAULT '',
  transfer_pair_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  sheet_synced INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS budgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  limit_amount INTEGER NOT NULL,
  UNIQUE(category_id, month)
);

CREATE TABLE IF NOT EXISTS recurring (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_id INTEGER NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK(type IN ('income','expense')),
  amount INTEGER NOT NULL,
  description TEXT DEFAULT '',
  frequency TEXT NOT NULL CHECK(frequency IN ('daily','weekly','monthly')),
  next_run TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// Seed default categories & wallet kalau masih kosong
const catCount = db.prepare('SELECT COUNT(*) c FROM categories').get().c;
if (catCount === 0) {
  const insertCat = db.prepare('INSERT INTO categories (name, type, emoji) VALUES (?, ?, ?)');
  const defaults = [
    ['Gaji', 'income', '💼'], ['Bonus', 'income', '🎁'], ['Lainnya (Masuk)', 'income', '➕'],
    ['Makan', 'expense', '🍔'], ['Transport', 'expense', '🚗'], ['Belanja', 'expense', '🛍️'],
    ['Tagihan', 'expense', '🧾'], ['Hiburan', 'expense', '🎮'], ['Lainnya (Keluar)', 'expense', '➖'],
  ];
  const tx = db.transaction((rows) => rows.forEach(r => insertCat.run(...r)));
  tx(defaults);
}

const walletCount = db.prepare('SELECT COUNT(*) c FROM wallets').get().c;
if (walletCount === 0) {
  db.prepare('INSERT INTO wallets (name, emoji, balance) VALUES (?, ?, 0)').run('Cash', '💵');
}

module.exports = db;
