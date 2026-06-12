#!/usr/bin/env bash
# pr.sh — Abrir un Pull Request de tu rama hacia main.
# Esto es DELIBERADO: ejecutalo SOLO cuando una funcion este lista para produccion.
set -e
cd "$(dirname "$0")/.."

branch=$(git rev-parse --abbrev-ref HEAD)
echo ""
echo "==> PR  -  rama: $branch  ->  main"

if [ "$branch" = "main" ]; then
  echo "Estas en 'main'. Cambiate a tu rama de trabajo antes de abrir un PR."
  exit 1
fi

echo "Subiendo '$branch' a GitHub..."
git push origin "$branch"

repo_url="https://github.com/isaias-lo/CoordinacionKiosClub"

if command -v gh &>/dev/null && gh auth status &>/dev/null 2>&1; then
  existing=$(gh pr list --head "$branch" --state open --json url --jq ".[0].url" 2>/dev/null || true)
  if [ -n "$existing" ]; then
    echo "Ya hay un PR abierto para '$branch':"
    echo "  $existing"
    echo "(Tus commits nuevos ya quedaron incluidos al hacer push.)"
  else
    echo "Abriendo PR..."
    gh pr create --base main --head "$branch" --fill
  fi
  echo ""
  echo "Listo. Revisa/mergea el PR desde GitHub para desplegar (Vercel publica main)."
else
  echo "gh no esta autenticado en esta PC. Abre el PR con este enlace:"
  echo "  $repo_url/compare/main...$branch?expand=1"
fi
