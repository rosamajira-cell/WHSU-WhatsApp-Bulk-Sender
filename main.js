const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

// Arreglo para binaries nativos en entornos de producción empaquetados
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

// Inicializar el servidor backend interno Express + Socket.IO + Baileys
require('./server.js');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1380,
    height: 880,
    minWidth: 1050,
    minHeight: 700,
    title: 'WHSU - WhatsApp Bulk Sender Pro',
    autoHideMenuBar: true,
    backgroundColor: '#070a12',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Ocultar menú superior predeterminado
  Menu.setApplicationMenu(null);

  // Esperar brevemente a que el servidor Express esté listo y cargar la URL
  setTimeout(() => {
    mainWindow.loadURL('http://localhost:3000');
  }, 1000);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
