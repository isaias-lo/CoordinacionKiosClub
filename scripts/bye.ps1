# bye.ps1  — Ejecutar ANTES DE SALIR (trabajo o casa) al terminar tu jornada.
# Guarda TODO tu avance y lo sube a GitHub para poder seguir desde la otra PC.

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

$branch = (git rev-parse --abbrev-ref HEAD).Trim()
Write-Host ""
Write-Host "==> BYE  -  rama actual: $branch" -ForegroundColor Cyan

# Seguridad: nunca subir un WIP directo a main
if ($branch -eq "main") {
    Write-Host "Estas en 'main'. No subas trabajo en progreso a main." -ForegroundColor Red
    Write-Host "Cambiate a tu rama de trabajo:  git checkout <tu-rama>" -ForegroundColor Yellow
    exit 1
}

$dirty = (git status --porcelain)
if ($dirty) {
    Write-Host "Guardando tus cambios..." -ForegroundColor Gray
    git add -A
    $stamp = Get-Date -Format "yyyy-MM-dd HH:mm"
    git commit -m "WIP: avance $stamp"
} else {
    Write-Host "No hay cambios nuevos sin commitear." -ForegroundColor Gray
}

Write-Host "Subiendo '$branch' a GitHub..." -ForegroundColor Gray
git push origin $branch

Write-Host ""
Write-Host "Listo. Tu avance esta en GitHub (rama '$branch')." -ForegroundColor Green
Write-Host "En la otra PC abre el proyecto y ejecuta:  npm run hola" -ForegroundColor Green
