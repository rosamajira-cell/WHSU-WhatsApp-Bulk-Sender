#!/bin/bash
echo "============================================================"
echo "🚀 Iniciando WHSU - WhatsApp Bulk Sender Pro..."
echo "============================================================"

# Verificar si node_modules existe, si no, instalar dependencias
if [ ! -d "node_modules" ]; then
    echo "📦 Instalando dependencias del sistema..."
    npm install
fi

# Iniciar servidor Node.js
echo "🌐 Servidor escuchando en http://localhost:3000"
echo "Abriendo navegador..."

# Intentar abrir la app en el navegador por defecto
if command -v open &> /dev/null; then
    (sleep 2 && open http://localhost:3000) &
elif command -v xdg-open &> /dev/null; then
    (sleep 2 && xdg-open http://localhost:3000) &
fi

npm start
