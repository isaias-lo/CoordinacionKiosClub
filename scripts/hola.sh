#!/usr/bin/env bash
# hola.sh — Ejecutar AL LLEGAR (trabajo o casa) antes de empezar a trabajar.
set -e
cd "$(dirname "$0")/.."

branch=$(git rev-parse --abbrev-ref HEAD)
echo ""
echo "==> HOLA  -  rama actual: $branch"

dirty=$(git status --porcelain)
if [ -n "$dirty" ]; then
  echo "ATENCION: tienes cambios locales sin commitear:"
  git status --short
  echo "Haz 'npm run bye' primero o guardalos antes de continuar."
  exit 1
fi

echo "Trayendo lo ultimo de origin/$branch ..."
git fetch origin
git pull --ff-only origin "$branch"

echo ""
echo "Listo. Estas al dia con origin/$branch."
