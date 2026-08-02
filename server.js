const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const XLSX = require('xlsx');

const WhatsAppService = require('./lib/whatsapp-service');
const { parseExcelFile } = require('./lib/excel-service');
const CampaignManager = require('./lib/campaign-manager');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;

function getWritableDataDir() {
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    return path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'whsu_data');
  }
  const baseDir = process.env.APPDATA || 
    (process.platform === 'darwin' 
      ? path.join(process.env.HOME || '', 'Library', 'Application Support') 
      : path.join(process.env.HOME || '', '.config'));
  return path.join(baseDir, 'whsu-bulk-sender');
}

const APP_DATA_DIR = getWritableDataDir();
const UPLOADS_DIR = path.join(APP_DATA_DIR, 'uploads');
const SESSION_DIR = path.join(APP_DATA_DIR, 'whatsapp-session');

fs.ensureDirSync(UPLOADS_DIR);
fs.ensureDirSync(SESSION_DIR);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname.replace(/[^\w\.\-]/g, '_'));
  }
});
const upload = multer({ storage });

// Aumentar el límite de payload JSON a 50MB para soportar listas masivas grandes sin error 413
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

const whatsappService = new WhatsAppService(SESSION_DIR);
const campaignManager = new CampaignManager(whatsappService);

// -------------------------------------------------------------
// EVENTOS EN TIEMPO REAL (SOCKET.IO)
// -------------------------------------------------------------
io.on('connection', (socket) => {
  console.log('⚡ Cliente GUI conectado via Socket.IO');

  socket.emit('wa-status', {
    status: whatsappService.status,
    user: whatsappService.user,
    qrCode: whatsappService.qrCode
  });

  campaignManager.emitProgress();

  socket.on('disconnect', () => {
    console.log('🔌 Cliente GUI desconectado');
  });
});

whatsappService.on('status-change', (data) => {
  io.emit('wa-status', data);
});

whatsappService.on('qr', (qrCode) => {
  io.emit('wa-qr', { qrCode });
});

campaignManager.on('progress', (data) => {
  io.emit('campaign-progress', data);
});

campaignManager.on('countdown-tick', (data) => {
  io.emit('countdown-tick', data);
});

campaignManager.on('log-updated', (logEntry) => {
  io.emit('log-entry', logEntry);
});

campaignManager.on('finished', (summary) => {
  io.emit('campaign-finished', summary);
});

campaignManager.on('interval-updated', (data) => {
  io.emit('interval-updated', data);
});

// -------------------------------------------------------------
// ENDPOINTS REST API
// -------------------------------------------------------------

app.get('/api/download-template', (req, res) => {
  try {
    const sampleData = [
      { 'Nombre del Padre': 'Rosa', 'Teléfono': '34645029285', 'Nombre del Alumno': 'Lucas' },
      { 'Nombre del Padre': 'Javier', 'Teléfono': '34605381933', 'Nombre del Alumno': 'Sofía' }
    ];

    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Contactos');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Plantilla_Contactos_WHSU.xlsx"');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/export-log', (req, res) => {
  try {
    const logs = req.body.logs || [];
    const exportData = logs.map(l => ({
      'Destinatario': l.recipient,
      'Teléfono': l.phone,
      'Mensaje': l.message,
      'Estado': l.status === 'sent' ? 'Enviado' : (l.status === 'failed' ? 'Fallido' : 'Pendiente'),
      'Hora': l.timestamp,
      'Detalle Error': l.error || ''
    }));

    const ws = XLSX.utils.json_to_sheet(exportData.length > 0 ? exportData : [{ 'Info': 'Sin registros' }]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Bitácora de Envíos');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Bitacora_Envios_WHSU.xlsx"');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/whatsapp/status', (req, res) => {
  res.json({
    status: whatsappService.status,
    user: whatsappService.user,
    qrCode: whatsappService.qrCode
  });
});

app.post('/api/whatsapp/connect', async (req, res) => {
  try {
    whatsappService.initialize();
    res.json({ success: true, message: 'Inicializando conexión con WhatsApp...' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/whatsapp/disconnect', async (req, res) => {
  try {
    await whatsappService.disconnect();
    res.json({ success: true, message: 'Sesión de WhatsApp cerrada correctamente.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/upload-excel', upload.single('excelFile'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No se subió ningún archivo Excel.' });
    }

    const cleanPath = path.normalize(req.file.path);
    const groupByPhone = req.body.groupByPhone === 'true' || req.body.groupByPhone === true;
    const sheetName = req.body.sheetName || null;

    const parsedData = parseExcelFile(cleanPath, {
      groupByPhone,
      sheetName
    });

    res.json({
      success: true,
      filePath: cleanPath,
      fileName: req.file.originalname,
      ...parsedData
    });
  } catch (err) {
    console.error('Error procesando Excel:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/upload-attachment', upload.single('attachment'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No se subió ningún archivo adjunto.' });
    }
    const cleanPath = path.normalize(req.file.path);
    res.json({
      success: true,
      filePath: cleanPath,
      fileName: req.file.originalname
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/campaign/start', (req, res) => {
  try {
    const {
      contacts,
      template,
      useGlobalAttachment,
      globalAttachmentPath,
      useFolderAttachments,
      attachmentsFolder,
      intervalSeconds
    } = req.body;

    if (whatsappService.status !== 'connected') {
      return res.status(400).json({
        success: false,
        error: 'WhatsApp no está conectado. Por favor vincula tu cuenta con el código QR primero.'
      });
    }

    const cleanGlobalAttachment = globalAttachmentPath ? path.normalize(globalAttachmentPath) : null;
    const cleanFolder = attachmentsFolder ? path.normalize(attachmentsFolder) : null;

    campaignManager.startCampaign({
      contacts,
      template,
      useGlobalAttachment,
      globalAttachmentPath: cleanGlobalAttachment,
      useFolderAttachments,
      attachmentsFolder: cleanFolder,
      intervalSeconds
    });

    res.json({ success: true, message: 'Campaña iniciada con éxito.' });
  } catch (err) {
    console.error('Error iniciando campaña:', err);
    res.status(400).json({ success: false, error: err.message || 'Error al iniciar la campaña' });
  }
});

app.post('/api/campaign/pause', (req, res) => {
  campaignManager.pauseCampaign();
  res.json({ success: true, message: 'Campaña pausada.' });
});

app.post('/api/campaign/resume', (req, res) => {
  campaignManager.resumeCampaign();
  res.json({ success: true, message: 'Campaña reanudada.' });
});

app.post('/api/campaign/cancel', (req, res) => {
  campaignManager.cancelCampaign();
  res.json({ success: true, message: 'Campaña cancelada.' });
});

app.post('/api/campaign/interval', (req, res) => {
  const { intervalSeconds } = req.body;
  campaignManager.setIntervalSeconds(intervalSeconds);
  res.json({
    success: true,
    intervalSeconds: campaignManager.intervalSeconds,
    message: `Intervalo actualizado a ${campaignManager.intervalSeconds} segundos.`
  });
});

app.post('/api/campaign/retry-one', async (req, res) => {
  try {
    const { logId } = req.body;
    const result = await campaignManager.retryContact(logId);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/campaign/retry-all-failed', async (req, res) => {
  try {
    const result = await campaignManager.retryFailedContacts();
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`===================================================`);
  console.log(`🚀 Servidor WHSU iniciado en http://localhost:${PORT}`);
  console.log(`📂 Almacenamiento seguro en: ${APP_DATA_DIR}`);
  console.log(`===================================================`);
  whatsappService.initialize();
});
