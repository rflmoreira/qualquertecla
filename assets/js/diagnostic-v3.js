/**
 * Painel de diagnóstico do Mary Player.
 * Ativo somente com ?mediaSessionDebug=1.
 * Observacional: não altera comportamento de áudio.
 * Export no smartphone: Share sheet (iOS/Android) + fallback texto selecionável.
 */
(function () {
    if (!window.location.search.includes('mediaSessionDebug=1')) return;

    const eventLog = [];

    const panel = document.createElement('div');
    panel.style.cssText = 'position:fixed;bottom:0;left:0;right:0;height:42vh;max-height:50dvh;background:rgba(0,0,0,0.95);color:#0f0;font-family:monospace;font-size:11px;z-index:999999;overflow:hidden;padding:10px;padding-bottom:calc(10px + env(safe-area-inset-bottom, 0px));pointer-events:auto;display:flex;flex-direction:column;box-sizing:border-box;';

    const controls = document.createElement('div');
    controls.style.cssText = 'display:flex;gap:6px;margin-bottom:8px;flex-shrink:0;flex-wrap:wrap;';

    function makeBtn(label, bg) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = label;
        btn.style.cssText = 'background:' + bg + ';color:#000;border:none;padding:8px 10px;cursor:pointer;font-weight:bold;font-size:11px;border-radius:4px;touch-action:manipulation;-webkit-tap-highlight-color:transparent;';
        return btn;
    }

    const downloadBtn = makeBtn('BAIXAR ARQUIVO', '#0f0');
    const shareBtn = makeBtn('ENVIAR ARQUIVO', '#0ff');
    const copyBtn = makeBtn('COPIAR TEXTO', '#8f8');
    const showBtn = makeBtn('VER TEXTO', '#ff0');
    const clearBtn = makeBtn('LIMPAR', '#f66');
    const markFgBtn = makeBtn('MARK FG', '#6cf');
    const markBgBtn = makeBtn('MARK BG', '#fc6');
    const markS1Btn = makeBtn('MARK SWAP1', '#c6f');
    const markS2Btn = makeBtn('MARK SWAP2', '#f6c');
    const markS3Btn = makeBtn('MARK SWAP3', '#faa');

    const hint = document.createElement('div');
    hint.style.cssText = 'color:#9f9;font-size:10px;margin-bottom:6px;flex-shrink:0;line-height:1.35;';
    hint.textContent = 'Android: use BAIXAR ARQUIVO ou ENVIAR ARQUIVO (não copie texto — o WhatsApp corta). Depois anexe o .json aqui.';

    const content = document.createElement('div');
    content.style.cssText = 'flex-grow:1;overflow-y:auto;-webkit-overflow-scrolling:touch;white-space:pre-wrap;word-break:break-all;';

    [
        downloadBtn, shareBtn, copyBtn, showBtn, clearBtn,
        markFgBtn, markBgBtn, markS1Btn, markS2Btn, markS3Btn
    ].forEach((b) => controls.appendChild(b));
    panel.appendChild(controls);
    panel.appendChild(hint);
    panel.appendChild(content);
    document.documentElement.appendChild(panel);

    let lastTimeUpdate = 0;
    let exportOverlay = null;

    function addLog(type, details) {
        if (type === 'timeupdate') {
            const now = Date.now();
            if (now - lastTimeUpdate < 1000) return;
            lastTimeUpdate = now;
        }
        eventLog.push({
            time: new Date().toISOString().split('T')[1].slice(0, 12),
            type: type,
            details: details
        });
        renderLog();
    }

    function getTimeline() {
        return Array.isArray(window.__maryAudioTimeline) ? window.__maryAudioTimeline : [];
    }

    function buildTimelineDump() {
        if (typeof window.__maryDumpTimeline === 'function') {
            return window.__maryDumpTimeline();
        }
        return JSON.stringify({
            timestamp: new Date().toISOString(),
            visibilityState: document.visibilityState,
            entries: getTimeline()
        }, null, 2);
    }

    function formatEntry(e) {
        return [
            e.ts || '',
            'vis=' + (e.visibilityState || '?'),
            e.event || '',
            'el=' + (e.elId || '-'),
            'src=' + (e.src || '-'),
            'paused=' + e.paused,
            'rs=' + e.readyState,
            'ns=' + e.networkState,
            't=' + e.currentTime,
            e.playResult ? ('play=' + e.playResult + (e.playErrorName ? '/' + e.playErrorName : '')) : '',
            'ctrl=' + (e.ctrlId || '-'),
            e.isSwapping != null ? ('swap=' + e.isSwapping) : '',
            e.note ? ('note=' + e.note) : ''
        ].filter(Boolean).join(' | ');
    }

    function renderLog() {
        const els = document.querySelectorAll('audio, video');
        const mediaState = Array.from(els).map((el) => {
            return '[' + el.tagName + '] src=' + ((el.src || el.currentSrc || '').split('/').slice(-2).join('/')) +
                ' | paused=' + el.paused +
                ' | ended=' + el.ended +
                ' | time=' + (Number.isFinite(el.currentTime) ? el.currentTime.toFixed(1) : el.currentTime) +
                ' | ready=' + el.readyState +
                ' | net=' + el.networkState;
        }).join('\n');

        const mp = window.Mary && window.Mary.active && window.Mary.active.player;
        const visualArticle = mp && mp.el ? mp.el.dataset.maryCurrentArticle : 'N/A';
        const ctrl = window.__maryActiveFileController;
        const timeline = getTimeline();
        const last = timeline.slice(-30).reverse().map(formatEntry).join('\n');

        let text = '=== ESTADO ===\n';
        text += 'Visual Article: ' + visualArticle + '\n';
        text += 'visibility: ' + document.visibilityState + '\n';
        text += 'ActiveController: ' + (ctrl && ctrl.__maryTraceCtrlId ? ctrl.__maryTraceCtrlId : 'none') + '\n';
        text += 'ActiveController URL: ' + (ctrl && typeof ctrl.getUrl === 'function' ? ctrl.getUrl() : 'none') + '\n';
        text += 'ActiveController playing: ' + (ctrl && typeof ctrl.isPlaying === 'function' ? ctrl.isPlaying() : 'n/a') + '\n';
        text += 'Tokens: page=' + window.__maryArticlePageToken + ' autoNextGen=' + window.__maryTraceAutoNextGen + '\n';
        text += 'Timeline entries: ' + timeline.length + '\n\n';
        text += mediaState + '\n\n';
        text += '=== TIMELINE (últimas 30, mais recente primeiro) ===\n' + last + '\n\n';
        text += '=== LOGS LEGACY (' + eventLog.length + ') ===\n';
        text += eventLog.slice(-20).reverse().map((e) => '[' + e.time + '] ' + e.type + ' | ' + JSON.stringify(e.details)).join('\n');
        content.textContent = text;
    }

    function closeExportOverlay() {
        if (exportOverlay && exportOverlay.parentNode) {
            exportOverlay.parentNode.removeChild(exportOverlay);
        }
        exportOverlay = null;
    }

    function showSelectableText(str, title) {
        closeExportOverlay();
        const wrap = document.createElement('div');
        wrap.style.cssText = 'position:fixed;inset:0;z-index:1000000;background:rgba(0,0,0,0.92);display:flex;flex-direction:column;padding:12px;padding-top:calc(12px + env(safe-area-inset-top, 0px));padding-bottom:calc(12px + env(safe-area-inset-bottom, 0px));box-sizing:border-box;';

        const head = document.createElement('div');
        head.style.cssText = 'color:#fff;font:bold 14px sans-serif;margin-bottom:8px;';
        head.textContent = title || 'Selecione o texto e copie';

        const help = document.createElement('div');
        help.style.cssText = 'color:#ccc;font:12px sans-serif;margin-bottom:8px;line-height:1.4;';
        help.textContent = 'iPhone: toque e segure no texto → Selecionar tudo → Copiar. Depois cole no WhatsApp/Notas/e-mail.';

        const ta = document.createElement('textarea');
        ta.value = str;
        ta.readOnly = true;
        ta.style.cssText = 'flex:1;width:100%;box-sizing:border-box;font:11px/1.35 monospace;padding:10px;border:1px solid #444;border-radius:8px;background:#111;color:#0f0;';

        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:8px;margin-top:10px;flex-shrink:0;';

        const selectBtn = makeBtn('SELECIONAR TUDO', '#0f0');
        const closeBtn = makeBtn('FECHAR', '#bbb');
        selectBtn.onclick = () => {
            ta.focus();
            ta.select();
            try { ta.setSelectionRange(0, ta.value.length); } catch (_) { /* ignore */ }
        };
        closeBtn.onclick = closeExportOverlay;

        row.appendChild(selectBtn);
        row.appendChild(closeBtn);
        wrap.appendChild(head);
        wrap.appendChild(help);
        wrap.appendChild(ta);
        wrap.appendChild(row);
        document.documentElement.appendChild(wrap);
        exportOverlay = wrap;

        setTimeout(() => {
            ta.focus();
            ta.select();
            try { ta.setSelectionRange(0, ta.value.length); } catch (_) { /* ignore */ }
        }, 50);
    }

    async function copyText(str, label) {
        try {
            if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                await navigator.clipboard.writeText(str);
                alert((label || 'Copiado') + ' (' + str.length + ' chars). Cole em Notas/WhatsApp.');
                return true;
            }
        } catch (_) { /* fall through */ }

        try {
            const ta = document.createElement('textarea');
            ta.value = str;
            ta.setAttribute('readonly', '');
            ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0.01;';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            try { ta.setSelectionRange(0, ta.value.length); } catch (_) { /* ignore */ }
            const ok = document.execCommand('copy');
            document.body.removeChild(ta);
            if (ok) {
                alert((label || 'Copiado') + ' (' + str.length + ' chars)');
                return true;
            }
        } catch (_) { /* fall through */ }

        showSelectableText(str, (label || 'Timeline') + ' — copie manualmente');
        return false;
    }

    function buildFile(str) {
        const fileName = 'mary-timeline-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
        const blob = new Blob([str], { type: 'application/json' });
        const file = (typeof File === 'function')
            ? new File([blob], fileName, { type: 'application/json' })
            : null;
        return { fileName: fileName, blob: blob, file: file };
    }

    function downloadDump(str) {
        const built = buildFile(str);
        const url = URL.createObjectURL(built.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = built.fileName;
        a.rel = 'noopener';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            try { document.body.removeChild(a); } catch (_) { /* ignore */ }
            try { URL.revokeObjectURL(url); } catch (_) { /* ignore */ }
        }, 1500);
        alert('Download iniciado: ' + built.fileName + ' (' + str.length + ' chars). Anexe esse arquivo no chat.');
        return true;
    }

    async function shareFile(str, label) {
        const title = label || 'Mary Audio Timeline';
        const built = buildFile(str);

        // Android/iOS: sempre preferir arquivo. Texto no WhatsApp TRUNCA (~30KB).
        if (navigator.share && built.file) {
            try {
                const payload = { files: [built.file], title: title };
                if (!navigator.canShare || navigator.canShare(payload)) {
                    await navigator.share(payload);
                    return true;
                }
            } catch (err) {
                if (err && err.name === 'AbortError') return false;
            }
        }

        // Fallback confiável no Android Chrome: download do .json
        return downloadDump(str);
    }

    downloadBtn.onclick = () => {
        downloadDump(buildTimelineDump());
    };

    shareBtn.onclick = () => {
        shareFile(buildTimelineDump(), 'Mary Audio Timeline');
    };

    copyBtn.onclick = () => {
        const dump = buildTimelineDump();
        if (dump.length > 20000) {
            alert('Texto grande demais para copiar no Android (corta). Use BAIXAR ARQUIVO ou ENVIAR ARQUIVO.');
            downloadDump(dump);
            return;
        }
        copyText(dump, 'Timeline');
    };

    showBtn.onclick = () => {
        const dump = buildTimelineDump();
        if (dump.length > 20000) {
            alert('Texto grande demais na tela. Use BAIXAR ARQUIVO.');
            downloadDump(dump);
            return;
        }
        showSelectableText(dump, 'Timeline — selecione e copie');
    };

    clearBtn.onclick = () => {
        eventLog.length = 0;
        if (Array.isArray(window.__maryAudioTimeline)) {
            window.__maryAudioTimeline.length = 0;
        }
        try { sessionStorage.removeItem('__maryAudioTimelineV1'); } catch (_) { /* ignore */ }
        renderLog();
    };

    markFgBtn.onclick = () => { if (window.__maryMark) window.__maryMark('FG'); };
    markBgBtn.onclick = () => { if (window.__maryMark) window.__maryMark('BG'); };
    markS1Btn.onclick = () => { if (window.__maryMark) window.__maryMark('AFTER_SWAP1'); };
    markS2Btn.onclick = () => { if (window.__maryMark) window.__maryMark('AFTER_SWAP2'); };
    markS3Btn.onclick = () => { if (window.__maryMark) window.__maryMark('AFTER_SWAP3'); };

    document.addEventListener('visibilitychange', () => {
        addLog('visibilitychange', { state: document.visibilityState });
        if (document.visibilityState === 'hidden' && window.__maryMark) {
            window.__maryMark('BG_AUTO');
        }
    });

    ['play', 'pause', 'ended', 'loadedmetadata', 'timeupdate', 'abort', 'error', 'stalled', 'waiting', 'suspend'].forEach((evt) => {
        document.addEventListener(evt, (e) => {
            if (e.target && (e.target.tagName === 'AUDIO' || e.target.tagName === 'VIDEO')) {
                addLog(evt, {
                    tag: e.target.tagName,
                    src: ((e.target.src || '').split('/').slice(-2).join('/')),
                    paused: e.target.paused,
                    readyState: e.target.readyState
                });
            }
        }, true);
    });

    setInterval(renderLog, 500);
    addLog('INIT', { message: 'Diag V3 + mobile export ready' });
})();
