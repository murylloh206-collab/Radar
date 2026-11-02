param([string]$ProjectDirectory = 'C:\projetos\Projeto-afiliados')
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath $ProjectDirectory).Path.TrimEnd('\')
$workerPath = Join-Path $projectRoot 'src/worker.ts'
if (-not (Test-Path -LiteralPath $workerPath)) { throw 'Aplique primeiro a correcao no projeto.' }
$nodePath = (Get-Command node -ErrorAction Stop).Source
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules/tsx/package.json'))) {
    throw 'As dependencias do projeto nao estao instaladas. Execute npm install na pasta do projeto.'
}
$runtimeDirectory = Join-Path $projectRoot '.radar-worker'
New-Item -ItemType Directory -Force -Path $runtimeDirectory | Out-Null
$pidFile = Join-Path $runtimeDirectory 'process.json'
if (Test-Path -LiteralPath $pidFile) {
    $previous = Get-Content -LiteralPath $pidFile -Raw | ConvertFrom-Json
    $previousProcess = Get-Process -Id $previous.Id -ErrorAction SilentlyContinue
    if ($previousProcess -and $previousProcess.StartTime.ToUniversalTime().Ticks.ToString() -eq $previous.StartTicks) {
        Write-Host 'O processador iniciado por este arquivo ja esta funcionando.' -ForegroundColor Green
        exit 0
    }
}
if (-not $env:APP_URL) { $env:APP_URL = 'https://painel-de-ofertas.vercel.app' }
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$outputLog = Join-Path $runtimeDirectory ('worker-' + $stamp + '.log')
$errorLog = Join-Path $runtimeDirectory ('worker-' + $stamp + '.err.log')
$workerProcess = Start-Process -FilePath $nodePath -ArgumentList @('--import', 'tsx', 'src/worker.ts') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $outputLog -RedirectStandardError $errorLog -PassThru
$startTicks = $workerProcess.StartTime.ToUniversalTime().Ticks.ToString()
Start-Sleep -Seconds 3
$workerProcess.Refresh()
if ($workerProcess.HasExited) { throw "O processador encerrou ao iniciar. Consulte o arquivo $errorLog e envie o erro sem credenciais." }
@{ Id = $workerProcess.Id; StartTicks = $startTicks; OutputLog = $outputLog; ErrorLog = $errorLog } | ConvertTo-Json | Set-Content -LiteralPath $pidFile -Encoding UTF8
Write-Host 'Copiador iniciado em segundo plano. Este terminal pode ser fechado.' -ForegroundColor Green
Write-Host 'As regras ativas e os limites salvos continuam valendo. O painel exibira o sinal do processador.'
Write-Host "Registro: $outputLog"
Write-Host 'O computador precisa permanecer ligado. Para operar com ele desligado, hospede o worker na nuvem.'
