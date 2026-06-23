#!/usr/bin/env bash
# nueva-tarea.sh — Crear una rama NUEVA por tarea desde main actualizado.
# Evita reusar una rama vieja (que queda atrás de main y se ensucia).
# Uso:  npm run nueva-tarea fix/lo-que-sea     (o feat/..., chore/...)
set -e
cd "$(dirname "$0")/.."

name="$1"
if [ -z "$name" ]; then
  echo "Uso: npm run nueva-tarea <rama>   (ej: fix/semaforo, feat/algo, chore/algo)"
  exit 1
fi

dirty=$(git status --porcelain)
if [ -n "$dirty" ]; then
  echo "ATENCION: tienes cambios sin commitear. Haz 'npm run bye' o guardalos antes."
  git status --short
  exit 1
fi

echo ""
echo "==> NUEVA TAREA  -  rama: $name (desde main)"
echo "Trayendo lo ultimo de origin/main..."
git fetch origin --prune

echo "Creando rama '$name' desde origin/main..."
git checkout -b "$name" origin/main

echo ""
echo "Listo. Estas en '$name' (desde main al dia). Trabaja y cierra con 'npm run pr'."
