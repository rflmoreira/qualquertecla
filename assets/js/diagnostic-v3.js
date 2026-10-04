/**
 * Painel de diagnóstico do Mary Player.
 * Ativo somente com ?mediaSessionDebug=1.
 * Observacional: não altera comportamento de áudio.
 */
(function () {
    if (!window.location.search.includes('mediaSessionDebug=1')) return;

    const eventLog = [];

    const panel = document.createElement('div');
    panel.style.cssText = 'position:fixed;bottom:0;left:0;right:0;height:45vh;background:rgba(0,0,0,0.95);color:#0f0;font-family:monospace;font-size:10px;z-index:999999;overflow-y:auto;padding:10px;pointer-events:auto;display:flex;flex-direction:column;';

    const controls = document.createElement('div');
    controls.style.cssText = 'display:flex;gap:6px;margin-bottom:8px;flex-shrink:0;flex-wrap:wrap;';

    function makeBtn(label, bg) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = label;
        btn.style.cssText = 'background:' + bg + ';color:#000;border:none;padding:5px 8px;cursor:pointer;font-weight:bold;font-size:10px;';
        return btn;
    }

    const copyBtn = makeBtn('COPIAR TIMELINE', '#0f0');
    const copyDiagBtn = makeBtn('COPIAR DIAG V3', '#8f8');
    const clearBtn = makeBtn('LIMPAR', '#f66');
    const markFgBtn = makeBtn('MARK FG', '#6cf');
    const markBgBtn = makeBtn('MARK BG', '#fc6');
    const markS1Btn = makeBtn('MARK SWAP1', '#c6f');
    const markS2Btn = makeBtn('MARK SWAP2', '#f6c');

    const content = document.createElement('div');
    content.style.cssText = 'flex-grow:1;overflow-y:auto;white-space:pre-wrap;word-break:break-all;';

    [copyBtn, copyDiagBtn, clearBtn, markFgBtn, markBgBtn, markS1Btn, markS2Btn].forEach((b) => {
        controls.appendChild(b);
    });
    panel.appendChild(controls);
    panel.appendChild(content);
    document.documentElement.appendChild(panel);

    let lastTimeUpdate = 0;

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

    function copyText(str, label) {
        const ta = document.createElement('textarea');
        ta.value = str;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try {
            document.execCommand('copy');
            alert((label || 'Copiado') + ' (' + str.length + ' chars)');
        } catch (e) {
            alert('Erro ao copiar');
        }
        document.body.removeChild(ta);
    }

    copyBtn.onclick = () => {
        const dump = typeof window.__maryDumpTimeline === 'function'
            ? window.__maryDumpTimeline()
            : JSON.stringify({ entries: getTimeline() }, null, 2);
        copyText(dump, 'Timeline');
    };

    copyDiagBtn.onclick = () => {
        copyText(JSON.stringify({
            timestamp: new Date().toISOString(),
            events: eventLog,
            timeline: getTimeline(),
            domAudioCount: document.querySelectorAll('audio').length
        }, null, 2), 'Diag');
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

    document.addEventListener('visibilitychange', () => {
        addLog('visibilitychange', { state: document.visibilityState });
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
    addLog('INIT', { message: 'Diag V3 + timeline panel loaded' });
})();
