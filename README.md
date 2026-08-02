# 🚀 WHSU - WhatsApp Bulk Sender Pro
> **Automatización Inteligente de Comunicados Masivos por WhatsApp desde archivos Excel.**  
> *Desarrollado por **Fede Padilla***

![WHSU Banner](public/icon.png)

---

## 🌟 Características Principales

- 📱 **Autenticación QR & Sesión Persistente**: Vincula tu cuenta de WhatsApp una sola vez. La sesión se guarda de forma segura para no tener que escanear el QR cada vez.
- 📊 **Cargador de Excel / CSV**: Importación rápida de listas de contactos con autodetección de columnas de `Nombre` y `Teléfono`.
- 🏷️ **Variables Dinámicas Ilimitadas**: Escribe comunicados personalizados usando etiquetas dinámicas como `{Nombre del Padre}`, `{Nombre del Alumno}`, `{Curso}`, `{Monto}`, etc.
- 👥 **Agrupación de Contactos por Teléfono**: Combina automáticamente mensajes para aquellos registros que compartan la misma línea telefónica.
- ⏱️ **Intervalo Dinámico en Vivo**: Modifica los segundos de espera entre mensajes en tiempo real mientras la campaña está en ejecución.
- 📎 **Adjuntos Globales y por Carpeta**: Envía un archivo global (PDF, Imagen, Documento) o asigna archivos individuales por cliente automáticamente.
- ⏯️ **Control de Ejecución Completo**: Botones de *Iniciar*, *Pausar*, *Reanudar* y *Cancelar* con cronómetro de cuenta regresiva y vista previa del próximo contacto.
- 📋 **Bitácora en Tiempo Real & Reintentos**: Historial completo de envíos con estado, hora y detalle de errores + botones de **Reintento Individual** y **Reintento Masivo de Fallidos**.
- 📥 **Descarga de Plantilla y Exportación de Reportes**: Descarga de plantillas Excel pre-formateadas y exportación de reportes de envíos a `.xlsx`.
- 🖥️ **Multiplataforma**: Ejecutable nativo para **Windows 11** (`.exe`) y **macOS** (`.dmg` / `.app`) con interfaz en **Tema Oscuro** responsiva.

---

## 🚀 Inicio Rápido en Modo Desarrollo

### Prerrequisitos:
- [Node.js](https://nodejs.org/) v18 o superior.

### Pasos:

1. **Clonar el repositorio:**
   ```bash
   git clone https://github.com/rosamajira-cell/WHSU-WhatsApp-Bulk-Sender.git
   cd WHSU-WhatsApp-Bulk-Sender
   ```

2. **Instalar dependencias:**
   ```bash
   npm install
   ```

3. **Iniciar la aplicación:**
   ```bash
   npm start
   ```
   *La interfaz gráfica se abrirá automáticamente en tu navegador en `http://localhost:3000`.*

4. **Lanzar como aplicación nativa de escritorio:**
   ```bash
   npm run electron
   ```

---

## 📦 Compilación de Ejecutables (.exe / .dmg)

Para generar los instaladores independientes para distribución:

- **Para compilar en macOS (`.dmg` / `.app`):**
  ```bash
  npm run build:mac
  ```

- **Para compilar en Windows 11 (`.exe` Setup / Portable):**
  ```bash
  npm run build:win
  ```

*Los archivos binarios se crearán en la carpeta `dist/`.*

---

## 📄 Formato del Archivo Excel de Entrada

El archivo Excel (`.xlsx`, `.xls` o `.csv`) debe contener al menos las columnas de teléfono y nombre. Los números de teléfono deben incluir el código internacional del país (ejemplo: `34` para España, `52` para México, `1` para EE.UU.).

| Nombre del Padre | Teléfono | Nombre del Alumno |
| :--- | :--- | :--- |
| Rosa | 34645029285 | Lucas |
| Javier | 34605381933 | Sofía |

---

## 🛡️ Licencia y Autoría

Desarrollado con ❤️ por **Fede Padilla**.  
Licencia MIT - Libre para uso personal y comercial.
