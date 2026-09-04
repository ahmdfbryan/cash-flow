const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../database/db');
const sheets = require('../services/sheetsService');
const notifier = require('../services/notifier');
const config = require('../config');
const { errorEmbed, successEmbed, baseEmbed } = require('../utils/embeds');
const { formatRupiah } = require('../utils/format');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('hapus')
    .setDescription('Hapus transaksi berdasarkan ID (lihat ID di /riwayat)')
    .addIntegerOption(o => o.setName('id').setDescription('ID transaksi').setRequired(true)),

  async execute(interaction) {
    const id = interaction.options.getInteger('id');
    const tx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
    if (!tx) return interaction.reply({ embeds: [errorEmbed('Tidak Ditemukan', `Transaksi #${id} tidak ada.`)], ephemeral: true });

    const txChannel = config.channels.transaksi || config.channels.default;
    const routeToOtherChannel = txChannel && interaction.channelId !== txChannel;

    const confirmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`hapus_confirm_${id}`).setLabel('Ya, Hapus').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('hapus_cancel').setLabel('Batal').setStyle(ButtonStyle.Secondary),
    );

    const embed = baseEmbed().setTitle('⚠️ Konfirmasi Hapus')
      .setDescription(`Yakin mau hapus transaksi #${id} sebesar **${formatRupiah(tx.amount)}**?\n${tx.type === 'transfer_in' || tx.type === 'transfer_out' ? '⚠️ Ini transaksi transfer, pasangannya juga akan ikut terhapus.' : ''}`);

    // Kalau command dijalankan bukan di channel transaksi, dialog konfirmasinya dibuat
    // ephemeral (cuma kamu yang lihat) — hasil akhirnya baru dikirim ke channel transaksi.
    const reply = await interaction.reply({ embeds: [embed], components: [confirmRow], ephemeral: routeToOtherChannel, withResponse: true });

    const collector = reply.resource.message.createMessageComponentCollector({ time: 30_000, max: 1 });
    collector.on('collect', async (btn) => {
      if (btn.user.id !== interaction.user.id) return btn.reply({ content: 'Bukan konfirmasi kamu.', ephemeral: true });

      if (btn.customId === 'hapus_cancel') {
        return btn.update({ embeds: [successEmbed('Dibatalkan', 'Transaksi tidak dihapus.')], components: [] });
      }

      const freshTx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
      if (!freshTx) return btn.update({ embeds: [errorEmbed('Sudah Terhapus', 'Transaksi ini sudah tidak ada.')], components: [] });

      const revertAmount = (freshTx.type === 'income' || freshTx.type === 'transfer_in') ? -freshTx.amount : freshTx.amount;

      db.transaction(() => {
        db.prepare('UPDATE wallets SET balance = balance + ? WHERE id = ?').run(revertAmount, freshTx.wallet_id);
        db.prepare('DELETE FROM transactions WHERE id = ?').run(freshTx.id);
        if (freshTx.transfer_pair_id) {
          const pair = db.prepare('SELECT * FROM transactions WHERE id = ?').get(freshTx.transfer_pair_id);
          if (pair) {
            const pairRevert = (pair.type === 'income' || pair.type === 'transfer_in') ? -pair.amount : pair.amount;
            db.prepare('UPDATE wallets SET balance = balance + ? WHERE id = ?').run(pairRevert, pair.wallet_id);
            db.prepare('DELETE FROM transactions WHERE id = ?').run(pair.id);
          }
        }
      })();

      const allWallets = db.prepare('SELECT * FROM wallets').all();
      const total = allWallets.reduce((s, w) => s + w.balance, 0);
      sheets.syncSummary(allWallets, total);

      const deletedEmbed = successEmbed('Transaksi Dihapus', `Transaksi #${id} sebesar ${formatRupiah(freshTx.amount)} dihapus, saldo dikembalikan.`);

      if (routeToOtherChannel) {
        await btn.update({ content: `✅ Transaksi #${id} dihapus — cek log di <#${txChannel}>`, embeds: [], components: [] });
        notifier.notifyTransaksi({ embeds: [deletedEmbed] });
      } else {
        await btn.update({ embeds: [deletedEmbed], components: [] });
      }
    });
  },
};
