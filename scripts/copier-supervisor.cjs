const fs = require('node:fs');
const path = require('node:path');
const { fork } = require('node:child_process');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');

const project = path.resolve(__dirname, '..');
const sourceRoot = project;
const stateRoot = path.join(project, '.radar-worker');
const requireProject = createRequire(path.join(project, 'package.json'));
const lockPath = path.join(stateRoot, 'supervisor.lock');

let stopping = false;
let child;
let restartTimer;
let healthTimer;
let lastHeartbeat = Date.now();
let startedAt;
let restartDelay = 2000;
let cycleStartedAt = null;

fs.mkdirSync(stateRoot, { recursive: true });

function acquireLock() {
  try {
    fs.writeFileSync(lockPath, String(process.pid), { flag: 'wx' });
    return;
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  const pid = Number(fs.readFileSync(lockPath, 'utf8'));
  let exists = false;
  try {
    process.kill(pid, 0);
    exists = true;
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
  if (exists) {
    console.log('[Copiador Supervisor] Já existe um supervisor ativo (PID: ' + pid + ').');
    process.exit(0);
  }
  fs.unlinkSync(lockPath);
  fs.writeFileSync(lockPath, String(process.pid), { flag: 'wx' });
}

function writeHealth(status) {
  try {
    fs.writeFileSync(
      path.join(stateRoot, 'health.json'),
      JSON.stringify({
        status,
        supervisorPid: process.pid,
        workerPid: child?.pid,
        sourceRoot,
        lastHeartbeat,
        startedAt,
        updatedAt: Date.now(),
      })
    );
  } catch {}
}

function startChild() {
  if (stopping) return;
  startedAt = Date.now();
  lastHeartbeat = startedAt;
  cycleStartedAt = null;

  console.log('[Copiador Supervisor] Iniciando worker em ' + path.join(sourceRoot, 'src/worker.ts'));
  child = fork(path.join(sourceRoot, 'src/worker.ts'), [], {
    cwd: sourceRoot,
    execArgv: ['--import', pathToFileURL(requireProject.resolve('tsx')).href],
    env: { ...process.env, RADAR_WORKER_SOURCE_ROOT: sourceRoot },
    windowsHide: true,
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  });

  writeHealth('starting');

  child.on('message', (message) => {
    if (message?.type === 'cycle-start') {
      cycleStartedAt = Date.now();
      return;
    }
    if (message?.type === 'cycle-end') {
      cycleStartedAt = null;
      return;
    }
    if (message?.type !== 'heartbeat') return;
    lastHeartbeat = Date.now();
    restartDelay = 2000;
    writeHealth('running');
  });

  child.once('error', (err) => console.error('[Copiador Supervisor] Erro no worker:', err));
  child.once('exit', (code) => {
    clearInterval(healthTimer);
    writeHealth(stopping ? 'stopped' : 'restarting');
    if (stopping) return release();
    console.error(`[Copiador Supervisor] Worker encerrado (code ${code}); reinício em ${restartDelay / 1000}s.`);
    restartTimer = setTimeout(startChild, restartDelay);
    restartDelay = Math.min(restartDelay * 2, 30000);
  });

  healthTimer = setInterval(() => {
    if (Date.now() - lastHeartbeat <= 120000 && (!cycleStartedAt || Date.now() - cycleStartedAt <= 120000)) return;
    console.error('[Copiador Supervisor] Worker sem confirmação por 120s; reiniciando.');
    if (child) child.kill();
  }, 10000);
}

function release() {
  try {
    if (fs.existsSync(lockPath) && fs.readFileSync(lockPath, 'utf8') === String(process.pid)) {
      fs.unlinkSync(lockPath);
    }
  } catch {}
  process.exitCode = 0;
}

function stop() {
  stopping = true;
  clearTimeout(restartTimer);
  clearInterval(healthTimer);
  if (child && child.exitCode === null && !child.killed) {
    child.kill();
  } else {
    release();
  }
}

try {
  acquireLock();
  startChild();
} catch (error) {
  console.error('[Copiador Supervisor] ' + error.message);
  process.exitCode = 1;
}

process.on('SIGTERM', stop);
process.on('SIGINT', stop);

