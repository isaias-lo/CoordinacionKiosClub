#!/usr/bin/env bash
# bye.sh — Ejecutar ANTES DE SALIR (trabajo o casa) al terminar tu jornada.
set -e
cd "$(dirname "$0")/.."

branch=$(git rev-parse --abbrev-ref HEAD)
echo ""
echo "==> BYE  -  rama actual: $branch"

if [ "$branch" = "main" ]; then
  echo "Estas en 'main'. No subas trabajo en progreso a main."
  echo "Cambiate a tu rama de trabajo:  git checkout <tu-rama>"
  exit 1
fi

dirty=$(git status --porcelain)
if [ -n "$dirty" ]; then
  echo "Guardando tus cambios..."
  git add -A
  stamp=$(date '+%Y-%m-%d %H:%M')
  git commit -m "WIP: avance $stamp"
else
  echo "No hay cambios nuevos sin commitear."
fi

echo "Subiendo '$branch' a GitHub..."
git push origin "$branch"

echo ""
echo "Listo. Tu avance esta en GitHub (rama '$branch')."
echo "En la otra PC abre el proyecto y ejecuta:  npm run hola"
