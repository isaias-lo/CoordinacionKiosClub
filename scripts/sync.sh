#!/usr/bin/env bash
# sync.sh — Traer lo ultimo de 'main' a tu rama de trabajo.
set -e
cd "$(dirname "$0")/.."

branch=$(git rev-parse --abbrev-ref HEAD)
echo ""
echo "==> SYNC  -  traer main a la rama: $branch"

if [ "$branch" = "main" ]; then
  echo "Ya estas en 'main'. 'sync' es para traer main a TU rama de trabajo."
  echo "Cambiate a tu rama:  git checkout <tu-rama>"
  exit 1
fi

echo "Trayendo lo ultimo de origin..."
git fetch origin --prune

echo "Mezclando origin/main en '$branch'..."
if ! git merge origin/main --no-edit; then
  echo ""
  echo "HAY CONFLICTOS al mezclar main."
  echo "No subas nada todavia. Pidele a Claude: 'tengo un conflicto de git, ayudame a resolverlo'."
  exit 1
fi

echo "Subiendo '$branch' actualizado..."
git push origin "$branch"

echo ""
echo "Listo. '$branch' ya tiene lo ultimo de main."
