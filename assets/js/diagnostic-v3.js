(function() {
    if (!window.location.search.includes('mediaSessionDebug=1')) return;

    const eventLog = [];
    
    const panel = document.createElement('div');
    panel.style.cssText = 'position:fixed;bottom:0;left:0;right:0;height:45vh;background:rgba(0,0,0,0.95);color:#0f0;font-family:monospace;font-size:10px;z-index:999999;overflow-y:auto;padding:10px;pointer-events:auto;display:flex;flex-direction:column;';
    
    const controls = document.createElement('div');
    controls.style.cssText = 'display:flex;gap:10px;margin-bottom:10px;flex-shrink:0;';
    
    const copyBtn = document.createElement('button');
    copyBtn.textContent = 'COPIAR DIAGNÓSTICO V3';
    copyBtn.style.cssText = 'background:#0f0;color:#000;border:none;padding:5px 10px;cursor:pointer;font-weight:bold;';
    
    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'LIMPAR';
    clearBtn.style.cssText = 'background:#f00;color:#fff;border:none;padding:5px 10px;cursor:pointer;font-weight:bold;';
    
    const content = document.createElement('div');
    content.style.cssText = 'flex-grow:1;overflow-y:auto;white-space:pre-wrap;word-break:break-all;';

    controls.appendChild(copyBtn);
    controls.appendChild(clearBtn);
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
        const entry = {
            time: new Date().toISOString().split('T')[1].slice(0, 12),
            type,
            details
        };
        eventLog.push(entry);
        renderLog();
    }

    function renderLog() {
        const els = document.querySelectorAll('audio, video');
        const mediaState = Array.from(els).map(el => {
            return `[${el.tagName}] src=${(el.src||el.currentSrc||'').split('/').pop()} | paused=${el.paused} | ended=${el.ended} | time=${el.currentTime.toFixed(1)} | ready=${el.readyState}`;
        }).join('\n');

        const mp = window.Mary && window.Mary.active && window.Mary.active.player;
        const visualArticle = mp && mp.el ? mp.el.dataset.maryCurrentArticle : 'N/A';
        
        let text = `=== ESTADO ===\nVisual Article: ${visualArticle}\nActiveController URL: ${window.__maryActiveFileController && typeof window.__maryActiveFileController.getUrl === 'function' ? window.__maryActiveFileController.getUrl() : 'none'}\nActiveController playing: ${window.__maryActiveFileController && typeof window.__maryActiveFileController.isPlaying === 'function' ? window.__maryActiveFileController.isPlaying() : 'n/a'}\nTokens: page=${window.__maryArticlePageToken}\n\n${mediaState}\n\n=== LOGS (${eventLog.length}) ===\n`;
        text += eventLog.slice(-40).reverse().map(e => `[${e.time}] ${e.type} | ${JSON.stringify(e.details)}`).join('\n');
        content.textContent = text;
    }

    copyBtn.onclick = () => {
        const str = JSON.stringify({
            timestamp: new Date().toISOString(),
            events: eventLog,
            domAudioCount: document.querySelectorAll('audio').length
        }, null, 2);
        
        const ta = document.createElement('textarea');
        ta.value = str;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try {
            document.execCommand('copy');
            alert('Copiado (' + str.length + ' chars)');
        } catch (e) {
            alert('Erro ao copiar');
        }
        document.body.removeChild(ta);
    };

    clearBtn.onclick = () => {
        eventLog.length = 0;
        renderLog();
    };

    // Global events
    document.addEventListener('visibilitychange', () => {
        addLog('visibilitychange', { state: document.visibilityState });
    });

    ['play', 'pause', 'ended', 'loadedmetadata', 'timeupdate', 'abort'].forEach(evt => {
        document.addEventListener(evt, (e) => {
            if (e.target.tagName === 'AUDIO' || e.target.tagName === 'VIDEO') {
                addLog(evt, { 
                    tag: e.target.tagName, 
                    src: (e.target.src || '').split('/').pop()
                });
            }
        }, true);
    });

    setInterval(renderLog, 500);
    addLog('INIT', { message: 'Diag V3 loaded' });
})();
