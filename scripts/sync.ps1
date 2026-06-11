# sync.ps1  — Traer lo ultimo de 'main' a tu rama de trabajo.
# Ejecutalo ANTES de abrir un PR o de empezar a trabajar, sobre todo si otra
# persona/herramienta (OpenCode, etc.) mergeo algo a main. Asi el PR sale limpio.

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

$branch = (git rev-parse --abbrev-ref HEAD).Trim()
Write-Host ""
Write-Host "==> SYNC  -  traer main a la rama: $branch" -ForegroundColor Cyan

if ($branch -eq "main") {
    Write-Host "Ya estas en 'main'. 'sync' es para traer main a TU rama de trabajo." -ForegroundColor Yellow
    Write-Host "Cambiate a tu rama:  git checkout <tu-rama>" -ForegroundColor Yellow
    exit 1
}

Write-Host "Trayendo lo ultimo de origin..." -ForegroundColor Gray
git fetch origin --prune

Write-Host "Mezclando origin/main en '$branch'..." -ForegroundColor Gray
git merge origin/main --no-edit
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "HAY CONFLICTOS al mezclar main." -ForegroundColor Red
    Write-Host "No subas nada todavia. Pidele a Claude: 'tengo un conflicto de git, ayudame a resolverlo'." -ForegroundColor Yellow
    Write-Host "(o resuelvelos y luego:  git add -A; git commit; npm run sync de nuevo)" -ForegroundColor Yellow
    exit 1
}

Write-Host "Subiendo '$branch' actualizada..." -ForegroundColor Gray
git push origin $branch

Write-Host ""
Write-Host "Listo. '$branch' ya tiene lo ultimo de main. El PR saldra limpio." -ForegroundColor Green
git log --oneline -3
