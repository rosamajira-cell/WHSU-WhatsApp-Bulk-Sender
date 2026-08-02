const QRCode = require('qrcode');
const fs = require('fs-extra');
const path = require('path');
const pino = require('pino');

let makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, delay;

async function getBaileys() {
  if (!makeWASocket) {
    const baileys = await import('@whiskeysockets/baileys');
    makeWASocket = baileys.default || baileys.makeWASocket;
    useMultiFileAuthState = baileys.useMultiFileAuthState;
    DisconnectReason = baileys.DisconnectReason;
    fetchLatestBaileysVersion = baileys.fetchLatestBaileysVersion;
    delay = baileys.delay;
  }
  return { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, delay };
}

class WhatsAppService {
  constructor(sessionDir = './whatsapp-session') {
    this.sessionDir = path.resolve(sessionDir);
    this.sock = null;
    this.qrCode = null;
    this.status = 'disconnected'; // 'disconnected' | 'connecting' | 'connected'
    this.user = null;
    this.listeners = new Map();
    this.isReconnecting = false;
  }

  on(event, listener) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(listener);
  }

  emit(event, ...args) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(fn => fn(...args));
    }
  }

  setStatus(newStatus, extraData = {}) {
    this.status = newStatus;
    this.emit('status-change', { status: this.status, user: this.user, qrCode: this.qrCode, ...extraData });
  }

  async initialize() {
    if (this.status === 'connected' && this.sock) {
      return;
    }

    try {
      this.setStatus('connecting');

      const { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = await getBaileys();

      if (!fs.existsSync(this.sessionDir)) {
        fs.mkdirSync(this.sessionDir, { recursive: true });
      }

      const { state, saveCreds } = await useMultiFileAuthState(this.sessionDir);
      const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1015901307] }));

      this.sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        auth: state,
        browser: ['WHSU Bulk Sender', 'Desktop', '1.0.0'],
        syncFullHistory: false,
        markOnlineOnConnect: true,
        keepAliveIntervalMs: 25000,
        defaultQueryTimeoutMs: 60000,
        retryRequestDelayMs: 2500
      });

      this.sock.ev.on('creds.update', saveCreds);

      this.sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          try {
            this.qrCode = await QRCode.toDataURL(qr);
            this.setStatus('connecting', { qrCode: this.qrCode });
            this.emit('qr', this.qrCode);
          } catch (err) {
            console.error('Error generando QR DataURL:', err);
          }
        }

        if (connection === 'open') {
          this.qrCode = null;
          this.user = this.sock.user || { id: 'WhatsApp Client' };
          this.setStatus('connected');
          this.isReconnecting = false;
          console.log('✅ Sesión de WhatsApp conectada con éxito para:', this.user.id);
        }

        if (connection === 'close') {
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

          console.log(`⚠️ Conexión cerrada. Código: ${statusCode}. ¿Reconectar?: ${shouldReconnect}`);

          if (statusCode === DisconnectReason.loggedOut) {
            this.qrCode = null;
            this.user = null;
            this.clearSession();
            this.setStatus('disconnected');
          } else if (shouldReconnect) {
            this.setStatus('connecting');
            if (!this.isReconnecting) {
              this.isReconnecting = true;
              setTimeout(() => {
                this.isReconnecting = false;
                this.initialize();
              }, 3000);
            }
          } else {
            this.setStatus('disconnected');
          }
        }
      });

    } catch (error) {
      console.error('Error inicializando servicio WhatsApp:', error);
      this.setStatus('disconnected', { error: error.message });
    }
  }

  async disconnect() {
    if (this.sock) {
      try {
        await this.sock.logout().catch(() => {});
        this.sock.end(undefined);
      } catch (e) {}
      this.sock = null;
    }
    this.clearSession();
    this.user = null;
    this.qrCode = null;
    this.setStatus('disconnected');
  }

  clearSession() {
    try {
      if (fs.existsSync(this.sessionDir)) {
        fs.rmSync(this.sessionDir, { recursive: true, force: true });
      }
    } catch (err) {
      console.error('Error eliminando la carpeta de sesión:', err);
    }
  }

  formatJid(phone) {
    let clean = String(phone).replace(/[^\d]/g, '');
    if (!clean.endsWith('@s.whatsapp.net')) {
      clean = `${clean}@s.whatsapp.net`;
    }
    return clean;
  }

  async isRegistered(phone) {
    if (this.status !== 'connected' || !this.sock) {
      throw new Error('WhatsApp no está conectado.');
    }
    const jid = this.formatJid(phone);
    const [result] = await this.sock.onWhatsApp(jid);
    return result && result.exists;
  }

  async sendMessageWithRetry(phone, text, attachmentPath = null, maxRetries = 2) {
    const { delay } = await getBaileys();
    let attempt = 0;
    let lastError = null;

    while (attempt <= maxRetries) {
      attempt++;
      try {
        return await this.sendMessage(phone, text, attachmentPath);
      } catch (err) {
        lastError = err;
        console.warn(`[Intento ${attempt}/${maxRetries + 1}] Error al enviar mensaje a ${phone}:`, err.message);
        if (attempt <= maxRetries) {
          await delay(2000);
        }
      }
    }
    throw lastError || new Error('Error al enviar el mensaje tras múltiples reintentos.');
  }

  async sendMessage(phone, text, attachmentPath = null) {
    if (this.status !== 'connected' || !this.sock) {
      throw new Error('No hay una sesión activa de WhatsApp. Escanea el código QR primero.');
    }

    const jid = this.formatJid(phone);

    if (!attachmentPath) {
      return await this.sock.sendMessage(jid, { text });
    }

    if (!fs.existsSync(attachmentPath)) {
      throw new Error(`El archivo adjunto no fue encontrado en: ${attachmentPath}`);
    }

    const ext = path.extname(attachmentPath).toLowerCase();
    const fileName = path.basename(attachmentPath);

    if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
      return await this.sock.sendMessage(jid, {
        image: { url: attachmentPath },
        caption: text || ''
      });
    } else if (['.mp4', '.avi', '.mkv', '.mov'].includes(ext)) {
      return await this.sock.sendMessage(jid, {
        video: { url: attachmentPath },
        caption: text || ''
      });
    } else if (['.mp3', '.ogg', '.wav', '.m4a'].includes(ext)) {
      return await this.sock.sendMessage(jid, {
        audio: { url: attachmentPath },
        mimetype: 'audio/mp4',
        ptt: false
      });
    } else {
      let mimetype = 'application/octet-stream';
      if (ext === '.pdf') mimetype = 'application/pdf';
      else if (ext === '.docx' || ext === '.doc') mimetype = 'application/msword';
      else if (ext === '.xlsx' || ext === '.xls') mimetype = 'application/vnd.ms-excel';

      return await this.sock.sendMessage(jid, {
        document: { url: attachmentPath },
        mimetype,
        fileName,
        caption: text || ''
      });
    }
  }
}

module.exports = WhatsAppService;
