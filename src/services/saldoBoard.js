const db = require('../database/db');
const config = require('../config');
const { liveBalanceEmbed } = require('../utils/embeds');

let cachedClient = null;
let messageRef = null; // { channelId, messageId }

function attachClient(client) {
  cachedClient = client;
}

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setSetting(key, value) {
  db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);
}

function buildEmbed() {
  const wallets = db.prepare('SELECT * FROM wallets ORDER BY id').all();
  const total = wallets.reduce((s, w) => s + w.balance, 0);
  return liveBalanceEmbed(wallets, total);
}

/**
 * Dipanggil sekali saat bot online: cari pesan saldo lama (kalau ada, dari
 * restart sebelumnya) atau bikin baru kalau belum ada / sudah kehapus.
 */
async function init() {
  const channelId = config.channels.saldo;
  if (!channelId || !cachedClient) return;

  try {
    const channel = await cachedClient.channels.fetch(channelId);
    if (!channel) return;

    const storedMessageId = getSetting('saldo_message_id');
    let message = storedMessageId ? await channel.messages.fetch(storedMessageId).catch(() => null) : null;

    if (message) {
      messageRef = { channelId, messageId: message.id };
      await message.edit({ embeds: [buildEmbed()] });
      console.log('[SaldoBoard] Pesan saldo lama ditemukan, sudah di-refresh.');
    } else {
      const sent = await channel.send({ embeds: [buildEmbed()] });
      messageRef = { channelId, messageId: sent.id };
      setSetting('saldo_message_id', sent.id);
      await sent.pin().catch(() => {}); // pin best-effort, jangan gagalkan kalau bot gak punya izin pin
      console.log('[SaldoBoard] Pesan saldo baru dibuat & di-pin.');
    }
  } catch (err) {
    console.error('[SaldoBoard] Gagal inisialisasi:', err.message);
  }
}

/**
 * Dipanggil setiap kali saldo berubah (transaksi baru, hapus, transfer, recurring).
 * Self-healing: kalau pesan lama ternyata sudah kehapus manual, otomatis bikin ulang.
 */
async function refresh() {
  if (!config.channels.saldo || !cachedClient) return;

  if (!messageRef) {
    return init();
  }

  try {
    const channel = await cachedClient.channels.fetch(messageRef.channelId);
    const message = await channel.messages.fetch(messageRef.messageId);
    await message.edit({ embeds: [buildEmbed()] });
  } catch (err) {
    console.warn('[SaldoBoard] Pesan saldo tidak ditemukan, membuat ulang:', err.message);
    messageRef = null;
    await init();
  }
}

module.exports = { attachClient, init, refresh };
