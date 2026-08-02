#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

echo "============================================================"
echo "🚀 Iniciando WHSU - WhatsApp Bulk Sender Pro..."
echo "============================================================"

# Iniciar el servidor Node en segundo plano si no está corriendo
if ! lsof -i:3000 > /dev/null; then
    /Users/fedepadilla/.local/bin/node server.js > /dev/null 2>&1 &
    sleep 2
fi

# Abrir la interfaz en el navegador
open http://localhost:3000
