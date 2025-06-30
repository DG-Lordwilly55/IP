// index.js
import whatsappWeb from 'whatsapp-web.js';
const { Client, LocalAuth } = whatsappWeb;
import qrcode from 'qrcode-terminal';
import axios from 'axios';
import fs from 'fs';
import { parsePhoneNumber } from 'libphonenumber-js';
import 'dotenv/config';
import dayjs from 'dayjs';


import { incrementRequest, incrementCommand } from './metrics.js';
const miWebhook = 'https://hook.us2.make.com/oc8y798y9admwow37cjd3leqjexchwk3';

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

// Parsing heurístico para flujo “compuesto”
function parseArgs(rawString) {
  const tokens = rawString.trim().split(/\s+/);
  let phone = null, amount = null, due = null, promo = false;

  // Promoción: token "p"
  const promoIndex = tokens.findIndex(t => /^p$/i.test(t));
  if (promoIndex > -1) {
    promo = true;
    tokens.splice(promoIndex, 1);
  }

  // Teléfono MX
  const phoneIndex = tokens.findIndex(t => normalizeMx(t));
  if (phoneIndex > -1) {
    phone = normalizeMx(tokens[phoneIndex]);
    tokens.splice(phoneIndex, 1);
  }

  // Monto y formato por componentes
  const amountIndex = tokens.findIndex(t => /^\d+(?:\.\d{1,2})?$/.test(t));
  if (amountIndex > -1) {
    // Decomponer cantidad en millares, centenas, decenas y unidades
    let rawAmount = parseInt(tokens[amountIndex], 10);
    const comps = [];
    [1000, 100, 10, 1].forEach(place => {
      const v = Math.floor(rawAmount / place) * place;
      if (v > 0) {
        comps.push(v);
        rawAmount %= place;
      }
    });
    amount = comps.join(', ') + ' pesos';
    tokens.splice(amountIndex, 1);
  }

  // Fecha: soporta DD/MM, DD-MM, DD/MM/YYYY, DD-MM-YYYY y YYYY-MM-DD
  const dateIndex = tokens.findIndex(t =>
    /^(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?|\d{4}-\d{1,2}-\d{1,2})$/.test(t)
  );
  if (dateIndex > -1) {
    const token = tokens[dateIndex];
    const currentYear = dayjs().year();
    let parsedDate = null;

    const parts = token.split(/[\/\-]/);
    if (parts.length === 2) {
      // DD/MM o DD-MM sin año
      const [day, month] = parts.map(Number);
      parsedDate = dayjs(new Date(currentYear, month - 1, day));
    } else if (parts.length === 3) {
      if (/^\d{4}-/.test(token)) {
        // YYYY-MM-DD
        const [year, month, day] = parts.map(Number);
        parsedDate = dayjs(new Date(year, month - 1, day));
      } else {
        // DD/MM/YYYY o DD-MM-YYYY
        const [day, month, year] = parts.map(Number);
        parsedDate = dayjs(new Date(year, month - 1, day));
      }
    }

    if (parsedDate && parsedDate.isValid()) {
      due = parsedDate.format('YYYY-MM-DD');
    }
    tokens.splice(dateIndex, 1);
  }

  // Nombre residual
  const name = tokens.length ? tokens.join(' ') : null;

  return { phone, name, amount, due, promo };
}

// Ayuda para formato de fecha
const monthNames = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
function formatDateSpan(isoDate) {
  const [year, month, day] = isoDate.split('-');
  return `${parseInt(day)} de ${monthNames[parseInt(month,10)-1]}`;
}

// Inicializa cliente -----------------------------------
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: { headless: true }
});

client.on('qr', qr => qrcode.generate(qr, { small: true }));
client.on('ready', () => console.log('✅  WhatsApp listo'));


client.on('message', async msg => {
  // Sólo chats privados y autorizados
  if (!msg.from.endsWith('@c.us')) return;
  const waId = msg.from.split('@')[0];
  if (!isAuthorized(waId)) return;

  // Comando y argumentos
  const [cmd, ...rest] = msg.body.trim().split(/\s+/);
  if (cmd.toLowerCase() !== 'llamar') return;
  incrementRequest();
  incrementCommand('llamar');

  const rawArgs = rest.join(' ');
  const composed = rawArgs.length > 0;
  const variant  = composed ? 'compuesto' : 'simple';

  // Payload base
  const payload = {
    variant,
    action: 'llamar',
    sender: `+${waId}`,
    original: msg.body
  };

  // Datos extra para "compuesto"
  if (composed) {
    const { phone, name, amount, due, promo } = parseArgs(rawArgs);
    if (phone === null && name === null) {
      await msg.reply('❌ Indica al menos nombre o teléfono.');
      return;
    }
    const formattedDue = due ? formatDateSpan(due) : null;
Object.assign(payload, { phone, name, amount, due: formattedDue, promo });
  }

  // Envío al webhook
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
