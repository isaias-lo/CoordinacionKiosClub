# pr.ps1  — Abrir un Pull Request de tu rama hacia main (para revisar y desplegar).
# Esto es DELIBERADO: ejecutalo SOLO cuando una funcion este lista para produccion.
# NO mergea solo; solo abre el PR para revision. (Distinto de 'bye', que solo sube tu avance.)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

$branch = (git rev-parse --abbrev-ref HEAD).Trim()
Write-Host ""
Write-Host "==> PR  -  rama: $branch  ->  main" -ForegroundColor Cyan

if ($branch -eq "main") {
    Write-Host "Estas en 'main'. Cambiate a tu rama de trabajo antes de abrir un PR." -ForegroundColor Red
    exit 1
}

# Asegurar que tu rama este subida (sin esto el PR no tendria tus ultimos commits)
Write-Host "Subiendo '$branch' a GitHub..." -ForegroundColor Gray
git push origin $branch

# Buscar gh (puede no estar en el PATH del shell actual)
$gh = (Get-Command gh -ErrorAction SilentlyContinue)
$ghExe = if ($gh) { $gh.Source } elseif (Test-Path "C:\Program Files\GitHub CLI\gh.exe") { "C:\Program Files\GitHub CLI\gh.exe" } else { $null }

$repoUrl = "https://github.com/isaias-lo/CoordinacionKiosClub"

if ($ghExe) {
    # ¿Ya existe un PR abierto para esta rama?
    $existing = (& $ghExe pr list --head $branch --state open --json url --jq ".[0].url" 2>$null)
    if ($existing) {
        Write-Host "Ya hay un PR abierto para '$branch':" -ForegroundColor Yellow
        Write-Host "  $existing" -ForegroundColor Green
        Write-Host "(Tus commits nuevos ya quedaron incluidos al hacer push.)" -ForegroundColor Gray
    } else {
        Write-Host "Abriendo PR..." -ForegroundColor Gray
        & $ghExe pr create --base main --head $branch --fill
    }
    Write-Host ""
    Write-Host "Listo. Revisa/mergea el PR desde GitHub para desplegar (Vercel publica main)." -ForegroundColor Green
} else {
    # Sin gh: dar el enlace web de un clic
    Write-Host "gh no esta instalado/autenticado en esta PC. Abre el PR con este enlace:" -ForegroundColor Yellow
    Write-Host "  $repoUrl/compare/main...$branch?expand=1" -ForegroundColor Green
}
