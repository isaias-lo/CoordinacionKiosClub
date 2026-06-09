# hola.ps1  — Ejecutar AL LLEGAR (trabajo o casa) antes de empezar a trabajar.
# Trae lo ultimo de tu rama desde GitHub para continuar donde lo dejaste.

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

$branch = (git rev-parse --abbrev-ref HEAD).Trim()
Write-Host ""
Write-Host "==> HOLA  -  rama actual: $branch" -ForegroundColor Cyan

# Avisar si hay cambios locales sin guardar (para no perderlos con el pull)
$dirty = (git status --porcelain)
if ($dirty) {
    Write-Host "ATENCION: tienes cambios locales sin commitear:" -ForegroundColor Yellow
    git status --short
    Write-Host "Haz 'npm run bye' primero o guardalos antes de continuar." -ForegroundColor Yellow
    exit 1
}

Write-Host "Trayendo lo ultimo de origin/$branch ..." -ForegroundColor Gray
git fetch origin
git pull --ff-only origin $branch

Write-Host ""
Write-Host "Listo. Estas al dia en '$branch'. A trabajar!" -ForegroundColor Green
git log --oneline -3
