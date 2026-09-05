const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { errorEmbed } = require('../utils/embeds');

function isPanelButton(customId) {
  return customId === 'panel_masuk' || customId === 'panel_keluar' || customId === 'panel_transfer';
}

function isPanelModal(customId) {
  return customId === 'modal_panel_masuk' || customId === 'modal_panel_keluar' || customId === 'modal_panel_transfer';
}

async function handleButton(interaction) {
  if (interaction.customId === 'panel_masuk' || interaction.customId === 'panel_keluar') {
    const isMasuk = interaction.customId === 'panel_masuk';
    const modal = new ModalBuilder()
      .setCustomId(isMasuk ? 'modal_panel_masuk' : 'modal_panel_keluar')
      .setTitle(isMasuk ? 'Catat Pemasukan' : 'Catat Pengeluaran')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('jumlah').setLabel('Jumlah (angka saja)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('contoh: 50000'),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('dompet').setLabel('Dompet').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('contoh: Cash'),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('kategori').setLabel('Kategori').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder(isMasuk ? 'contoh: Gaji' : 'contoh: Makan'),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('deskripsi').setLabel('Deskripsi (opsional)').setStyle(TextInputStyle.Short).setRequired(false),
        ),
      );
    return interaction.showModal(modal);
  }

  if (interaction.customId === 'panel_transfer') {
    const modal = new ModalBuilder()
      .setCustomId('modal_panel_transfer')
      .setTitle('Transfer Antar Dompet')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('jumlah').setLabel('Jumlah (angka saja)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('contoh: 100000'),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('dari').setLabel('Dari Dompet').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('contoh: Cash'),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('ke').setLabel('Ke Dompet').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('contoh: GoPay'),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('biaya_admin').setLabel('Biaya Admin (opsional, default 0)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('contoh: 2500'),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('deskripsi').setLabel('Deskripsi (opsional)').setStyle(TextInputStyle.Short).setRequired(false),
        ),
      );
    return interaction.showModal(modal);
  }
}

function parseAmount(raw) {
  const cleaned = String(raw).replace(/[^\d]/g, '');
  const n = parseInt(cleaned, 10);
  return Number.isFinite(n) ? n : NaN;
}

async function handleModalSubmit(interaction) {
  // Lazy require biar gak circular dependency saat load command
  const catat = require('../commands/catat');

  if (interaction.customId === 'modal_panel_masuk' || interaction.customId === 'modal_panel_keluar') {
    const type = interaction.customId === 'modal_panel_masuk' ? 'income' : 'expense';
    const jumlah = parseAmount(interaction.fields.getTextInputValue('jumlah'));
    const dompet = interaction.fields.getTextInputValue('dompet');
    const kategori = interaction.fields.getTextInputValue('kategori');
    const deskripsi = interaction.fields.getTextInputValue('deskripsi') || '';

    if (!jumlah || jumlah <= 0) {
      return interaction.reply({ embeds: [errorEmbed('Jumlah Tidak Valid', 'Isi jumlah dengan angka lebih dari 0, contoh: 50000')], ephemeral: true });
    }

    return catat.processMasukKeluar(interaction, type, jumlah, dompet, kategori, deskripsi);
  }

  if (interaction.customId === 'modal_panel_transfer') {
    const jumlah = parseAmount(interaction.fields.getTextInputValue('jumlah'));
    const dari = interaction.fields.getTextInputValue('dari');
    const ke = interaction.fields.getTextInputValue('ke');
    const biayaAdminRaw = interaction.fields.getTextInputValue('biaya_admin');
    const biayaAdmin = biayaAdminRaw ? parseAmount(biayaAdminRaw) || 0 : 0;
    const deskripsi = interaction.fields.getTextInputValue('deskripsi') || '';

    if (!jumlah || jumlah <= 0) {
      return interaction.reply({ embeds: [errorEmbed('Jumlah Tidak Valid', 'Isi jumlah dengan angka lebih dari 0, contoh: 100000')], ephemeral: true });
    }

    return catat.processTransfer(interaction, jumlah, dari, ke, biayaAdmin, deskripsi);
  }
}

module.exports = { isPanelButton, isPanelModal, handleButton, handleModalSubmit };
