// index.js
import whatsappWeb from 'whatsapp-web.js';
const { Client, LocalAuth } = whatsappWeb;
import qrcode from 'qrcode-terminal';
import axios from 'axios';
import fs from 'fs';
import { parsePhoneNumber } from 'libphonenumber-js';
import 'dotenv/config';
const miWebhook = 'https://hook.us2.make.com/ejkp3x36158bwbqape954lk6qak5a3r1';

// Carga números autorizados ----------------------------
const { senders } = JSON.parse(fs.readFileSync('./authorized.json'));
const normalizedSenders = senders.map(s => s.replace(/^\+/, ''));

// Helpers ----------------------------------------------
const normalizeMx = raw => {
  try {
    const num = parsePhoneNumber(raw, 'MX');
    return num.format('E.164');             // → “+523312345678”
  } catch {
    return null;
  }
};

const isAuthorized = waId => normalizedSenders.includes(waId);

// Inicializa cliente -----------------------------------
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: { headless: true }
});

client.on('qr', qr => qrcode.generate(qr, { small: true }));
client.on('ready', () => console.log('✅  WhatsApp listo'));

client.on('message', async msg => {
  // sólo chats privados
  if (!msg.from.endsWith('@c.us')) {
    console.log(`🚫 Mensaje discriminado (no privado): ${msg.from}`);
    return;
  }
  const waId = msg.from.split('@')[0];     // “5213312345678”
  if (!isAuthorized(waId)) {
    console.log(`🚫 Mensaje discriminado (no autorizado): ${waId}`);
    return;
  }         // ignora remitentes no autorizados

  // División por espacios o líneas para soportar “llamar 3312343176” y “llamar\n3312343176”
  const [cmd, arg] = msg.body.trim().split(/\s+/, 2);

  if (cmd.toLowerCase() !== 'llamar') {
    console.log(`🚫 Mensaje discriminado (comando no reconocido): ${cmd}`);
    return;
  }

  // Arma payload base
  console.log(`✅ Procesando mensaje de: ${waId}`);
  const payload = { sender: `+${waId}`, original: `${cmd} ` };
  let phone = '';
  if (arg && arg.trim()) {
    phone = normalizeMx(arg);
    if (!phone) {
      await msg.reply('❌ Número inválido. Usa 10 dígitos o incluye LADA.');
      return;
    }
  }
  payload.action = 'llamar';
  payload.phone = phone;

  // Envía al webhook Make --------------------------------
  try {
     await axios.post(miWebhook, payload, {
      headers: { 'Content-Type': 'application/json' }
    });
    console.log('📤 Webhook enviado:', payload);
  } catch (err) {
    console.error('🔥 Error al enviar webhook:', err.message);
  }
});

client.initialize();
