#!/usr/bin/env node
/**
 * Hawaii 啟動器
 *
 * 解決的問題：`npm start` 需要一份「完整的生產建置」。
 * 只要 .next 被 dev 模式接管、或原始碼改過沒重建，
 * next start 就會喊了 Ready 之後立刻崩潰，瀏覽器開到死掉的埠 → 看起來像「完全沒反應」。
 *
 * 這個腳本會：
 *   1. 清掉佔用 3000 埠的殘留行程
 *   2. 檢查生產建置是否完整、是否比原始碼舊 → 該重建就重建
 *   3. 啟動伺服器，並「輪詢到真的能回應」才開瀏覽器
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, statSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 3000);
const APP_URL = `http://localhost:${PORT}`;
/* 自動開瀏覽器；帶 --no-open 或設 HAWAII_NO_OPEN=1 可關掉（自動化測試用） */
const AUTO_OPEN = !process.argv.includes('--no-open') && process.env.HAWAII_NO_OPEN !== '1';

const NEXT_DIR = join(ROOT, '.next');
const BUILD_ID = join(NEXT_DIR, 'BUILD_ID');
const PRERENDER = join(NEXT_DIR, 'prerender-manifest.json');

const C = {
  rst: '\x1b[0m', b: '\x1b[1m', dim: '\x1b[2m',
  ikb: '\x1b[38;5;27m', red: '\x1b[31m', grn: '\x1b[32m', yel: '\x1b[33m',
};

const line = (s = '') => console.log(s);
const step = (s) => console.log(`  ${C.ikb}▸${C.rst} ${s}`);
const ok = (s) => console.log(`  ${C.grn}✓${C.rst} ${s}`);
const warn = (s) => console.log(`  ${C.yel}!${C.rst} ${s}`);
const bad = (s) => console.log(`  ${C.red}✗${C.rst} ${s}`);

line();
line(`${C.b}${C.ikb}  HAWAII${C.rst} ${C.dim}· IELTS Studio${C.rst}`);
line(`${C.dim}  ────────────────────────────────────────${C.rst}`);
line();

/* ── 1. 釋放 3000 埠 ───────────────────────────────────────── */
function freePort(port) {
  const res = spawnSync('netstat', ['-ano'], { encoding: 'utf8', windowsHide: true });
  const out = res.stdout || '';
  const pids = new Set();
  for (const raw of out.split(/\r?\n/)) {
    if (!raw.includes(`:${port}`) || !/LISTENING/i.test(raw)) continue;
    const pid = raw.trim().split(/\s+/).pop();
    if (pid && /^\d+$/.test(pid) && pid !== '0') pids.add(pid);
  }
  for (const pid of pids) {
    spawnSync('taskkill', ['/F', '/PID', pid], { stdio: 'ignore', windowsHide: true });
    warn(`已關閉佔用 ${port} 埠的舊行程（PID ${pid}）`);
  }
}
freePort(PORT);

/* ── 2. 判斷生產建置是否可用 ───────────────────────────────── */
const SRC_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.css', '.json']);

function newestSourceTime() {
  let newest = 0;
  const walk = (dir) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      const dot = e.name.lastIndexOf('.');
      if (dot < 0 || !SRC_EXTS.has(e.name.slice(dot))) continue;
      try { const t = statSync(p).mtimeMs; if (t > newest) newest = t; } catch { /* 略過 */ }
    }
  };
  for (const r of ['src', 'public']) walk(join(ROOT, r));
  for (const f of ['package.json', 'next.config.ts', 'tsconfig.json', 'postcss.config.mjs']) {
    try { const t = statSync(join(ROOT, f)).mtimeMs; if (t > newest) newest = t; } catch { /* 略過 */ }
  }
  return newest;
}

const hasBuild = existsSync(BUILD_ID) && existsSync(PRERENDER);
let buildTime = 0;
try { buildTime = statSync(BUILD_ID).mtimeMs; } catch { /* 略過 */ }

const srcTime = newestSourceTime();
const stale = hasBuild && srcTime > buildTime;

let needBuild = false;
if (!hasBuild) {
  needBuild = true;
  if (existsSync(NEXT_DIR) && existsSync(join(NEXT_DIR, 'dev'))) {
    warn('偵測到殘留的開發快取，生產建置不完整');
  } else {
    warn('尚未建立生產版本');
  }
} else if (stale) {
  needBuild = true;
  warn('原始碼比建置版本新，需要重新建置');
}

/* ── 3. 需要就重建 ─────────────────────────────────────────── */
if (needBuild) {
  line();
  step(`正在建置（第一次約 1～2 分鐘，之後只要幾秒）…`);
  line();
  const build = spawnSync('npm', ['run', 'build'], {
    cwd: ROOT, stdio: 'inherit', shell: true, windowsHide: false,
  });
  if (build.status !== 0) {
    line();
    bad('建置失敗。請把上面的錯誤訊息截圖給我，我來修。');
    line();
    process.exit(1);
  }
  line();
  ok('建置完成');
  line();
} else {
  ok('生產版本是最新的');
}

/* ── 4. 啟動伺服器，等它真的能回應再開瀏覽器 ───────────────── */
line();
step(`啟動伺服器 ${C.dim}${APP_URL}${C.rst}`);
line();

const server = spawn('npm', ['start'], {
  cwd: ROOT, stdio: 'inherit', shell: true, windowsHide: false,
});

let opened = false;

async function waitReady(timeoutMs = 90_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (server.exitCode !== null) return false;
    try {
      const r = await fetch(APP_URL, { signal: AbortSignal.timeout(2500), redirect: 'manual' });
      if (r.status > 0) return true;
    } catch { /* 還沒起來，繼續等 */ }
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

(async () => {
  const ready = await waitReady();
  if (ready && !opened) {
    opened = true;
    if (AUTO_OPEN) {
      spawn('cmd', ['/c', 'start', '""', APP_URL], { stdio: 'ignore', windowsHide: true });
      line();
      ok(`已開啟 ${APP_URL}`);
      line();
    } else {
      line();
      ok(`伺服器就緒 ${APP_URL}（未自動開啟瀏覽器）`);
      line();
    }
  } else if (!ready) {
    line();
    bad('伺服器沒能正常啟動。上面應該有錯誤訊息，截圖給我。');
    line();
  }
})();

server.on('exit', (code) => {
  line();
  line(`${C.dim}  伺服器已停止（結束代碼 ${code ?? 0}）${C.rst}`);
  line(`${C.dim}  若瀏覽器沒自動開啟，請手動前往 ${APP_URL}${C.rst}`);
  line();
  process.exit(code ?? 0);
});

/* Ctrl+C 時把子行程一起帶走，避免殘留佔住 3000 埠 */
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    try { server.kill(); } catch { /* 略過 */ }
    process.exit(0);
  });
}
