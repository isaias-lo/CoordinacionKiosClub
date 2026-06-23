# nueva-tarea.ps1 — Crear una rama NUEVA por tarea desde main actualizado.
# Evita reusar una rama vieja (que queda atras de main y se ensucia).
# Uso:  npm run nueva-tarea fix/lo-que-sea     (o feat/..., chore/...)
param([Parameter(Mandatory = $true)][string]$name)
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

$dirty = git status --porcelain
if ($dirty) {
  Write-Host "ATENCION: tienes cambios sin commitear. Haz 'npm run bye' o guardalos antes."
  git status --short
  exit 1
}

Write-Host ""
Write-Host "==> NUEVA TAREA  -  rama: $name (desde main)"
Write-Host "Trayendo lo ultimo de origin/main..."
git fetch origin --prune

Write-Host "Creando rama '$name' desde origin/main..."
git checkout -b $name origin/main

Write-Host ""
Write-Host "Listo. Estas en '$name' (desde main al dia). Trabaja y cierra con 'npm run pr'."
