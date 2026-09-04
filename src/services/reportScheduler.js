const cron = require('node-cron');
const { EmbedBuilder } = require('discord.js');
const db = require('../database/db');
const sheets = require('./sheetsService');
const chartService = require('./chartService');
const notifier = require('./notifier');
const config = require('../config');
const { formatRupiah } = require('../utils/format');

function nextRunDate(frequency, from = new Date()) {
  const d = new Date(from);
  if (frequency === 'daily') d.setDate(d.getDate() + 1);
  if (frequency === 'weekly') d.setDate(d.getDate() + 7);
  if (frequency === 'monthly') d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

async function processRecurring(client) {
  const due = db.prepare(`SELECT * FROM recurring WHERE active = 1 AND next_run <= datetime('now')`).all();
  if (due.length === 0) return;

  for (const r of due) {
    const delta = r.type === 'income' ? r.amount : -r.amount;
    const insertTx = db.prepare(`INSERT INTO transactions (wallet_id, category_id, type, amount, description) VALUES (?, ?, ?, ?, ?)`);
    let txId;
    db.transaction(() => {
      const result = insertTx.run(r.wallet_id, r.category_id, r.type, r.amount, `[Otomatis] ${r.description}`);
      txId = result.lastInsertRowid;
      db.prepare('UPDATE wallets SET balance = balance + ? WHERE id = ?').run(delta, r.wallet_id);
      db.prepare('UPDATE recurring SET next_run = ? WHERE id = ?').run(nextRunDate(r.frequency), r.id);
    })();

    const wallet = db.prepare('SELECT * FROM wallets WHERE id = ?').get(r.wallet_id);
    const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(r.category_id);
    const tx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(txId);
    sheets.appendTransaction(tx, wallet.name, category?.name);

    notifier.notifyRecurring({ embeds: [new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🔁 Transaksi Berulang Tereksekusi')
      .setDescription(`${category?.emoji || ''} ${category?.name || '-'} — ${formatRupiah(r.amount)} via ${wallet.emoji} ${wallet.name}\n${r.description}`)] });

    // Log transaksinya juga ke channel transaksi biar tercatat konsisten
    notifier.notifyTransaksi({ embeds: [new EmbedBuilder()
      .setColor(r.type === 'income' ? 0x57F287 : 0xED4245)
      .setTitle(`${r.type === 'income' ? '📥 Pemasukan' : '📤 Pengeluaran'} Otomatis`)
      .addFields(
        { name: 'Jumlah', value: formatRupiah(r.amount), inline: true },
        { name: 'Dompet', value: `${wallet.emoji} ${wallet.name}`, inline: true },
        { name: 'Kategori', value: category ? `${category.emoji} ${category.name}` : '-', inline: true },
      ).setFooter({ text: `ID Transaksi: ${txId} · via /berulang #${r.id}` })] });
  }

  const allWallets = db.prepare('SELECT * FROM wallets').all();
  const total = allWallets.reduce((s, w) => s + w.balance, 0);
  sheets.syncSummary(allWallets, total);
}

async function sendPeriodicReport(client, label, dayFilter) {
  const totalIncome = db.prepare(`SELECT COALESCE(SUM(amount),0) t FROM transactions WHERE type='income' AND ${dayFilter}`).get().t;
  const totalExpense = db.prepare(`SELECT COALESCE(SUM(amount),0) t FROM transactions WHERE type='expense' AND ${dayFilter}`).get().t;
  const byCategory = db.prepare(`
    SELECT c.name, c.emoji, SUM(t.amount) as total FROM transactions t
    JOIN categories c ON c.id = t.category_id
    WHERE t.type = 'expense' AND ${dayFilter} GROUP BY c.id ORDER BY total DESC
  `).all();

  const embed = new EmbedBuilder().setColor(0x5865F2).setTitle(`📅 Laporan Otomatis — ${label}`)
    .addFields(
      { name: 'Pemasukan', value: formatRupiah(totalIncome), inline: true },
      { name: 'Pengeluaran', value: formatRupiah(totalExpense), inline: true },
      { name: 'Selisih', value: formatRupiah(totalIncome - totalExpense), inline: true },
    ).setTimestamp();

  if (byCategory.length > 0) embed.setImage(chartService.pieChartByCategory(byCategory));
  notifier.notifyLaporan({ embeds: [embed] });
}

function start(client) {
  // Cek transaksi berulang tiap jam
  cron.schedule('0 * * * *', () => processRecurring(client), { timezone: config.timezone });

  // Laporan mingguan tiap Senin jam 8 pagi
  cron.schedule('0 8 * * 1', () => sendPeriodicReport(client, 'Mingguan', "created_at >= datetime('now', '-7 days')"), { timezone: config.timezone });

  // Laporan bulanan tiap tanggal 1 jam 8 pagi
  cron.schedule('0 8 1 * *', () => sendPeriodicReport(client, 'Bulanan', "strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')"), { timezone: config.timezone });

  console.log('[Scheduler] Cron jobs aktif: recurring (tiap jam), laporan mingguan & bulanan.');
}

module.exports = { start };
