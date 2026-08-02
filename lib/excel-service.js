const XLSX = require('xlsx');

/**
 * Normaliza un número telefónico eliminando espacios, caracteres especiales y guiones.
 */
function normalizePhoneNumber(phone) {
  if (!phone) return '';
  let cleaned = String(phone).replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  }
  return cleaned;
}

/**
 * Analiza un archivo Excel (o CSV) y extrae registros y metadatos de columnas.
 */
function parseExcelFile(filePathOrBuffer, options = {}) {
  let workbook;
  if (typeof filePathOrBuffer === 'string') {
    workbook = XLSX.readFile(filePathOrBuffer);
  } else {
    workbook = XLSX.read(filePathOrBuffer, { type: 'buffer' });
  }

  const sheetNames = workbook.SheetNames;
  if (!sheetNames || sheetNames.length === 0) {
    throw new Error('El archivo Excel no contiene hojas de trabajo válidas.');
  }

  const sheetName = options.sheetName || sheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    throw new Error(`La hoja "${sheetName}" no se encontró en el archivo.`);
  }

  // Convertir hoja a JSON estructurado
  const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
  if (rawRows.length === 0) {
    return {
      sheetNames,
      activeSheet: sheetName,
      columns: [],
      contacts: [],
      phoneColumn: '',
      nameColumn: ''
    };
  }

  // Obtener todas las columnas
  const columns = Object.keys(rawRows[0] || {});

  // Autodetectar columna de teléfono
  const phoneColumn = options.phoneColumn || columns.find(col => 
    /telf|teléfono|telefono|phone|celular|cel|movil|móvil|whatsapp/i.test(col)
  ) || columns[0];

  // Autodetectar columna de nombre
  const nameColumn = options.nameColumn || columns.find(col => 
    /nombre|name|cliente|contacto|destinatario/i.test(col)
  ) || columns[1] || columns[0];

  // Procesar filas a contactos normalizados
  let contacts = rawRows.map((row, index) => {
    const rawPhone = row[phoneColumn] || '';
    const cleanPhone = normalizePhoneNumber(rawPhone);
    const name = row[nameColumn] || 'Cliente';

    // Guardar variables dinámicas con claves exactas y en minúsculas para mayor flexibilidad
    const variables = {};
    columns.forEach(col => {
      variables[col] = String(row[col] !== undefined && row[col] !== null ? row[col] : '').trim();
    });

    return {
      id: index + 1,
      name: String(name).trim(),
      phone: cleanPhone,
      rawPhone: String(rawPhone).trim(),
      variables
    };
  }).filter(c => c.phone.length >= 7); // Filtrar números inválidos muy cortos

  // Opción de agrupación por número de teléfono
  if (options.groupByPhone) {
    const groupedMap = new Map();

    contacts.forEach(contact => {
      if (!groupedMap.has(contact.phone)) {
        groupedMap.set(contact.phone, {
          ...contact,
          records: [contact]
        });
      } else {
        const existing = groupedMap.get(contact.phone);
        existing.records.push(contact);
        
        // Unificar variables con salto de línea si difieren
        columns.forEach(col => {
          if (contact.variables[col] && existing.variables[col] !== contact.variables[col]) {
            existing.variables[col] = `${existing.variables[col]} | ${contact.variables[col]}`;
          }
        });
      }
    });

    contacts = Array.from(groupedMap.values());
  }

  return {
    sheetNames,
    activeSheet: sheetName,
    columns,
    phoneColumn,
    nameColumn,
    contacts,
    totalRecords: rawRows.length,
    validContactsCount: contacts.length
  };
}

module.exports = {
  normalizePhoneNumber,
  parseExcelFile
};
