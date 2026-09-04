const { SlashCommandBuilder } = require('discord.js');
const db = require('../database/db');
const sheets = require('../services/sheetsService');
const notifier = require('../services/notifier');
const saldoBoard = require('../services/saldoBoard');
const config = require('../config');
const { transactionEmbed, errorEmbed, successEmbed } = require('../utils/embeds');
const { formatRupiah, currentMonthKey } = require('../utils/format');

async function getWalletChoices() {
  return db.prepare('SELECT id, name FROM wallets').all();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('catat')
    .setDescription('Catat transaksi cash flow')
    .addSubcommand(sub => sub.setName('masuk').setDescription('Catat pemasukan')
      .addIntegerOption(o => o.setName('jumlah').setDescription('Nominal (angka saja)').setRequired(true).setMinValue(1))
      .addStringOption(o => o.setName('kategori').setDescription('Kategori').setRequired(true).setAutocomplete(true))
      .addStringOption(o => o.setName('dompet').setDescription('Dompet tujuan').setRequired(true).setAutocomplete(true))
      .addStringOption(o => o.setName('deskripsi').setDescription('Catatan tambahan')))
    .addSubcommand(sub => sub.setName('keluar').setDescription('Catat pengeluaran')
      .addIntegerOption(o => o.setName('jumlah').setDescription('Nominal (angka saja)').setRequired(true).setMinValue(1))
      .addStringOption(o => o.setName('kategori').setDescription('Kategori').setRequired(true).setAutocomplete(true))
      .addStringOption(o => o.setName('dompet').setDescription('Dompet sumber').setRequired(true).setAutocomplete(true))
      .addStringOption(o => o.setName('deskripsi').setDescription('Catatan tambahan')))
    .addSubcommand(sub => sub.setName('transfer').setDescription('Transfer saldo antar dompet')
      .addIntegerOption(o => o.setName('jumlah').setDescription('Nominal (angka saja)').setRequired(true).setMinValue(1))
      .addStringOption(o => o.setName('dari').setDescription('Dompet asal').setRequired(true).setAutocomplete(true))
      .addStringOption(o => o.setName('ke').setDescription('Dompet tujuan').setRequired(true).setAutocomplete(true))
      .addIntegerOption(o => o.setName('biaya_admin').setDescription('Biaya admin transfer, kalau ada (default 0)').setMinValue(0))
      .addStringOption(o => o.setName('deskripsi').setDescription('Catatan tambahan'))),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    if (focused.name === 'dompet' || focused.name === 'dari' || focused.name === 'ke') {
      const wallets = await getWalletChoices();
      const filtered = wallets.filter(w => w.name.toLowerCase().includes(focused.value.toLowerCase()));
      return interaction.respond(filtered.slice(0, 25).map(w => ({ name: w.name, value: w.name })));
    }
    if (focused.name === 'kategori') {
      const sub = interaction.options.getSubcommand();
      const type = sub === 'masuk' ? 'income' : 'expense';
      const cats = db.prepare('SELECT name FROM categories WHERE type = ?').all(type);
      const filtered = cats.filter(c => c.name.toLowerCase().includes(focused.value.toLowerCase()));
      return interaction.respond(filtered.slice(0, 25).map(c => ({ name: c.name, value: c.name })));
    }
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const jumlah = interaction.options.getInteger('jumlah');
    const deskripsi = interaction.options.getString('deskripsi') || '';

    if (sub === 'transfer') {
      return handleTransfer(interaction, jumlah, deskripsi);
    }

    const walletName = interaction.options.getString('dompet');
    const categoryName = interaction.options.getString('kategori');
    const type = sub === 'masuk' ? 'income' : 'expense';

    const wallet = db.prepare('SELECT * FROM wallets WHERE name = ?').get(walletName);
    if (!wallet) return interaction.reply({ embeds: [errorEmbed('Dompet Tidak Ditemukan', `Dompet "${walletName}" tidak ada. Cek \`/dompet list\`.`)], ephemeral: true });

    const category = db.prepare('SELECT * FROM categories WHERE name = ? AND type = ?').get(categoryName, type);
    if (!category) return interaction.reply({ embeds: [errorEmbed('Kategori Tidak Ditemukan', `Kategori "${categoryName}" tidak ada untuk tipe ini. Cek \`/kategori list\`.`)], ephemeral: true });

    if (type === 'expense' && wallet.balance < jumlah) {
      return interaction.reply({ embeds: [errorEmbed('Saldo Tidak Cukup', `Saldo ${wallet.name} hanya ${formatRupiah(wallet.balance)}.`)], ephemeral: true });
    }

    const delta = type === 'income' ? jumlah : -jumlah;
    const insertTx = db.prepare(`INSERT INTO transactions (wallet_id, category_id, type, amount, description) VALUES (?, ?, ?, ?, ?)`);
    const updateWallet = db.prepare('UPDATE wallets SET balance = balance + ? WHERE id = ?');

    let txId;
    db.transaction(() => {
      const result = insertTx.run(wallet.id, category.id, type, jumlah, deskripsi);
      txId = result.lastInsertRowid;
      updateWallet.run(delta, wallet.id);
    })();

    const updatedWallet = db.prepare('SELECT * FROM wallets WHERE id = ?').get(wallet.id);
    const tx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(txId);

    const txEmbed = transactionEmbed(tx, updatedWallet, category);
    const txChannel = config.channels.transaksi || config.channels.default;
    const confirmText = txChannel && interaction.channelId !== txChannel
      ? `✅ ${type === 'income' ? 'Pemasukan' : 'Pengeluaran'} ${formatRupiah(jumlah)} tercatat — cek detail di <#${txChannel}>`
      : undefined;
    await notifier.replyRouted(interaction, 'transaksi', txEmbed, { confirmText });

    // Sync ke Sheets & cek budget, tanpa blok response
    sheets.appendTransaction(tx, updatedWallet.name, category.name);
    const allWallets = db.prepare('SELECT * FROM wallets').all();
    const total = allWallets.reduce((s, w) => s + w.balance, 0);
    sheets.syncSummary(allWallets, total);
    saldoBoard.refresh();

    if (type === 'expense') {
      await checkBudget(interaction, category);
    }
  },
};

async function handleTransfer(interaction, jumlah, deskripsi) {
  const fromName = interaction.options.getString('dari');
  const toName = interaction.options.getString('ke');
  const biayaAdmin = interaction.options.getInteger('biaya_admin') || 0;
  if (fromName === toName) {
    return interaction.reply({ embeds: [errorEmbed('Tidak Valid', 'Dompet asal dan tujuan tidak boleh sama.')], ephemeral: true });
  }
  const from = db.prepare('SELECT * FROM wallets WHERE name = ?').get(fromName);
  const to = db.prepare('SELECT * FROM wallets WHERE name = ?').get(toName);
  if (!from || !to) return interaction.reply({ embeds: [errorEmbed('Dompet Tidak Ditemukan', 'Cek nama dompet dengan `/dompet list`.')], ephemeral: true });

  const totalTerpotong = jumlah + biayaAdmin;
  if (from.balance < totalTerpotong) {
    return interaction.reply({ embeds: [errorEmbed('Saldo Tidak Cukup', `Saldo ${from.name} hanya ${formatRupiah(from.balance)}, butuh ${formatRupiah(totalTerpotong)} (termasuk biaya admin ${formatRupiah(biayaAdmin)}).`)], ephemeral: true });
  }

  const insertTx = db.prepare(`INSERT INTO transactions (wallet_id, category_id, type, amount, description) VALUES (?, NULL, ?, ?, ?)`);
  const updateWallet = db.prepare('UPDATE wallets SET balance = balance + ? WHERE id = ?');
  const linkPair = db.prepare('UPDATE transactions SET transfer_pair_id = ? WHERE id = ?');

  let feeTxId = null;
  let feeCategory = null;

  db.transaction(() => {
    const outTx = insertTx.run(from.id, 'transfer_out', jumlah, deskripsi);
    const inTx = insertTx.run(to.id, 'transfer_in', jumlah, deskripsi);
    updateWallet.run(-jumlah, from.id);
    updateWallet.run(jumlah, to.id);
    linkPair.run(inTx.lastInsertRowid, outTx.lastInsertRowid);
    linkPair.run(outTx.lastInsertRowid, inTx.lastInsertRowid);

    if (biayaAdmin > 0) {
      // Auto-buat kategori "Biaya Admin" kalau belum ada, biar biaya transfer
      // ikut kelihatan di laporan & budget, bukan cuma "ilang" dari saldo.
      feeCategory = db.prepare("SELECT * FROM categories WHERE name = ? AND type = 'expense'").get('Biaya Admin');
      if (!feeCategory) {
        db.prepare('INSERT INTO categories (name, type, emoji) VALUES (?, ?, ?)').run('Biaya Admin', 'expense', '🏦');
        feeCategory = db.prepare("SELECT * FROM categories WHERE name = ? AND type = 'expense'").get('Biaya Admin');
      }
      const feeResult = db.prepare(`INSERT INTO transactions (wallet_id, category_id, type, amount, description) VALUES (?, ?, 'expense', ?, ?)`)
        .run(from.id, feeCategory.id, biayaAdmin, `Biaya admin transfer ke ${to.name}`);
      feeTxId = feeResult.lastInsertRowid;
      updateWallet.run(-biayaAdmin, from.id);
    }
  })();

  const updatedFrom = db.prepare('SELECT * FROM wallets WHERE id = ?').get(from.id);
  const updatedTo = db.prepare('SELECT * FROM wallets WHERE id = ?').get(to.id);

  const feeLine = biayaAdmin > 0 ? `\nBiaya admin: ${formatRupiah(biayaAdmin)}` : '';
  const transferEmbed = successEmbed('Transfer Berhasil', `${formatRupiah(jumlah)} dari **${from.name}** ke **${to.name}**${feeLine}\n\nSaldo ${from.name}: ${formatRupiah(updatedFrom.balance)}\nSaldo ${to.name}: ${formatRupiah(updatedTo.balance)}`);
  const txChannel = config.channels.transaksi || config.channels.default;
  const confirmText = txChannel && interaction.channelId !== txChannel
    ? `✅ Transfer ${formatRupiah(jumlah)}${biayaAdmin > 0 ? ` (+biaya admin ${formatRupiah(biayaAdmin)})` : ''} tercatat — cek detail di <#${txChannel}>`
    : undefined;
  await notifier.replyRouted(interaction, 'transaksi', transferEmbed, { confirmText });

  if (biayaAdmin > 0 && feeTxId) {
    const feeTx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(feeTxId);
    sheets.appendTransaction(feeTx, from.name, feeCategory.name);
    await checkBudget(interaction, feeCategory);
  }

  const allWallets = db.prepare('SELECT * FROM wallets').all();
  const total = allWallets.reduce((s, w) => s + w.balance, 0);
  sheets.syncSummary(allWallets, total);
  saldoBoard.refresh();
}

async function checkBudget(interaction, category) {
  const month = currentMonthKey();
  const budget = db.prepare('SELECT * FROM budgets WHERE category_id = ? AND month = ?').get(category.id, month);
  if (!budget) return;

  const spent = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) total FROM transactions
    WHERE category_id = ? AND type = 'expense' AND strftime('%Y-%m', created_at) = ?
  `).get(category.id, month).total;

  const pct = spent / budget.limit_amount;
  if (pct >= 1) {
    notifier.notifyBudget({ embeds: [errorEmbed('Budget Terlampaui!', `Kategori **${category.name}** sudah ${formatRupiah(spent)} dari budget ${formatRupiah(budget.limit_amount)} bulan ini (${Math.round(pct * 100)}%).`)] });
  } else if (pct >= 0.8) {
    notifier.notifyBudget({ embeds: [errorEmbed('Mendekati Limit Budget', `Kategori **${category.name}** sudah ${formatRupiah(spent)} dari budget ${formatRupiah(budget.limit_amount)} bulan ini (${Math.round(pct * 100)}%).`)] });
  }
}
