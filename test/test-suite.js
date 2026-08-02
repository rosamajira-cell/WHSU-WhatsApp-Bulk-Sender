const assert = require('assert');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');

const { parseExcelFile, normalizePhoneNumber } = require('../lib/excel-service');
const CampaignManager = require('../lib/campaign-manager');

console.log('🧪 Iniciando Suite de Pruebas Unitarias para WHSU...\n');

// 1. Prueba de Normalización de Teléfonos
console.log('1️⃣ Probando Normalización de Teléfonos...');
assert.strictEqual(normalizePhoneNumber('+52 (55) 1234-5678'), '525512345678');
assert.strictEqual(normalizePhoneNumber(' 52155 9876 5432 '), '5215598765432');
assert.strictEqual(normalizePhoneNumber(''), '');
console.log('   ✅ Normalización de teléfonos aprobada.');

// 2. Prueba de Parsing de Excel y Agrupación
console.log('\n2️⃣ Probando Lectura de Excel y Agrupación por Teléfono...');
const testData = [
  { Nombre: 'Carlos Mendoza', Teléfono: '+52 55 1111 2222', Monto: '$1,500', Ciudad: 'CDMX' },
  { Nombre: 'Maria Lopez', Teléfono: '525511112222', Monto: '$2,000', Ciudad: 'Monterrey' }, // Mismo teléfono
  { Nombre: 'Ana Gomez', Teléfono: '525533334444', Monto: '$3,200', Ciudad: 'Guadalajara' }
];

const testExcelPath = path.join(__dirname, 'sample_contacts.xlsx');
const ws = XLSX.utils.json_to_sheet(testData);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Contactos');
XLSX.writeFile(wb, testExcelPath);

// Prueba sin agrupación
const parsedNormal = parseExcelFile(testExcelPath, { groupByPhone: false });
assert.strictEqual(parsedNormal.contacts.length, 3, 'Debe retornar 3 contactos sin agrupar');
assert.strictEqual(parsedNormal.columns.includes('Monto'), true, 'Debe detectar la columna Monto');
console.log('   ✅ Parsing sin agrupación aprobado (3 contactos).');

// Prueba con agrupación
const parsedGrouped = parseExcelFile(testExcelPath, { groupByPhone: true });
assert.strictEqual(parsedGrouped.contacts.length, 2, 'Debe agrupar los 2 contactos duplicados en 1 solo');
console.log('   ✅ Parsing con agrupación aprobado (2 contactos consolidados).');

// Cleanup
if (fs.existsSync(testExcelPath)) fs.unlinkSync(testExcelPath);

// 3. Prueba de Renderizado de Plantilla e Intervalo Dinámico en Campaña
console.log('\n3️⃣ Probando Motor de Campaña (Plantilla e Intervalo Dinámico)...');
const mockWA = {
  status: 'connected',
  sendMessageWithRetry: async () => true
};

const campaign = new CampaignManager(mockWA);

// Probar renderizado de plantilla
const template = 'Hola {Nombre}, tu saldo en {Ciudad} es de {Monto}.';
const vars = { Nombre: 'Carlos', Ciudad: 'CDMX', Monto: '$1,500' };
const rendered = campaign.renderTemplate(template, vars);
assert.strictEqual(rendered, 'Hola Carlos, tu saldo en CDMX es de $1,500.');
console.log('   ✅ Renderizado de plantilla dinámico aprobado.');

// Probar modificación de intervalo en vivo
campaign.setIntervalSeconds(10);
assert.strictEqual(campaign.intervalSeconds, 10);
campaign.setIntervalSeconds(2);
assert.strictEqual(campaign.intervalSeconds, 2);
console.log('   ✅ Cambio de intervalo dinámico en vivo aprobado (actualizado a 2s).');

// Probar Bitácora y Reintentos
campaign.contacts = [
  { id: 1, name: 'Prueba 1', phone: '525511112222', variables: {} },
  { id: 2, name: 'Prueba 2', phone: '525533334444', variables: {} }
];
campaign.logs = [
  { id: 'log-1', contactId: 1, recipient: 'Prueba 1', phone: '525511112222', status: 'sent' },
  { id: 'log-2', contactId: 2, recipient: 'Prueba 2', phone: '525533334444', status: 'failed', error: 'Error simulado' }
];

console.log('\n4️⃣ Probando Reintentos de Bitácora...');
campaign.retryContact('log-2').then(() => {
  assert.strictEqual(campaign.logs[1].status, 'sent', 'El reintento individual debe cambiar el estado a sent');
  console.log('   ✅ Reintento individual aprobado.');
  console.log('\n✨ TODAS LAS PRUEBAS AUTOMATIZADAS PASARON EXITOSAMENTE!');
}).catch(err => {
  console.error('❌ Error en prueba de reintento:', err);
  process.exit(1);
});
