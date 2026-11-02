param([string]$ProjectDirectory = 'C:\projetos\Projeto-afiliados')
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath $ProjectDirectory).Path.TrimEnd('\')
$pidFile = Join-Path $projectRoot '.radar-worker/process.json'
if (-not (Test-Path -LiteralPath $pidFile)) { Write-Host 'Nenhum processador registrado por este iniciador.'; exit 0 }
$registered = Get-Content -LiteralPath $pidFile -Raw | ConvertFrom-Json
$workerProcess = Get-Process -Id $registered.Id -ErrorAction SilentlyContinue
if ($workerProcess -and $workerProcess.StartTime.ToUniversalTime().Ticks.ToString() -eq $registered.StartTicks) {
    Stop-Process -Id $workerProcess.Id
    Write-Host 'Processador encerrado. As regras e a fila foram preservadas.'
} else { Write-Host 'O processador registrado ja estava encerrado.' }
