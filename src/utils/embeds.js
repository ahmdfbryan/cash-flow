const { EmbedBuilder } = require('discord.js');
const { formatRupiah, formatDate } = require('./format');

const COLORS = {
  success: 0x57F287,
  error: 0xED4245,
  income: 0x57F287,
  expense: 0xED4245,
  info: 0x5865F2,
  warning: 0xFEE75C,
};

function baseEmbed(color = COLORS.info) {
  return new EmbedBuilder().setColor(color).setTimestamp();
}

function successEmbed(title, description) {
  return baseEmbed(COLORS.success).setTitle(`✅ ${title}`).setDescription(description);
}

function errorEmbed(title, description) {
  return baseEmbed(COLORS.error).setTitle(`❌ ${title}`).setDescription(description);
}

function transactionEmbed(tx, wallet, category) {
  const isIncome = tx.type === 'income' || tx.type === 'transfer_in';
  return baseEmbed(isIncome ? COLORS.income : COLORS.expense)
    .setTitle(`${isIncome ? '📥 Pemasukan' : '📤 Pengeluaran'} Tercatat`)
    .addFields(
      { name: 'Jumlah', value: formatRupiah(tx.amount), inline: true },
      { name: 'Dompet', value: `${wallet.emoji} ${wallet.name}`, inline: true },
      { name: 'Kategori', value: category ? `${category.emoji} ${category.name}` : '-', inline: true },
      { name: 'Deskripsi', value: tx.description || '-' },
      { name: 'Saldo Dompet', value: formatRupiah(wallet.balance) },
    )
    .setFooter({ text: `ID Transaksi: ${tx.id}` });
}

function balanceEmbed(wallets, total) {
  const embed = baseEmbed(COLORS.info).setTitle('💰 Saldo Kamu');
  wallets.forEach(w => {
    embed.addFields({ name: `${w.emoji} ${w.name}`, value: formatRupiah(w.balance), inline: true });
  });
  embed.addFields({ name: '\u200b', value: `**Total: ${formatRupiah(total)}**` });
  return embed;
}

function liveBalanceEmbed(wallets, total) {
  const embed = baseEmbed(COLORS.info).setTitle('💰 Saldo Real-Time');
  wallets.forEach(w => {
    embed.addFields({ name: `${w.emoji} ${w.name}`, value: formatRupiah(w.balance), inline: true });
  });
  embed.addFields({ name: '\u200b', value: `**Total: ${formatRupiah(total)}**` });
  embed.setFooter({ text: 'Update otomatis setiap ada transaksi' });
  return embed;
}

module.exports = { COLORS, baseEmbed, successEmbed, errorEmbed, transactionEmbed, balanceEmbed, liveBalanceEmbed, formatDate };
