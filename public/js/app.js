document.addEventListener('DOMContentLoaded', () => {
  const socket = io();

  let loadedContacts = [];
  let detectedColumns = [];
  let currentExcelPath = null;
  let globalAttachmentPath = null;
  let campaignLogs = [];
  let waStatus = 'disconnected';

  const statusBadge = document.getElementById('statusBadge');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const btnManageSession = document.getElementById('btnManageSession');

  const excelDropzone = document.getElementById('excelDropzone');
  const excelInput = document.getElementById('excelInput');
  const excelSheetSelect = document.getElementById('excelSheetSelect');
  const sheetSelectGroup = document.getElementById('sheetSelectGroup');
  const chkGroupByPhone = document.getElementById('chkGroupByPhone');
  const excelInfoBadge = document.getElementById('excelInfoBadge');
  const excelInfoText = document.getElementById('excelInfoText');
  const dropzoneLabel = document.getElementById('dropzoneLabel');

  const variablesContainer = document.getElementById('variablesContainer');
  const templateTextarea = document.getElementById('templateTextarea');
  const previewContactSelect = document.getElementById('previewContactSelect');
  const templatePreviewBox = document.getElementById('templatePreviewBox');

  const intervalInput = document.getElementById('intervalInput');
  const chkGlobalAttachment = document.getElementById('chkGlobalAttachment');
  const globalAttachmentArea = document.getElementById('globalAttachmentArea');
  const globalAttachmentInput = document.getElementById('globalAttachmentInput');
  const globalAttachmentLabel = document.getElementById('globalAttachmentLabel');

  const chkFolderAttachments = document.getElementById('chkFolderAttachments');
  const folderAttachmentArea = document.getElementById('folderAttachmentArea');
  const folderPathInput = document.getElementById('folderPathInput');

  const btnStartCampaign = document.getElementById('btnStartCampaign');
  const btnPauseCampaign = document.getElementById('btnPauseCampaign');
  const btnResumeCampaign = document.getElementById('btnResumeCampaign');
  const btnCancelCampaign = document.getElementById('btnCancelCampaign');
  const countdownBanner = document.getElementById('countdownBanner');
  const countdownClock = document.getElementById('countdownClock');
  const nextContactName = document.getElementById('nextContactName');
  const nextContactPhone = document.getElementById('nextContactPhone');

  const metricTotal = document.getElementById('metricTotal');
  const metricSent = document.getElementById('metricSent');
  const metricFailed = document.getElementById('metricFailed');
  const metricPending = document.getElementById('metricPending');
  const progressBarFill = document.getElementById('progressBarFill');

  const btnExportLog = document.getElementById('btnExportLog');
  const btnRetryFailed = document.getElementById('btnRetryFailed');
  const logSearchInput = document.getElementById('logSearchInput');
  const logStatusFilter = document.getElementById('logStatusFilter');
  const logTableBody = document.getElementById('logTableBody');

  const qrModal = document.getElementById('qrModal');
  const qrContainer = document.getElementById('qrContainer');
  const qrModalStatus = document.getElementById('qrModalStatus');
  const btnCloseQrModal = document.getElementById('btnCloseQrModal');
  const btnDisconnectSession = document.getElementById('btnDisconnectSession');

  socket.on('wa-status', (data) => {
    waStatus = data.status;
    updateStatusUI(data);
  });

  socket.on('wa-qr', (data) => {
    if (data.qrCode) {
      qrContainer.innerHTML = `<img src="${data.qrCode}" alt="Código QR de WhatsApp">`;
      qrModalStatus.textContent = '¡Escanea el código QR con WhatsApp!';
    }
  });

  socket.on('campaign-progress', (data) => {
    updateCampaignProgressUI(data);
  });

  socket.on('countdown-tick', (data) => {
    countdownClock.textContent = `${data.remainingSeconds}s`;
    if (data.nextContact) {
      nextContactName.textContent = data.nextContact.name || 'Próximo destinatario';
      nextContactPhone.textContent = data.nextContact.phone ? `+${data.nextContact.phone}` : '';
    } else {
      nextContactName.textContent = 'Sin contactos pendientes';
      nextContactPhone.textContent = '';
    }
  });

  socket.on('log-entry', (logEntry) => {
    const existingIndex = campaignLogs.findIndex(l => l.id === logEntry.id);
    if (existingIndex !== -1) {
      campaignLogs[existingIndex] = logEntry;
    } else {
      campaignLogs.unshift(logEntry);
    }
    renderLogTable();
  });

  socket.on('campaign-finished', (summary) => {
    alert(`🎉 Campaña finalizada.\nTotal: ${summary.total} | Enviados: ${summary.sent} | Fallidos: ${summary.failed}`);
    resetControlButtons('finished');
  });

  socket.on('interval-updated', (data) => {
    console.log('Intervalo actualizado en vivo desde el servidor:', data.intervalSeconds);
  });

  function updateStatusUI(data) {
    statusDot.className = 'status-dot ' + data.status;
    
    if (data.status === 'connected') {
      statusText.textContent = 'Conectado y Listo';
      qrModalStatus.textContent = '✅ WhatsApp ya está vinculado y conectado.';
      qrContainer.innerHTML = `<div style="color: var(--primary-green); text-align: center;"><i class="fa-solid fa-circle-check" style="font-size: 60px;"></i><p style="margin-top: 10px; font-weight: 600;">Sesión Activa</p></div>`;
    } else if (data.status === 'connecting') {
      statusText.textContent = 'Cargando / Vincular';
      if (data.qrCode) {
        qrContainer.innerHTML = `<img src="${data.qrCode}" alt="Código QR">`;
        qrModalStatus.textContent = '¡Escanea el código QR!';
      } else {
        qrContainer.innerHTML = `<i class="fa-solid fa-spinner fa-spin" style="font-size: 40px; color: var(--accent-cyan);"></i>`;
        qrModalStatus.textContent = 'Conectando con WhatsApp...';
      }
    } else {
      statusText.textContent = 'Desconectado';
      qrModalStatus.textContent = 'Sesión no iniciada. Haz clic para vincular.';
      qrContainer.innerHTML = `<i class="fa-solid fa-qrcode" style="font-size: 50px; color: var(--text-muted);"></i>`;
    }
  }

  btnManageSession.addEventListener('click', () => {
    qrModal.classList.add('active');
    if (waStatus === 'disconnected') {
      fetch('/api/whatsapp/connect', { method: 'POST' });
    }
  });

  btnCloseQrModal.addEventListener('click', () => {
    qrModal.classList.remove('active');
  });

  btnDisconnectSession.addEventListener('click', async () => {
    if (confirm('¿Estás seguro de que deseas cerrar la sesión de WhatsApp?')) {
      await fetch('/api/whatsapp/disconnect', { method: 'POST' });
    }
  });

  excelDropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    excelDropzone.classList.add('dragover');
  });

  excelDropzone.addEventListener('dragleave', () => {
    excelDropzone.classList.remove('dragover');
  });

  excelDropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    excelDropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      excelInput.files = e.dataTransfer.files;
      handleExcelUpload();
    }
  });

  excelInput.addEventListener('change', handleExcelUpload);
  chkGroupByPhone.addEventListener('change', handleExcelUpload);
  excelSheetSelect.addEventListener('change', handleExcelUpload);

  async function handleExcelUpload() {
    if (!excelInput.files || excelInput.files.length === 0) return;

    const file = excelInput.files[0];
    dropzoneLabel.innerHTML = `<strong>${file.name}</strong><p>Procesando archivo...</p>`;

    const formData = new FormData();
    formData.append('excelFile', file);
    formData.append('groupByPhone', chkGroupByPhone.checked);
    if (excelSheetSelect.value) {
      formData.append('sheetName', excelSheetSelect.value);
    }

    try {
      const res = await fetch('/api/upload-excel', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();

      if (!data.success) {
        alert('Error al leer el archivo Excel: ' + data.error);
        return;
      }

      currentExcelPath = data.filePath;
      loadedContacts = data.contacts || [];
      detectedColumns = data.columns || [];

      excelSheetSelect.innerHTML = '';
      data.sheetNames.forEach(sheet => {
        const option = document.createElement('option');
        option.value = sheet;
        option.textContent = sheet;
        if (sheet === data.activeSheet) option.selected = true;
        excelSheetSelect.appendChild(option);
      });
      excelSheetSelect.disabled = false;

      excelInfoText.textContent = `${loadedContacts.length} contactos válidos cargados (${data.columns.length} columnas detectadas)`;
      excelInfoBadge.style.display = 'block';
      dropzoneLabel.innerHTML = `<strong>${file.name}</strong><p>Archivo cargado correctamente</p>`;

      renderVariableTags(detectedColumns);
      updatePreviewContactOptions();
      updateTemplatePreview();

      metricTotal.textContent = loadedContacts.length;
      metricPending.textContent = loadedContacts.length;

    } catch (err) {
      console.error('Error subiendo Excel:', err);
      alert('Falló la conexión con el servidor al procesar el Excel.');
    }
  }

  function renderVariableTags(columns) {
    variablesContainer.innerHTML = '';
    const defaultTags = ['Nombre del Padre', 'Nombre del Alumno', 'Teléfono'];
    const allTags = Array.from(new Set([...defaultTags, ...columns]));

    allTags.forEach(col => {
      const tag = `{${col}}`;
      const pill = document.createElement('span');
      pill.className = 'tag-pill';
      pill.dataset.tag = tag;
      pill.textContent = tag;

      pill.addEventListener('click', () => {
        insertTagIntoTemplate(tag);
      });

      variablesContainer.appendChild(pill);
    });
  }

  function insertTagIntoTemplate(tag) {
    const start = templateTextarea.selectionStart;
    const end = templateTextarea.selectionEnd;
    const text = templateTextarea.value;

    templateTextarea.value = text.substring(0, start) + tag + text.substring(end);
    templateTextarea.focus();
    templateTextarea.selectionStart = templateTextarea.selectionEnd = start + tag.length;

    updateTemplatePreview();
  }

  templateTextarea.addEventListener('input', updateTemplatePreview);
  previewContactSelect.addEventListener('change', updateTemplatePreview);

  function updatePreviewContactOptions() {
    previewContactSelect.innerHTML = '';
    if (loadedContacts.length === 0) {
      previewContactSelect.innerHTML = '<option value="0">Contacto de prueba</option>';
      return;
    }

    loadedContacts.slice(0, 20).forEach((c, idx) => {
      const option = document.createElement('option');
      option.value = idx;
      option.textContent = `#${idx + 1} - ${c.name} (${c.phone})`;
      previewContactSelect.appendChild(option);
    });
  }

  function updateTemplatePreview() {
    const template = templateTextarea.value;
    if (!template.trim()) {
      templatePreviewBox.textContent = 'Escribe una plantilla para ver el resultado...';
      return;
    }

    const selectedIndex = parseInt(previewContactSelect.value || 0, 10);
    const sampleContact = loadedContacts[selectedIndex] || {
      name: 'Rosa',
      phone: '34645029285',
      variables: { 'Nombre del Padre': 'Rosa', 'Nombre del Alumno': 'Lucas', 'Teléfono': '34645029285' }
    };

    let rendered = template;
    rendered = rendered.replace(/\{([^}]+)\}/g, (match, key) => {
      const trimmedKey = key.trim();
      const foundKey = Object.keys(sampleContact.variables || {}).find(
        k => k.toLowerCase() === trimmedKey.toLowerCase()
      );

      if (foundKey && sampleContact.variables[foundKey]) {
        return sampleContact.variables[foundKey];
      }
      return match;
    });

    templatePreviewBox.textContent = rendered;
  }

  intervalInput.addEventListener('input', () => {
    const seconds = parseInt(intervalInput.value, 10);
    if (!isNaN(seconds) && seconds >= 1) {
      fetch('/api/campaign/interval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intervalSeconds: seconds })
      });
    }
  });

  chkGlobalAttachment.addEventListener('change', () => {
    globalAttachmentArea.style.display = chkGlobalAttachment.checked ? 'block' : 'none';
  });

  globalAttachmentInput.addEventListener('change', async () => {
    if (!globalAttachmentInput.files || globalAttachmentInput.files.length === 0) return;
    const file = globalAttachmentInput.files[0];
    globalAttachmentLabel.textContent = `Subiendo ${file.name}...`;

    const formData = new FormData();
    formData.append('attachment', file);

    try {
      const res = await fetch('/api/upload-attachment', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        globalAttachmentPath = data.filePath;
        globalAttachmentLabel.textContent = `✅ Adjunto listo: ${file.name}`;
      } else {
        alert('Error subiendo adjunto: ' + data.error);
      }
    } catch (e) {
      alert('Falló la carga del archivo adjunto.');
    }
  });

  chkFolderAttachments.addEventListener('change', () => {
    folderAttachmentArea.style.display = chkFolderAttachments.checked ? 'block' : 'none';
  });

  btnStartCampaign.addEventListener('click', async () => {
    if (loadedContacts.length === 0) {
      alert('Por favor carga primero una lista de contactos en Excel.');
      return;
    }
    if (!templateTextarea.value.trim()) {
      alert('Por favor escribe el mensaje que deseas enviar.');
      return;
    }
    if (waStatus !== 'connected') {
      alert('WhatsApp no está conectado. Haz clic en "Vincular / Estado" para escanear el código QR.');
      qrModal.classList.add('active');
      return;
    }

    const payload = {
      contacts: loadedContacts,
      template: templateTextarea.value,
      useGlobalAttachment: chkGlobalAttachment.checked,
      globalAttachmentPath,
      useFolderAttachments: chkFolderAttachments.checked,
      attachmentsFolder: folderPathInput.value.trim(),
      intervalSeconds: parseInt(intervalInput.value || 5, 10)
    };

    try {
      const res = await fetch('/api/campaign/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      let data;
      try {
        data = await res.json();
      } catch (err) {
        throw new Error(`Error en el servidor (Código HTTP ${res.status}).`);
      }

      if (res.ok && data.success) {
        campaignLogs = [];
        renderLogTable();
        resetControlButtons('running');
      } else {
        alert('Error al iniciar campaña: ' + (data.error || `Código HTTP ${res.status}`));
      }
    } catch (e) {
      alert('Falló la solicitud para iniciar la campaña: ' + (e.message || e));
    }
  });

  btnPauseCampaign.addEventListener('click', async () => {
    await fetch('/api/campaign/pause', { method: 'POST' });
    resetControlButtons('paused');
  });

  btnResumeCampaign.addEventListener('click', async () => {
    await fetch('/api/campaign/resume', { method: 'POST' });
    resetControlButtons('running');
  });

  btnCancelCampaign.addEventListener('click', async () => {
    if (confirm('¿Estás seguro de que deseas cancelar la campaña en curso?')) {
      await fetch('/api/campaign/cancel', { method: 'POST' });
      resetControlButtons('cancelled');
    }
  });

  function resetControlButtons(status) {
    if (status === 'running') {
      btnStartCampaign.disabled = true;
      btnPauseCampaign.disabled = false;
      btnResumeCampaign.disabled = true;
      btnCancelCampaign.disabled = false;
    } else if (status === 'paused') {
      btnStartCampaign.disabled = true;
      btnPauseCampaign.disabled = true;
      btnResumeCampaign.disabled = false;
      btnCancelCampaign.disabled = false;
    } else {
      btnStartCampaign.disabled = false;
      btnPauseCampaign.disabled = true;
      btnResumeCampaign.disabled = true;
      btnCancelCampaign.disabled = true;
      countdownClock.textContent = '--s';
      nextContactName.textContent = 'En espera...';
      nextContactPhone.textContent = '';
    }
  }

  function updateCampaignProgressUI(data) {
    metricTotal.textContent = data.total || 0;
    metricSent.textContent = data.sent || 0;
    metricFailed.textContent = data.failed || 0;
    metricPending.textContent = data.pending || 0;

    const percent = data.total > 0 ? Math.round(((data.sent + data.failed) / data.total) * 100) : 0;
    progressBarFill.style.width = `${percent}%`;

    resetControlButtons(data.status);
  }

  logSearchInput.addEventListener('input', renderLogTable);
  logStatusFilter.addEventListener('change', renderLogTable);

  function renderLogTable() {
    const search = logSearchInput.value.toLowerCase().trim();
    const filter = logStatusFilter.value;

    const filteredLogs = campaignLogs.filter(log => {
      const matchSearch = (log.recipient || '').toLowerCase().includes(search) ||
                          (log.phone || '').includes(search) ||
                          (log.message || '').toLowerCase().includes(search);
      
      const matchFilter = filter === 'all' ? true : log.status === filter;
      return matchSearch && matchFilter;
    });

    if (filteredLogs.length === 0) {
      logTableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 30px;">
            No se encontraron envíos que coincidan con el filtro.
          </td>
        </tr>`;
      return;
    }

    logTableBody.innerHTML = '';
    filteredLogs.forEach(log => {
      const tr = document.createElement('tr');

      let statusBadgeHtml = '';
      if (log.status === 'sent') {
        statusBadgeHtml = `<span class="badge badge-sent"><i class="fa-solid fa-check"></i> Enviado</span>`;
      } else if (log.status === 'failed') {
        statusBadgeHtml = `<span class="badge badge-failed" title="${log.error || ''}"><i class="fa-solid fa-xmark"></i> Fallido</span>`;
      } else {
        statusBadgeHtml = `<span class="badge badge-pending"><i class="fa-solid fa-clock"></i> Pendiente</span>`;
      }

      const retryBtnHtml = log.status === 'failed' 
        ? `<button class="btn btn-secondary btn-xs btn-retry-single" data-id="${log.id}"><i class="fa-solid fa-rotate-right"></i> Reintentar</button>`
        : `<span style="color: var(--text-dim); font-size: 11px;">-</span>`;

      tr.innerHTML = `
        <td><strong>${log.recipient}</strong></td>
        <td><code>+${log.phone}</code></td>
        <td style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${log.message}">${log.message}</td>
        <td>${statusBadgeHtml}</td>
        <td><small style="color: var(--text-muted);">${log.timestamp}</small></td>
        <td style="text-align: right;">${retryBtnHtml}</td>
      `;

      logTableBody.appendChild(tr);
    });

    document.querySelectorAll('.btn-retry-single').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const logId = e.currentTarget.dataset.id;
        e.currentTarget.disabled = true;
        e.currentTarget.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`;
        
        try {
          await fetch('/api/campaign/retry-one', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ logId })
          });
        } catch (err) {
          alert('Error intentando el reintento individual.');
        }
      });
    });
  }

  btnExportLog.addEventListener('click', async () => {
    if (campaignLogs.length === 0) {
      alert('No hay registros en la bitácora para exportar.');
      return;
    }

    try {
      const res = await fetch('/api/export-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logs: campaignLogs })
      });
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Bitacora_Envios_WHSU.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      alert('Error al exportar la bitácora a Excel.');
    }
  });

  btnRetryFailed.addEventListener('click', async () => {
    const failedCount = campaignLogs.filter(l => l.status === 'failed').length;
    if (failedCount === 0) {
      alert('No hay envíos fallidos para reintentar.');
      return;
    }

    if (confirm(`¿Deseas reintentar enviar los ${failedCount} mensajes fallidos?`)) {
      btnRetryFailed.disabled = true;
      btnRetryFailed.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Reintentando...`;

      try {
        const res = await fetch('/api/campaign/retry-all-failed', { method: 'POST' });
        const data = await res.json();
        alert(`Reintento masivo completado: ${data.result?.retried || 0} envíos procesados.`);
      } catch (err) {
        alert('Error al ejecutar el reintento masivo.');
      } finally {
        btnRetryFailed.disabled = false;
        btnRetryFailed.innerHTML = `<i class="fa-solid fa-rotate-right"></i> Reintentar Fallidos`;
      }
    }
  });

});
