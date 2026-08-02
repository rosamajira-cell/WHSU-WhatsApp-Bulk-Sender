const fs = require('fs');
const path = require('path');

class CampaignManager {
  constructor(whatsappService) {
    this.wa = whatsappService;
    this.status = 'idle'; // 'idle' | 'running' | 'paused' | 'cancelled' | 'finished'
    
    // Configuración de la campaña actual
    this.contacts = [];
    this.template = '';
    this.globalAttachmentPath = null;
    this.useGlobalAttachment = false;
    this.useFolderAttachments = false;
    this.attachmentsFolder = null;
    this.intervalSeconds = 5; // Puede cambiarse EN VIVO

    // Estado de ejecución y métricas
    this.currentIndex = 0;
    this.logs = []; // Registro de bitácora: { id, contactId, recipient, phone, message, status: 'sent'|'failed', timestamp, error, retries }
    this.listeners = new Map();
    
    this.timerId = null;
    this.countdownTimer = null;
    this.remainingSeconds = 0;
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

  /**
   * Modifica el intervalo entre envíos EN VIVO mientras la campaña corre.
   */
  setIntervalSeconds(seconds) {
    const parsed = parseInt(seconds, 10);
    if (!isNaN(parsed) && parsed >= 1) {
      this.intervalSeconds = parsed;
      this.emit('interval-updated', { intervalSeconds: this.intervalSeconds });
      console.log(`⏱️ Intervalo dinámico actualizado en vivo a: ${this.intervalSeconds} segundos.`);
    }
  }

  /**
   * Sustituye etiquetas {Nombre}, {Teléfono} o cualquier columna en la plantilla.
   */
  renderTemplate(templateStr, variables = {}) {
    if (!templateStr) return '';
    let rendered = templateStr;

    // Buscar coincidencia para cualquier {Key}
    rendered = rendered.replace(/\{([^}]+)\}/g, (match, key) => {
      const trimmedKey = key.trim();
      
      // Buscar clave en las variables (insensible a mayúsculas/minúsculas)
      const foundKey = Object.keys(variables).find(
        k => k.toLowerCase() === trimmedKey.toLowerCase()
      );

      if (foundKey && variables[foundKey] !== undefined && variables[foundKey] !== null) {
        return variables[foundKey];
      }
      return match; // Mantener la etiqueta si no se encuentra el valor
    });

    return rendered;
  }

  /**
   * Resuelve el archivo adjunto para un contacto específico.
   */
  resolveAttachmentForContact(contact) {
    // 1. Adjunto global si está activado
    if (this.useGlobalAttachment && this.globalAttachmentPath && fs.existsSync(this.globalAttachmentPath)) {
      return this.globalAttachmentPath;
    }

    // 2. Adjunto por carpeta individual de cliente si está activado
    if (this.useFolderAttachments && this.attachmentsFolder && fs.existsSync(this.attachmentsFolder)) {
      const files = fs.readdirSync(this.attachmentsFolder);
      
      // Buscar archivo por teléfono o nombre (ej. 5215512345678.pdf o Juan_Perez.jpg)
      const matchingFile = files.find(file => {
        const baseName = path.parse(file).name.toLowerCase();
        const cleanPhone = contact.phone.toLowerCase();
        const cleanName = (contact.name || '').toLowerCase().replace(/\s+/g, '_');

        return baseName === cleanPhone || baseName === cleanName || baseName.includes(cleanPhone);
      });

      if (matchingFile) {
        return path.join(this.attachmentsFolder, matchingFile);
      }
    }

    return null;
  }

  /**
   * Inicializa e inicia una nueva campaña de envíos.
   */
  startCampaign(options) {
    if (this.status === 'running') {
      throw new Error('Ya hay una campaña en ejecución.');
    }

    this.contacts = options.contacts || [];
    this.template = options.template || '';
    this.useGlobalAttachment = !!options.useGlobalAttachment;
    this.globalAttachmentPath = options.globalAttachmentPath || null;
    this.useFolderAttachments = !!options.useFolderAttachments;
    this.attachmentsFolder = options.attachmentsFolder || null;
    this.intervalSeconds = Math.max(1, parseInt(options.intervalSeconds || 5, 10));

    if (this.contacts.length === 0) {
      throw new Error('No hay contactos seleccionados para enviar.');
    }

    this.currentIndex = 0;
    this.logs = [];
    this.status = 'running';

    this.emitProgress();
    this.processNext();
  }

  /**
   * Pausa la campaña actual.
   */
  pauseCampaign() {
    if (this.status !== 'running') return;
    this.status = 'paused';
    this.stopTimers();
    this.emitProgress();
    console.log('⏸️ Campaña pausada por el usuario.');
  }

  /**
   * Reanuda la campaña si estaba pausada.
   */
  resumeCampaign() {
    if (this.status !== 'paused') return;
    this.status = 'running';
    this.emitProgress();
    console.log('▶️ Campaña reanudada.');
    this.processNext();
  }

  /**
   * Cancela la campaña en curso.
   */
  cancelCampaign() {
    this.status = 'cancelled';
    this.stopTimers();
    this.emitProgress();
    console.log('🛑 Campaña cancelada.');
  }

  stopTimers() {
    if (this.timerId) clearTimeout(this.timerId);
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    this.timerId = null;
    this.countdownTimer = null;
    this.remainingSeconds = 0;
  }

  /**
   * Procesa el envío del siguiente contacto en la cola.
   */
  async processNext() {
    this.stopTimers();

    if (this.status !== 'running') return;

    if (this.currentIndex >= this.contacts.length) {
      this.status = 'finished';
      this.emitProgress();
      this.emit('finished', this.getSummary());
      console.log('🎉 Campaña finalizada exitosamente.');
      return;
    }

    const contact = this.contacts[this.currentIndex];
    const message = this.renderTemplate(this.template, contact.variables);
    const attachment = this.resolveAttachmentForContact(contact);

    const logEntry = {
      id: Date.now() + Math.random().toString(36).substring(2, 6),
      contactId: contact.id,
      recipient: contact.name,
      phone: contact.phone,
      message,
      status: 'pending',
      timestamp: new Date().toLocaleTimeString(),
      attachment: attachment ? path.basename(attachment) : null,
      error: null
    };

    try {
      // Enviar mensaje a través del servicio WhatsApp (con reintentos internos)
      await this.wa.sendMessageWithRetry(contact.phone, message, attachment, 2);
      
      logEntry.status = 'sent';
      logEntry.timestamp = new Date().toLocaleTimeString();
      console.log(`[${this.currentIndex + 1}/${this.contacts.length}] ✅ Enviado a ${contact.name} (${contact.phone})`);
    } catch (err) {
      logEntry.status = 'failed';
      logEntry.error = err.message || 'Error desconocido al enviar';
      logEntry.timestamp = new Date().toLocaleTimeString();
      console.error(`[${this.currentIndex + 1}/${this.contacts.length}] ❌ Error enviando a ${contact.name} (${contact.phone}):`, err.message);
    }

    this.logs.unshift(logEntry); // Agregar al inicio de la bitácora
    this.currentIndex++;
    this.emitProgress();
    this.emit('log-updated', logEntry);

    // Si aún quedan contactos y la campaña sigue corriendo, iniciar cuenta regresiva para el siguiente
    if (this.currentIndex < this.contacts.length && this.status === 'running') {
      this.startCountdown(this.intervalSeconds, () => {
        this.processNext();
      });
    } else if (this.currentIndex >= this.contacts.length) {
      this.status = 'finished';
      this.emitProgress();
      this.emit('finished', this.getSummary());
    }
  }

  /**
   * Inicia el temporizador de cuenta regresiva dinámico.
   */
  startCountdown(seconds, callback) {
    this.remainingSeconds = seconds;
    this.emitCountdownTick();

    this.countdownTimer = setInterval(() => {
      if (this.status !== 'running') {
        this.stopTimers();
        return;
      }

      this.remainingSeconds--;
      this.emitCountdownTick();

      if (this.remainingSeconds <= 0) {
        this.stopTimers();
        callback();
      }
    }, 1000);
  }

  emitCountdownTick() {
    const nextContact = this.contacts[this.currentIndex] || null;
    this.emit('countdown-tick', {
      remainingSeconds: Math.max(0, this.remainingSeconds),
      nextContact: nextContact ? { name: nextContact.name, phone: nextContact.phone } : null
    });
  }

  /**
   * Reintento individual de un registro fallido.
   */
  async retryContact(logId) {
    const logIndex = this.logs.findIndex(l => l.id === logId);
    if (logIndex === -1) throw new Error('Registro de bitácora no encontrado.');

    const logEntry = this.logs[logIndex];
    const contact = this.contacts.find(c => c.id === logEntry.contactId || c.phone === logEntry.phone);

    if (!contact) throw new Error('Contacto no disponible para reintento.');

    const message = logEntry.message || this.renderTemplate(this.template, contact.variables);
    const attachment = this.resolveAttachmentForContact(contact);

    logEntry.status = 'pending';
    logEntry.error = 'Reintentando...';
    this.emit('log-updated', logEntry);
    this.emitProgress();

    try {
      await this.wa.sendMessageWithRetry(contact.phone, message, attachment, 2);
      logEntry.status = 'sent';
      logEntry.error = null;
      logEntry.timestamp = new Date().toLocaleTimeString();
      console.log(`🔄 Reintento exitoso para ${contact.name} (${contact.phone})`);
    } catch (err) {
      logEntry.status = 'failed';
      logEntry.error = err.message || 'Falló en el reintento';
      logEntry.timestamp = new Date().toLocaleTimeString();
      console.error(`🔄 Falló reintento para ${contact.name}:`, err.message);
    }

    this.emit('log-updated', logEntry);
    this.emitProgress();
    return logEntry;
  }

  /**
   * Reintento masivo de todos los envíos fallidos.
   */
  async retryFailedContacts() {
    const failedLogs = this.logs.filter(l => l.status === 'failed');
    if (failedLogs.length === 0) {
      return { retried: 0, message: 'No hay envíos fallidos para reintentar.' };
    }

    console.log(`🔄 Iniciando reintento masivo para ${failedLogs.length} envíos fallidos...`);

    let retriedCount = 0;
    for (const log of failedLogs) {
      try {
        await this.retryContact(log.id);
        retriedCount++;
      } catch (e) {
        console.error('Error durante reintento masivo:', e);
      }
    }

    return { retried: retriedCount, totalFailed: failedLogs.length };
  }

  emitProgress() {
    const total = this.contacts.length;
    const sent = this.logs.filter(l => l.status === 'sent').length;
    const failed = this.logs.filter(l => l.status === 'failed').length;
    const pending = Math.max(0, total - (sent + failed));
    const nextContact = this.contacts[this.currentIndex] || null;

    this.emit('progress', {
      status: this.status,
      total,
      sent,
      failed,
      pending,
      currentIndex: this.currentIndex,
      intervalSeconds: this.intervalSeconds,
      nextContact: nextContact ? { name: nextContact.name, phone: nextContact.phone } : null
    });
  }

  getSummary() {
    const sent = this.logs.filter(l => l.status === 'sent').length;
    const failed = this.logs.filter(l => l.status === 'failed').length;
    return {
      total: this.contacts.length,
      sent,
      failed,
      logs: this.logs
    };
  }
}

module.exports = CampaignManager;
