const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../database/db');
const sheets = require('../services/sheetsService');
const notifier = require('../services/notifier');
const saldoBoard = require('../services/saldoBoard');
const config = require('../config');
const { errorEmbed, successEmbed, baseEmbed } = require('../utils/embeds');
const { formatRupiah, currentMonthKey } = require('../utils/format');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('edit')
    .setDescription('Ubah transaksi (nominal/deskripsi/kategori) tanpa hapus-catat ulang')
    .addIntegerOption(o => o.setName('id').setDescription('ID transaksi (lihat di /riwayat)').setRequired(true))
    .addIntegerOption(o => o.setName('jumlah_baru').setDescription('Nominal baru (kosongkan kalau gak diubah)').setMinValue(1))
    .addStringOption(o => o.setName('deskripsi_baru').setDescription('Deskripsi baru (kosongkan kalau gak diubah)'))
    .addStringOption(o => o.setName('kategori_baru').setDescription('Kategori baru (kosongkan kalau gak diubah)').setAutocomplete(true)),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused();
    const id = interaction.options.getInteger('id');
    const tx = id ? db.prepare('SELECT * FROM transactions WHERE id = ?').get(id) : null;
    const type = tx ? tx.type : null;
    const cats = type
      ? db.prepare('SELECT name FROM categories WHERE type = ?').all(type)
      : db.prepare('SELECT name FROM categories').all();
    const filtered = cats.filter(c => c.name.toLowerCase().includes(focused.toLowerCase()));
    return interaction.respond(filtered.slice(0, 25).map(c => ({ name: c.name, value: c.name })));
  },

  async execute(interaction) {
    const id = interaction.options.getInteger('id');
    const jumlahBaru = interaction.options.getInteger('jumlah_baru');
    const deskripsiBaru = interaction.options.getString('deskripsi_baru');
    const kategoriBaru = interaction.options.getString('kategori_baru');

    const tx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
    if (!tx) return interaction.reply({ embeds: [errorEmbed('Tidak Ditemukan', `Transaksi #${id} tidak ada.`)], ephemeral: true });

    if (tx.type === 'transfer_in' || tx.type === 'transfer_out') {
      return interaction.reply({ embeds: [errorEmbed('Tidak Bisa Diedit', 'Transaksi transfer tidak bisa diedit langsung — hapus lalu catat ulang pakai `/hapus` dan `/catat transfer`.')], ephemeral: true });
    }

    if (jumlahBaru == null && deskripsiBaru == null && kategoriBaru == null) {
      return interaction.reply({ embeds: [errorEmbed('Tidak Ada Perubahan', 'Isi minimal salah satu dari jumlah_baru, deskripsi_baru, atau kategori_baru.')], ephemeral: true });
    }

    let newCategory = null;
    if (kategoriBaru != null) {
      newCategory = db.prepare('SELECT * FROM categories WHERE name = ? AND type = ?').get(kategoriBaru, tx.type);
      if (!newCategory) return interaction.reply({ embeds: [errorEmbed('Kategori Tidak Valid', `Kategori "${kategoriBaru}" tidak ada untuk tipe ${tx.type === 'income' ? 'pemasukan' : 'pengeluaran'}.`)], ephemeral: true });
    }

    const wallet = db.prepare('SELECT * FROM wallets WHERE id = ?').get(tx.wallet_id);
    const oldCategory = db.prepare('SELECT * FROM categories WHERE id = ?').get(tx.category_id);

    const newAmount = jumlahBaru != null ? jumlahBaru : tx.amount;
    const newDescription = deskripsiBaru != null ? deskripsiBaru : tx.description;
    const finalCategory = newCategory || oldCategory;

    const oldDelta = tx.type === 'income' ? tx.amount : -tx.amount;
    const newDelta = tx.type === 'income' ? newAmount : -newAmount;
    const netChange = newDelta - oldDelta;
    const projectedBalance = wallet.balance + netChange;

    if (tx.type === 'expense' && projectedBalance < 0) {
      return interaction.reply({ embeds: [errorEmbed('Saldo Tidak Cukup', `Perubahan ini bikin saldo ${wallet.name} jadi minus (${formatRupiah(projectedBalance)}).`)], ephemeral: true });
    }

    const changeLines = [];
    if (jumlahBaru != null && jumlahBaru !== tx.amount) changeLines.push(`Jumlah: ${formatRupiah(tx.amount)} → ${formatRupiah(newAmount)}`);
    if (deskripsiBaru != null && deskripsiBaru !== tx.description) changeLines.push(`Deskripsi: "${tx.description || '-'}" → "${newDescription || '-'}"`);
    if (newCategory && newCategory.id !== tx.category_id) changeLines.push(`Kategori: ${oldCategory?.emoji || ''} ${oldCategory?.name || '-'} → ${newCategory.emoji} ${newCategory.name}`);

    if (changeLines.length === 0) {
      return interaction.reply({ embeds: [errorEmbed('Tidak Ada Perubahan', 'Nilai yang kamu masukkan sama persis dengan yang sekarang.')], ephemeral: true });
    }

    const txChannel = config.channels.transaksi || config.channels.default;
    const routeToOtherChannel = txChannel && interaction.channelId !== txChannel;

    const confirmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('edit_confirm').setLabel('✅ Simpan Perubahan').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('edit_cancel').setLabel('Batal').setStyle(ButtonStyle.Secondary),
    );
    const previewEmbed = baseEmbed().setTitle(`⚠️ Konfirmasi Edit Transaksi #${id}`).setDescription(changeLines.join('\n'));

    const reply = await interaction.reply({ embeds: [previewEmbed], components: [confirmRow], ephemeral: routeToOtherChannel, withResponse: true });
    const collector = reply.resource.message.createMessageComponentCollector({ time: 30_000, max: 1 });

    collector.on('collect', async (btn) => {
      if (btn.user.id !== interaction.user.id) return btn.reply({ content: 'Bukan konfirmasi kamu.', ephemeral: true });

      if (btn.customId === 'edit_cancel') {
        return btn.update({ embeds: [successEmbed('Dibatalkan', 'Transaksi tidak diubah.')], components: [] });
      }

      const freshTx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
      if (!freshTx) return btn.update({ embeds: [errorEmbed('Sudah Terhapus', 'Transaksi ini sudah tidak ada.')], components: [] });

      db.transaction(() => {
        db.prepare('UPDATE transactions SET amount = ?, description = ?, category_id = ? WHERE id = ?')
          .run(newAmount, newDescription, finalCategory.id, id);
        db.prepare('UPDATE wallets SET balance = balance + ? WHERE id = ?').run(netChange, wallet.id);
      })();

      const updatedTx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
      const updatedWallet = db.prepare('SELECT * FROM wallets WHERE id = ?').get(wallet.id);

      const resultEmbed = successEmbed('Transaksi Diperbarui', `${changeLines.join('\n')}\n\nSaldo ${updatedWallet.name} sekarang: ${formatRupiah(updatedWallet.balance)}`);

      if (routeToOtherChannel) {
        await btn.update({ content: `✅ Transaksi #${id} diperbarui — cek detail di <#${txChannel}>`, embeds: [], components: [] });
        notifier.notifyTransaksi({ embeds: [resultEmbed] });
      } else {
        await btn.update({ embeds: [resultEmbed], components: [] });
      }

      sheets.updateTransaction(updatedTx, updatedWallet.name, finalCategory.name);
      const allWallets = db.prepare('SELECT * FROM wallets').all();
      const total = allWallets.reduce((s, w) => s + w.balance, 0);
      sheets.syncSummary(allWallets, total);
      saldoBoard.refresh();

      if (updatedTx.type === 'expense') {
        await checkBudget(finalCategory);
      }
    });

    collector.on('end', (collected) => {
      if (collected.size === 0) {
        interaction.editReply({ components: [] }).catch(() => {});
      }
    });
  },
};

async function checkBudget(category) {
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
