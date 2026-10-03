/**
 * Gera wordmarks alt42 (estilo IBM 8-bar, minúsculas) para assets/img/brand/.
 * Requer Google Chrome (macOS).
 *
 * Pipeline:
 * 1) Canvas @3× desenha tipografia sólida em fundo transparente
 * 2) Aplica 8 barras horizontais com proporção óptica IBM
 * 3) Limpa fringe/anti-alias residual (alpha)
 * 4) Downscale para 296×106 (PNG com alpha)
 *
 * Uso: node scripts/generate-alt42-png.mjs
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outPath = path.join(root, 'assets/img/brand/alt42-wordmark.png');
const outInverse = path.join(root, 'assets/img/brand/alt42-wordmark-inverse.png');
const CHROME =
    process.env.CHROME_PATH ||
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const OUT_W = 296;
const OUT_H = 106;
const SCALE = 3;
const W = OUT_W * SCALE;
const H = OUT_H * SCALE;
const BARS = 8;

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function httpJson(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let b = '';
            res.on('data', (c) => (b += c));
            res.on('end', () => {
                try {
                    resolve(JSON.parse(b));
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

function buildHtml() {
    return `<!doctype html>
<html><head><meta charset="utf-8"></head>
<body>
<script>
window.renderMark = function renderMark(variant) {
  const W = ${W}, H = ${H}, OUT_W = ${OUT_W}, OUT_H = ${OUT_H}, BARS = ${BARS};
  const positive = variant === 'positive';
  // Fundo transparente; tinta preta (claro) ou branca (escuro)
  const ink = positive ? [12, 12, 12, 255] : [255, 255, 255, 255];
  // Óptica IBM: positivo = barra > vão; inverso = barra < vão
  const barU = positive ? 11 : 9;
  const gapU = positive ? 9 : 11;

  const hi = document.createElement('canvas');
  hi.width = W; hi.height = H;
  const ctx = hi.getContext('2d', { alpha: true, willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, W, H);

  // Tipografia dominante, tracking denso, centragem óptica
  const fontSize = Math.round(H * 1.05);
  ctx.fillStyle = \`rgb(\${ink[0]},\${ink[1]},\${ink[2]})\`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = \`700 \${fontSize}px "Helvetica Neue", Helvetica, Arial, sans-serif\`;

  // Kerning óptico por glifo (pares a-l, l-t, t-4, 4-2)
  const glyphs = ['a', 'l', 't', '4', '2'];
  const gaps = [0.028, 0.02, 0.038, 0.028];
  const widths = glyphs.map((g) => ctx.measureText(g).width);
  const gapPx = gaps.map((g) => g * fontSize);
  const totalW =
    widths.reduce((a, b) => a + b, 0) + gapPx.reduce((a, b) => a + b, 0);
  let x = (W - totalW) / 2;
  const metrics = ctx.measureText('alt42');
  const ascent = metrics.actualBoundingBoxAscent || fontSize * 0.78;
  const descent = metrics.actualBoundingBoxDescent || fontSize * 0.18;
  const blockH = ascent + descent;
  // Leve bias para baixo: minúsculas “sobem” opticamente
  const baseline = (H - blockH) / 2 + ascent + Math.round(H * 0.02);

  for (let i = 0; i < glyphs.length; i++) {
    ctx.fillText(glyphs[i], x + widths[i] / 2, baseline);
    x += widths[i] + (gapPx[i] || 0);
  }

  // Bounding box da tinta (alpha > limiar)
  let id = ctx.getImageData(0, 0, W, H);
  const d = id.data;
  const isInk = (i) => d[i + 3] > 40;

  let minY = H, maxY = 0, minX = W, maxX = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (!isInk(i)) continue;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
  }

  // Expandir leve para cobrir AA nas extremidades
  minY = Math.max(0, minY - 1);
  maxY = Math.min(H - 1, maxY + 1);
  const span = Math.max(1, maxY - minY + 1);
  const units = BARS * barU + (BARS - 1) * gapU;
  const unitPx = span / units;

  // Marcar linhas de vão (gap): limpar tinta → fundo
  const gapRows = new Uint8Array(H);
  let yCursor = minY;
  for (let b = 0; b < BARS; b++) {
    const barH = unitPx * barU;
    yCursor += barH;
    if (b < BARS - 1) {
      const gapH = unitPx * gapU;
      const g0 = Math.round(yCursor);
      const g1 = Math.round(yCursor + gapH);
      for (let y = g0; y < g1 && y < H; y++) gapRows[y] = 1;
      yCursor += gapH;
    }
  }

  for (let y = 0; y < H; y++) {
    if (!gapRows[y]) continue;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      d[i] = 0;
      d[i + 1] = 0;
      d[i + 2] = 0;
      d[i + 3] = 0;
    }
  }

  // Limpeza leve só em linhas de barra: remove fringe semi-transparente
  for (let y = 0; y < H; y++) {
    if (gapRows[y]) continue;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (d[i + 3] > 0 && d[i + 3] < 48) {
        d[i] = 0;
        d[i + 1] = 0;
        d[i + 2] = 0;
        d[i + 3] = 0;
      } else if (d[i + 3] >= 48) {
        // Normaliza tinta sólida nas barras
        d[i] = ink[0];
        d[i + 1] = ink[1];
        d[i + 2] = ink[2];
        d[i + 3] = 255;
      }
    }
  }

  ctx.putImageData(id, 0, 0);

  // Downscale suave
  const lo = document.createElement('canvas');
  lo.width = OUT_W; lo.height = OUT_H;
  const lctx = lo.getContext('2d', { alpha: true, willReadFrequently: true });
  lctx.imageSmoothingEnabled = true;
  lctx.imageSmoothingQuality = 'high';
  lctx.clearRect(0, 0, OUT_W, OUT_H);
  lctx.drawImage(hi, 0, 0, OUT_W, OUT_H);

  // Reaplica vãos no tamanho final — elimina ghost/fringe do downscale
  const out = lctx.getImageData(0, 0, OUT_W, OUT_H);
  const od = out.data;
  for (let y = 0; y < OUT_H; y++) {
    const srcY = Math.min(H - 1, Math.round((y + 0.5) * (H / OUT_H) - 0.5));
    if (!gapRows[srcY]) {
      // Endurece tinta nas barras após downscale
      for (let x = 0; x < OUT_W; x++) {
        const i = (y * OUT_W + x) * 4;
        if (od[i + 3] < 48) {
          od[i] = 0; od[i + 1] = 0; od[i + 2] = 0; od[i + 3] = 0;
        } else {
          od[i] = ink[0]; od[i + 1] = ink[1]; od[i + 2] = ink[2]; od[i + 3] = 255;
        }
      }
      continue;
    }
    for (let x = 0; x < OUT_W; x++) {
      const i = (y * OUT_W + x) * 4;
      od[i] = 0;
      od[i + 1] = 0;
      od[i + 2] = 0;
      od[i + 3] = 0;
    }
  }
  lctx.putImageData(out, 0, 0);

  return {
    dataUrl: lo.toDataURL('image/png'),
    box: { minX, minY, maxX, maxY, span }
  };
};
</script>
</body></html>`;
}

async function withChrome(fn) {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'alt42-gen-'));
    const htmlFile = path.join(profile, 'index.html');
    fs.writeFileSync(htmlFile, buildHtml());
    const port = 9400 + Math.floor(Math.random() * 80);
    const chrome = spawn(
        CHROME,
        [
            `--remote-debugging-port=${port}`,
            `--user-data-dir=${path.join(profile, 'chrome')}`,
            '--headless=new',
            '--disable-gpu',
            '--no-first-run',
            'about:blank'
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] }
    );

    try {
        for (let i = 0; i < 60; i++) {
            try {
                await httpJson(`http://127.0.0.1:${port}/json/version`);
                break;
            } catch {
                await sleep(80);
            }
        }
        const version = await httpJson(`http://127.0.0.1:${port}/json/version`);
        const ws = new WebSocket(version.webSocketDebuggerUrl);
        await new Promise((res, rej) => {
            ws.onopen = res;
            ws.onerror = rej;
        });
        let nextId = 1;
        const pending = new Map();
        ws.onmessage = (ev) => {
            const msg = JSON.parse(ev.data);
            if (msg.id && pending.has(msg.id)) {
                const { resolve, reject } = pending.get(msg.id);
                pending.delete(msg.id);
                if (msg.error) reject(new Error(JSON.stringify(msg.error)));
                else resolve(msg.result);
            }
        };
        const call = (method, params = {}, sessionId) => {
            const id = nextId++;
            const payload = { id, method, params };
            if (sessionId) payload.sessionId = sessionId;
            ws.send(JSON.stringify(payload));
            return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
        };

        const { targetId } = await call('Target.createTarget', {
            url: 'file://' + htmlFile
        });
        const { sessionId } = await call('Target.attachToTarget', {
            targetId,
            flatten: true
        });
        const s = (m, p) => call(m, p, sessionId);
        await s('Runtime.enable');
        await sleep(300);
        const result = await fn({ call: s });
        ws.close();
        return result;
    } finally {
        chrome.kill('SIGKILL');
        try {
            fs.rmSync(profile, { recursive: true, force: true });
        } catch {
            /* ignore */
        }
    }
}

function saveDataUrl(dataUrl, file) {
    const b64 = dataUrl.split(',')[1];
    fs.writeFileSync(file, Buffer.from(b64, 'base64'));
}

const report = await withChrome(async ({ call }) => {
    const pos = await call('Runtime.evaluate', {
        expression: `renderMark('positive')`,
        returnByValue: true,
        awaitPromise: true
    });
    const rev = await call('Runtime.evaluate', {
        expression: `renderMark('reversed')`,
        returnByValue: true,
        awaitPromise: true
    });
    return { pos: pos.result.value, rev: rev.result.value };
});

saveDataUrl(report.pos.dataUrl, outPath);
saveDataUrl(report.rev.dataUrl, outInverse);
console.log('wrote', outPath, fs.statSync(outPath).size, 'bytes', report.pos.box);
console.log('wrote', outInverse, fs.statSync(outInverse).size, 'bytes', report.rev.box);
