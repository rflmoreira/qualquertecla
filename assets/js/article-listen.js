/**
 * Botão Ouvir na meta da matéria: áudio pré-gerado (WAV).
 * Sem arquivo disponível, Ouvir e controles de reprodução ficam desabilitados.
 * Nunca dispara geração no servidor.
 */
(function (global) {
    'use strict';

    function formatTime(sec) {
        if (!Number.isFinite(sec)) return '0:00';
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return m + ':' + (s < 10 ? '0' : '') + s;
    }

    function resolveAbsoluteUrl(u) {
        try {
            return new URL(u, window.location.href).href;
        } catch (_) {
            return String(u || '');
        }
    }

    /**
     * Timeline observacional (somente ?mediaSessionDebug=1).
     * NÃO monkey-patcha HTMLMediaElement.prototype.
     * NÃO altera semântica de play/pause/load — só registra nos call sites.
     */
    const MaryAudioTrace = (function createMaryAudioTrace() {
        const enabled = (() => {
            try {
                return typeof location !== 'undefined' &&
                    String(location.search || '').includes('mediaSessionDebug=1');
            } catch (_) {
                return false;
            }
        })();

        const noop = () => {};
        if (!enabled) {
            return {
                enabled: false,
                log: noop,
                mark: noop,
                watchMedia: noop,
                trackPlay: (_el, promise) => promise,
                noteEl: noop,
                getCtrlId: () => '',
                snapshotEl: () => null
            };
        }

        const STORAGE_KEY = '__maryAudioTimelineV1';
        const MAX_ENTRIES = 800;
        const timeline = [];
        const elIds = new WeakMap();
        let elSeq = 0;
        let ctrlSeq = 0;
        const watched = new WeakSet();
        const watchedList = [];
        const stallState = new WeakMap();
        const MEDIA_EVENTS = [
            'play', 'playing', 'pause', 'waiting', 'stalled', 'suspend',
            'ended', 'error', 'emptied', 'abort', 'loadedmetadata',
            'canplay', 'canplaythrough', 'loadstart', 'durationchange'
        ];

        function srcTail(elOrUrl) {
            const raw = typeof elOrUrl === 'string'
                ? elOrUrl
                : ((elOrUrl && (elOrUrl.currentSrc || elOrUrl.src)) || '');
            const s = String(raw || '');
            if (!s) return '';
            const parts = s.split('/').filter(Boolean);
            return parts.slice(-3).join('/');
        }

        function noteEl(el, role) {
            if (!el || typeof el !== 'object') return '';
            if (!elIds.has(el)) {
                elSeq += 1;
                elIds.set(el, (role ? role + '-' : 'el-') + elSeq);
            }
            return elIds.get(el);
        }

        function getCtrlId(ctrl) {
            if (!ctrl || typeof ctrl !== 'object') return '';
            if (ctrl.__maryTraceCtrlId) return ctrl.__maryTraceCtrlId;
            ctrlSeq += 1;
            ctrl.__maryTraceCtrlId = 'ctrl-' + ctrlSeq;
            return ctrl.__maryTraceCtrlId;
        }

        function snapshotEl(el) {
            if (!el) return null;
            let err = null;
            try {
                if (el.error) {
                    err = { code: el.error.code, message: el.error.message || '' };
                }
            } catch (_) { /* ignore */ }
            return {
                elId: noteEl(el),
                src: srcTail(el),
                paused: !!el.paused,
                ended: !!el.ended,
                readyState: el.readyState,
                networkState: el.networkState,
                currentTime: Number.isFinite(el.currentTime) ? Number(el.currentTime.toFixed(3)) : el.currentTime,
                duration: Number.isFinite(el.duration) ? Number(el.duration.toFixed(3)) : String(el.duration),
                muted: !!el.muted,
                volume: el.volume,
                inDom: !!(el.parentNode),
                error: err
            };
        }

        function activeCtrlSnap() {
            const ctrl = global.__maryActiveFileController;
            if (!ctrl) return { ctrlId: null, ctrlUrl: null, ctrlPlaying: null, transitioning: null };
            return {
                ctrlId: getCtrlId(ctrl),
                ctrlUrl: typeof ctrl.getUrl === 'function' ? srcTail(ctrl.getUrl()) : null,
                ctrlPlaying: typeof ctrl.isPlaying === 'function' ? ctrl.isPlaying() : null,
                transitioning: typeof ctrl.isTransitioning === 'function' ? ctrl.isTransitioning() : null
            };
        }

        function persist() {
            try {
                sessionStorage.setItem(STORAGE_KEY, JSON.stringify(timeline.slice(-MAX_ENTRIES)));
            } catch (_) { /* ignore quota */ }
        }

        function log(event, details) {
            const el = details && details.el;
            const snap = el ? snapshotEl(el) : null;
            const ctrlSnap = activeCtrlSnap();
            const entry = {
                ts: new Date().toISOString(),
                tPerf: typeof performance !== 'undefined' ? performance.now() : 0,
                visibilityState: typeof document !== 'undefined' ? document.visibilityState : null,
                event: String(event || ''),
                elId: snap ? snap.elId : (details && details.elId) || null,
                src: snap ? snap.src : (details && details.src) || null,
                paused: snap ? snap.paused : null,
                ended: snap ? snap.ended : null,
                readyState: snap ? snap.readyState : null,
                networkState: snap ? snap.networkState : null,
                currentTime: snap ? snap.currentTime : null,
                duration: snap ? snap.duration : null,
                inDom: snap ? snap.inDom : null,
                mediaError: snap ? snap.error : null,
                playResult: details && details.playResult != null ? details.playResult : null,
                playErrorName: details && details.playErrorName != null ? details.playErrorName : null,
                playErrorMessage: details && details.playErrorMessage != null ? details.playErrorMessage : null,
                ctrlId: (details && details.ctrlId) || ctrlSnap.ctrlId,
                ctrlUrl: ctrlSnap.ctrlUrl,
                ctrlPlaying: ctrlSnap.ctrlPlaying,
                isSwapping: (details && details.isSwapping != null)
                    ? details.isSwapping
                    : ctrlSnap.transitioning,
                pageToken: global.__maryArticlePageToken != null ? global.__maryArticlePageToken : null,
                autoNextGen: global.__maryTraceAutoNextGen != null ? global.__maryTraceAutoNextGen : null,
                note: details && details.note != null ? details.note : null,
                extra: details && details.extra != null ? details.extra : null
            };
            timeline.push(entry);
            if (timeline.length > MAX_ENTRIES) timeline.splice(0, timeline.length - MAX_ENTRIES);
            global.__maryAudioTimeline = timeline;
            persist();
            try {
                if (typeof console !== 'undefined' && console.debug) {
                    console.debug('[MaryAudioTrace]', entry.event, entry);
                }
            } catch (_) { /* ignore */ }
            return entry;
        }

        function mark(label) {
            log('MARK', { note: String(label || ''), extra: { manual: true } });
        }

        function trackPlay(el, promise, note, meta) {
            const base = Object.assign({ el: el, note: note || 'play' }, meta || {});
            log('play-call', base);
            if (!promise || typeof promise.then !== 'function') {
                log('play-result', Object.assign({}, base, {
                    playResult: 'no-promise',
                    extra: { pausedAfter: el ? !!el.paused : null }
                }));
                return promise;
            }
            // Observa a mesma Promise sem alterar a cadeia do caller.
            promise.then(
                () => {
                    log('play-resolved', Object.assign({}, base, {
                        playResult: 'resolved',
                        extra: { pausedAfter: el ? !!el.paused : null }
                    }));
                },
                (err) => {
                    log('play-rejected', Object.assign({}, base, {
                        playResult: 'rejected',
                        playErrorName: err && err.name ? String(err.name) : 'Error',
                        playErrorMessage: err && err.message ? String(err.message) : String(err || '')
                    }));
                }
            );
            return promise;
        }

        function watchMedia(el, role) {
            if (!el || watched.has(el)) return;
            watched.add(el);
            watchedList.push(el);
            noteEl(el, role || 'media');
            log('watch-attach', { el: el, note: role || 'media' });
            MEDIA_EVENTS.forEach((evtName) => {
                el.addEventListener(evtName, () => {
                    const extra = {};
                    if (evtName === 'error' && el.error) {
                        extra.errorCode = el.error.code;
                        extra.errorMessage = el.error.message || '';
                    }
                    log('media:' + evtName, { el: el, note: role || 'media', extra: extra });
                });
            });
            // timeupdate amostrado (observacional)
            let lastTu = 0;
            el.addEventListener('timeupdate', () => {
                const now = Date.now();
                if (now - lastTu < 1000) return;
                lastTu = now;
                log('media:timeupdate', { el: el, note: role || 'media' });
            });
        }

        // SILENT_STALL: só diagnóstico — não pausa/reinicia/recupera.
        setInterval(() => {
            try {
                const fromDom = typeof document !== 'undefined'
                    ? Array.from(document.querySelectorAll('audio'))
                    : [];
                const nodes = fromDom.slice();
                for (let i = 0; i < watchedList.length; i++) {
                    const el = watchedList[i];
                    if (el && nodes.indexOf(el) < 0) nodes.push(el);
                }
                nodes.forEach((el) => {
                    if (!el || el.paused || el.ended) {
                        stallState.delete(el);
                        return;
                    }
                    const t = Number(el.currentTime);
                    if (!Number.isFinite(t)) return;
                    const prev = stallState.get(el);
                    if (!prev) {
                        stallState.set(el, { t: t, hits: 0 });
                        return;
                    }
                    if (Math.abs(t - prev.t) < 0.05) {
                        prev.hits += 1;
                        if (prev.hits === 2) {
                            log('SILENT_STALL', {
                                el: el,
                                note: 'currentTime not advancing while paused=false',
                                extra: { stalledAt: t, samples: prev.hits }
                            });
                        }
                    } else {
                        prev.t = t;
                        prev.hits = 0;
                    }
                });
            } catch (_) { /* ignore */ }
        }, 1000);

        ['visibilitychange', 'pagehide', 'pageshow', 'freeze', 'resume'].forEach((evtName) => {
            try {
                const target = evtName === 'visibilitychange' ? document : global;
                target.addEventListener(evtName, (e) => {
                    log('lifecycle:' + evtName, {
                        note: evtName,
                        extra: {
                            persisted: e && typeof e.persisted === 'boolean' ? e.persisted : null,
                            visibilityState: document.visibilityState
                        }
                    });
                });
            } catch (_) { /* ignore */ }
        });

        try {
            const saved = sessionStorage.getItem(STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed)) {
                    parsed.forEach((row) => timeline.push(row));
                }
            }
        } catch (_) { /* ignore */ }

        global.__maryAudioTimeline = timeline;
        global.__maryMark = mark;
        global.__maryDumpTimeline = () => JSON.stringify({
            timestamp: new Date().toISOString(),
            visibilityState: document.visibilityState,
            entries: timeline.slice()
        }, null, 2);

        log('TRACE_INIT', { note: 'observational timeline ready', extra: { restored: timeline.length } });

        return {
            enabled: true,
            log: log,
            mark: mark,
            watchMedia: watchMedia,
            trackPlay: trackPlay,
            noteEl: noteEl,
            getCtrlId: getCtrlId,
            snapshotEl: snapshotEl
        };
    })();

    function createHighlighter() {
        let blocks = [];
        let totalChars = 0;
        let activeEl = null;

        const parseBlocks = () => {
            blocks = [];
            totalChars = 0;
            const selectors = [
                '.article-title',
                '.article-subtitle',
                '.article-content p',
                '.article-content h1',
                '.article-content h2',
                '.article-content h3',
                '.article-content li',
                '.article-content blockquote'
            ];

            const els = Array.from(document.querySelectorAll(selectors.join(', ')));

            for (const el of els) {
                const text = (el.textContent || el.innerText || '').replace(/\s+/g, ' ').trim();
                if (!text) continue;

                const start = totalChars;
                totalChars += text.length;

                blocks.push({
                    el,
                    text,
                    startRatio: start,
                    endRatio: totalChars
                });
                totalChars += 2;
            }

            if (totalChars > 0) {
                blocks.forEach(b => {
                    b.startRatio = b.startRatio / totalChars;
                    b.endRatio = b.endRatio / totalChars;
                });
            }
        };

        const highlight = (ratio) => {
            if (!blocks.length) {
                parseBlocks();
                if (!blocks.length) return;
                document.body.classList.add('mary-reading-active');
            }

            const target = blocks.find(b => ratio >= b.startRatio && ratio <= b.endRatio) ||
                (ratio >= 1 ? blocks[blocks.length - 1] : blocks[0]);

            if (activeEl === target.el) return;

            if (activeEl) {
                activeEl.classList.remove('mary-highlight-current');
            }

            target.el.classList.add('mary-highlight-current');
            activeEl = target.el;

            const rect = activeEl.getBoundingClientRect();
            const viewHeight = window.innerHeight;

            const isMostlyVisible = (rect.top >= viewHeight * 0.1 && rect.bottom <= viewHeight * 0.9) ||
                (rect.top < viewHeight * 0.1 && rect.bottom > viewHeight * 0.5);

            if (!isMostlyVisible) {
                const offset = rect.top + window.scrollY - (viewHeight / 2) + (rect.height / 2);
                const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
                window.scrollTo({
                    top: Math.max(0, offset),
                    behavior: motionQuery && motionQuery.matches ? 'auto' : 'smooth'
                });
            }
        };

        const reset = () => {
            if (activeEl) {
                activeEl.classList.remove('mary-highlight-current');
            }
            activeEl = null;
            document.body.classList.remove('mary-reading-active');
        };

        const start = () => {
            parseBlocks();
            document.body.classList.add('mary-reading-active');
        };

        return { start, highlight, reset };
    }

    function syncButton(button, speaking) {
        if (!button) return;
        const icon = button.querySelector('[data-listen-icon]');
        const label = button.querySelector('[data-listen-label]');
        button.setAttribute('aria-pressed', speaking ? 'true' : 'false');
        button.setAttribute(
            'aria-label',
            speaking ? 'Pausar leitura com Mary AI' : 'Ouvir com Mary AI'
        );
        button.classList.toggle('is-playing', !!speaking);
        if (icon) {
            icon.className = speaking ? 'ph ph-pause' : 'ph ph-speaker-high';
        }
        if (label) label.textContent = 'Ouvir com Mary AI';
    }

    function setMediaSessionMetadata(art) {
        if (!('mediaSession' in navigator) || !art) return;
        const rawThumb = art.featured_image || art.thumbnail || 'assets/img/placeholder-article.svg';
        const src = window.MockData && typeof window.MockData.assetPath === 'function'
            ? window.MockData.assetPath(rawThumb)
            : rawThumb;
        const artwork = [];
        if (src) {
            const absoluteSrc = resolveAbsoluteUrl(src);
            let mimeType = 'image/jpeg';
            const lower = absoluteSrc.toLowerCase();
            if (lower.endsWith('.png')) mimeType = 'image/png';
            else if (lower.endsWith('.webp')) mimeType = 'image/webp';
            else if (lower.endsWith('.svg')) mimeType = 'image/svg+xml';
            artwork.push({ src: absoluteSrc, sizes: '512x512', type: mimeType });
        }
        try {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: art.title || 'Qualquer Tecla',
                artist: (art.authors && art.authors.name) || 'Equipe Qualquer Tecla',
                album: 'Qualquer Tecla Artigos',
                artwork
            });
        } catch (e) {
            console.warn('Erro ao definir metadados do MediaSession:', e);
        }
    }

    function createFileController(url, onChrome, opts = {}) {
        let audio = null;
        let currentUrl = String(url || '');
        let isSwappingAudio = false;
        let pendingSwapUrl = null;
        const ctrlTraceId = MaryAudioTrace.enabled ? ('ctrl-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7)) : '';

        let currentOnChrome = onChrome;
        let currentOpts = opts;
        let currentOnProgress = typeof currentOpts.onProgress === 'function' ? currentOpts.onProgress : null;
        let currentOnBuffering = typeof currentOpts.onBuffering === 'function' ? currentOpts.onBuffering : null;

        // Anti-flicker only (~300ms). Not an animation timer.
        let loadingShowTimer = null;
        let bufferingDesired = false;

        const setChrome = (v, stopped = false) => {
            if (typeof currentOnChrome === 'function') currentOnChrome(v, stopped);
        };

        const isPlayingNow = () => Boolean(audio && !audio.paused);

        const emitBuffering = (on) => {
            if (typeof currentOnBuffering === 'function') currentOnBuffering(on);
        };

        const clearLoadingShowTimer = () => {
            if (loadingShowTimer) {
                clearTimeout(loadingShowTimer);
                loadingShowTimer = null;
            }
        };

        const requestBufferingShow = () => {
            bufferingDesired = true;
            if (loadingShowTimer) return;
            loadingShowTimer = setTimeout(() => {
                loadingShowTimer = null;
                if (bufferingDesired) emitBuffering(true);
            }, 300);
        };

        const requestBufferingHide = () => {
            bufferingDesired = false;
            clearLoadingShowTimer();
            emitBuffering(false);
        };

        /** canplay*: cancel pending flash only; do not force-hide a visible loader. */
        const cancelPendingBufferingShow = () => {
            clearLoadingShowTimer();
        };

        const emitProgress = () => {
            if (!currentOnProgress || !audio) return;
            const currentRaw = Number(audio.currentTime);
            const current = Number.isFinite(currentRaw) && currentRaw >= 0 ? currentRaw : 0;
            let duration = Number(audio.duration);
            if (!Number.isFinite(duration) || duration <= 0) {
                try {
                    if (audio.seekable && audio.seekable.length > 0) {
                        const end = Number(audio.seekable.end(audio.seekable.length - 1));
                        if (Number.isFinite(end) && end > 0) duration = end;
                        else duration = 0;
                    } else {
                        duration = 0;
                    }
                } catch (_) {
                    duration = 0;
                }
            }
            currentOnProgress({
                current,
                duration,
                playing: isPlayingNow(),
                ratio: duration > 0 ? current / duration : 0
            });
        };

        const syncPlaybackState = () => {
            if (!('mediaSession' in navigator)) return;
            navigator.mediaSession.playbackState = isPlayingNow() ? 'playing' : 'paused';
        };

        const cleanup = () => {
            MaryAudioTrace.log('cleanup', {
                el: audio,
                ctrlId: ctrlTraceId,
                isSwapping: isSwappingAudio,
                note: 'cleanup'
            });
            isSwappingAudio = false;
            pendingSwapUrl = null;
            requestBufferingHide();
            if (audio) {
                try {
                    MaryAudioTrace.log('pause-call', { el: audio, ctrlId: ctrlTraceId, note: 'cleanup' });
                    audio.pause();
                    MaryAudioTrace.log('removeAttribute-src', { el: audio, ctrlId: ctrlTraceId, note: 'cleanup' });
                    audio.removeAttribute('src');
                    MaryAudioTrace.log('load-call', { el: audio, ctrlId: ctrlTraceId, note: 'cleanup' });
                    audio.load();
                    if (audio.parentNode) {
                        MaryAudioTrace.log('destroy-audio', {
                            el: audio,
                            ctrlId: ctrlTraceId,
                            note: 'cleanup:removeChild'
                        });
                        audio.parentNode.removeChild(audio);
                    }
                } catch (_) {
                    /* ignore */
                }
                audio = null;
            }
            setChrome(false, true);
            if (currentOnProgress) currentOnProgress({ current: 0, duration: 0, playing: false });
        };

        const ensure = () => {
            if (audio) return audio;
            audio = new Audio(currentUrl);
            audio.style.display = 'none';
            if (document.body) document.body.appendChild(audio);
            audio.preload = 'metadata';
            MaryAudioTrace.noteEl(audio, 'article');
            MaryAudioTrace.watchMedia(audio, 'article');
            MaryAudioTrace.log('create-audio', {
                el: audio,
                ctrlId: ctrlTraceId,
                note: 'ensure:create',
                src: String(currentUrl || '')
            });
            audio.addEventListener('ended', () => {
                requestBufferingHide();
                setChrome(false, true);
                emitProgress();
                if (typeof currentOpts.onEnded === 'function') currentOpts.onEnded();
            });
            audio.addEventListener('play', () => {
                setChrome(true, false);
                emitProgress();
                // Bugfix iOS Safari: re-registrar os handlers a cada play
                // porque o iOS deleta a associação do MediaSession quando o src
                // do áudio muda em background (ex: no swapAndPlay).
                if (typeof registerMediaSessionHandlers === 'function') {
                    registerMediaSessionHandlers();
                }
            });
            audio.addEventListener('playing', () => {
                requestBufferingHide();
                // Handoff ad→faixa: só para o ad quando a próxima faixa confirma playing.
                stopAdAudio();
            });
            audio.addEventListener('waiting', () => {
                requestBufferingShow();
            });
            audio.addEventListener('stalled', () => {
                requestBufferingShow();
            });
            audio.addEventListener('canplay', () => {
                cancelPendingBufferingShow();
            });
            audio.addEventListener('canplaythrough', () => {
                cancelPendingBufferingShow();
            });
            audio.addEventListener('pause', () => {
                // Ignorar pause transiente de swapAndPlay (pause→src→load→play).
                // isSwappingAudio já serializa o swap; evita flag separada no elemento.
                if (isSwappingAudio) return;
                requestBufferingHide();
                setChrome(false, true);
                emitProgress();
            });
            audio.addEventListener('timeupdate', emitProgress);
            audio.addEventListener('loadedmetadata', emitProgress);
            audio.addEventListener('durationchange', emitProgress);
            audio.addEventListener('error', () => {
                // Durante swap, não destruir o elemento — a recuperação de play trata o caso.
                if (isSwappingAudio) return;
                cleanup();
            });
            return audio;
        };

        const effectiveDuration = (el) => {
            if (!el) return 0;
            const dur = Number(el.duration);
            if (Number.isFinite(dur) && dur > 0) return dur;
            try {
                if (el.seekable && el.seekable.length > 0) {
                    const end = Number(el.seekable.end(el.seekable.length - 1));
                    if (Number.isFinite(end) && end > 0) return end;
                }
            } catch (_) {
                /* ignore */
            }
            return 0;
        };

        return {
            mode: 'file',
            __maryTraceCtrlId: ctrlTraceId,
            updateCallbacks(newOnChrome, newOpts) {
                currentOnChrome = newOnChrome;
                currentOpts = newOpts || {};
                currentOnProgress = typeof currentOpts.onProgress === 'function' ? currentOpts.onProgress : null;
                currentOnBuffering = typeof currentOpts.onBuffering === 'function' ? currentOpts.onBuffering : null;
                // Rebind: cancel pending show-delay so old timer cannot flash the new button.
                // If buffering is still desired, re-arm delay against the new callback.
                clearLoadingShowTimer();
                if (bufferingDesired) {
                    loadingShowTimer = setTimeout(() => {
                        loadingShowTimer = null;
                        if (bufferingDesired) emitBuffering(true);
                    }, 300);
                } else {
                    emitBuffering(false);
                }
            },
            emitCurrentProgress() {
                emitProgress();
                setChrome(isPlayingNow(), false);
            },
            swapAndPlay(newUrl) {
                if (!audio) return;
                const target = String(newUrl || '');
                if (!target) return;

                MaryAudioTrace.log('swapAndPlay', {
                    el: audio,
                    ctrlId: ctrlTraceId,
                    isSwapping: isSwappingAudio,
                    note: 'swapAndPlay',
                    src: target,
                    extra: { from: String(currentUrl || ''), to: target }
                });

                if (isSwappingAudio) {
                    pendingSwapUrl = target;
                    MaryAudioTrace.log('swapAndPlay-coalesce', {
                        el: audio,
                        ctrlId: ctrlTraceId,
                        isSwapping: true,
                        note: 'pendingSwapUrl',
                        src: target
                    });
                    return;
                }

                const processSwap = (targetUrl) => {
                    if (!audio) return;
                    isSwappingAudio = true;
                    pendingSwapUrl = null;
                    currentUrl = targetUrl;
                    let swapWatchdogTimer = null;
                    let stuckVisArmed = false;
                    // Mantém faixa audível enquanto a próxima bufferiza em BG.
                    ensureAdHandoffWarm();
                    MaryAudioTrace.log('swapAndPlay-process', {
                        el: audio,
                        ctrlId: ctrlTraceId,
                        isSwapping: true,
                        note: 'processSwap',
                        src: targetUrl
                    });

                    try {
                        MaryAudioTrace.log('pause-call', {
                            el: audio,
                            ctrlId: ctrlTraceId,
                            isSwapping: true,
                            note: 'swapAndPlay'
                        });
                        audio.pause();
                        MaryAudioTrace.log('src-set', {
                            el: audio,
                            ctrlId: ctrlTraceId,
                            isSwapping: true,
                            note: 'swapAndPlay',
                            src: targetUrl
                        });
                        audio.src = targetUrl;
                        MaryAudioTrace.log('load-call', {
                            el: audio,
                            ctrlId: ctrlTraceId,
                            isSwapping: true,
                            note: 'swapAndPlay'
                        });
                        audio.load();
                    } catch (_) {
                        /* ignore */
                    }

                    if (audio.readyState < 3) {
                        requestBufferingShow();
                    }

                    const clearSwapWatchdog = () => {
                        if (swapWatchdogTimer) {
                            clearTimeout(swapWatchdogTimer);
                            swapWatchdogTimer = null;
                        }
                    };

                    const isSwapStuck = () => {
                        if (!audio || currentUrl !== targetUrl) return false;
                        const ct = Number(audio.currentTime) || 0;
                        return audio.readyState < 3 && ct < 0.05;
                    };

                    const finishSwapLock = () => {
                        clearSwapWatchdog();
                        if (!audio) {
                            isSwappingAudio = false;
                            pendingSwapUrl = null;
                            return;
                        }
                        if (pendingSwapUrl && pendingSwapUrl !== currentUrl) {
                            const nextUrl = pendingSwapUrl;
                            pendingSwapUrl = null;
                            processSwap(nextUrl);
                            return;
                        }
                        pendingSwapUrl = null;
                        isSwappingAudio = false;
                        syncPlaybackState();
                        MaryAudioTrace.log('swapAndPlay-unlock', {
                            el: audio,
                            ctrlId: ctrlTraceId,
                            isSwapping: false,
                            note: 'finishSwapLock'
                        });
                    };

                    const armResumeOnVisible = (reason) => {
                        if (stuckVisArmed) return;
                        stuckVisArmed = true;
                        const resumeOnVisible = () => {
                            if (document.visibilityState !== 'visible') return;
                            document.removeEventListener('visibilitychange', resumeOnVisible);
                            if (!audio || currentUrl !== targetUrl) return;
                            // Stuck BG: paused=false + readyState=0 — ainda precisa de nudge.
                            if (!isSwapStuck() && !audio.paused) return;
                            const p = audio.play();
                            MaryAudioTrace.trackPlay(audio, p, 'swapAndPlay:resumeOnVisible', {
                                ctrlId: ctrlTraceId
                            });
                            if (p && typeof p.then === 'function') {
                                p.then(() => { stopAdAudio(); }).catch(() => { /* ignore */ });
                            }
                        };
                        document.addEventListener('visibilitychange', resumeOnVisible);
                        MaryAudioTrace.log('arm-resumeOnVisible', {
                            el: audio,
                            ctrlId: ctrlTraceId,
                            note: reason || 'swapAndPlay:resume'
                        });
                    };

                    const attemptPlay = (isRetry) => {
                        if (!audio) {
                            finishSwapLock();
                            return;
                        }
                        const playPromise = audio.play();
                        MaryAudioTrace.trackPlay(audio, playPromise, isRetry ? 'swapAndPlay:retry' : 'swapAndPlay', {
                            ctrlId: ctrlTraceId,
                            isSwapping: true
                        });
                        if (playPromise === undefined || typeof playPromise.then !== 'function') {
                            if (audio && !audio.paused) stopAdAudio();
                            finishSwapLock();
                            return;
                        }
                        playPromise.then(() => {
                            // play() resolveu: sessão da próxima faixa ativa; libera o ad.
                            clearSwapWatchdog();
                            stopAdAudio();
                            // Android costuma pintar MediaSession só com playback ativo.
                            if (__maryNav.currentArt) {
                                setMediaSessionMetadata(__maryNav.currentArt);
                            }
                            finishSwapLock();
                        }).catch((err) => {
                            if (err && err.name === 'AbortError') {
                                finishSwapLock();
                                return;
                            }
                            if (!isRetry && audio && currentUrl === targetUrl) {
                                let retried = false;
                                const retryOnce = () => {
                                    if (retried) return;
                                    retried = true;
                                    if (!audio) {
                                        finishSwapLock();
                                        return;
                                    }
                                    audio.removeEventListener('canplay', retryOnce);
                                    audio.removeEventListener('loadeddata', retryOnce);
                                    if (currentUrl !== targetUrl) {
                                        finishSwapLock();
                                        return;
                                    }
                                    attemptPlay(true);
                                };
                                audio.addEventListener('canplay', retryOnce);
                                audio.addEventListener('loadeddata', retryOnce);
                                if (audio.readyState >= 2) {
                                    retryOnce();
                                }
                                return;
                            }
                            if (err && err.name === 'NotAllowedError' && document.visibilityState !== 'visible') {
                                ensureAdHandoffWarm();
                                armResumeOnVisible('swapAndPlay:NotAllowedError');
                            } else {
                                console.error('Audio swap play error:', err);
                            }
                            finishSwapLock();
                        });
                    };

                    // Se o play() fica pendente com readyState=0 (não rejeita), reaquecer ad.
                    swapWatchdogTimer = setTimeout(() => {
                        swapWatchdogTimer = null;
                        if (!audio || currentUrl !== targetUrl) return;
                        if (!isSwapStuck()) return;
                        MaryAudioTrace.log('swapAndPlay-watchdog', {
                            el: audio,
                            ctrlId: ctrlTraceId,
                            isSwapping: true,
                            note: 'silent-stall-handoff',
                            extra: {
                                readyState: audio.readyState,
                                paused: audio.paused,
                                currentTime: audio.currentTime,
                                visibilityState: document.visibilityState
                            }
                        });
                        ensureAdHandoffWarm();
                        if (document.visibilityState !== 'visible') {
                            armResumeOnVisible('swapAndPlay:silentStall');
                        }
                    }, 2500);

                    attemptPlay(false);
                };

                processSwap(target);
            },
            getUrl() {
                // URL pretendida: pending coalescido tem prioridade sobre o swap em curso.
                return pendingSwapUrl || currentUrl;
            },
            isTransitioning() {
                return isSwappingAudio;
            },
            getCurrentTime() {
                return audio ? audio.currentTime : 0;
            },
            async toggle() {
                const el = ensure();
                if (!el) return false;
                if (!el.paused) {
                    MaryAudioTrace.log('pause-call', {
                        el: el,
                        ctrlId: ctrlTraceId,
                        note: 'toggle:pause'
                    });
                    el.pause();
                    return true;
                }
                try {
                    const dur = effectiveDuration(el);
                    if (dur && el.currentTime >= dur - 0.5) {
                        el.currentTime = 0;
                    }
                    if (el.readyState < 3) {
                        requestBufferingShow();
                    }
                    const playPromise = el.play();
                    MaryAudioTrace.trackPlay(el, playPromise, 'toggle', { ctrlId: ctrlTraceId });
                    await playPromise;
                    return true;
                } catch (err) {
                    if (err && err.name === 'AbortError') {
                        return true;
                    }
                    console.error('Audio play error:', err);
                    if (err && err.name === 'NotAllowedError') {
                        requestBufferingHide();
                        setChrome(false, true);
                        emitProgress();
                        return 'blocked';
                    }
                    cleanup();
                    return false;
                }
            },
            seekRatio(ratio) {
                const el = ensure();
                if (!el) return false;
                const dur = effectiveDuration(el);
                if (!(dur > 0)) return false;
                const r = Math.max(0, Math.min(1, Number(ratio) || 0));
                const next = Math.max(0, Math.min(dur, dur * r));
                try {
                    el.currentTime = next;
                    emitProgress();
                    return true;
                } catch (_) {
                    return false;
                }
            },
            seek(seconds) {
                const el = ensure();
                if (!el) return false;
                const dur = effectiveDuration(el);
                const next = Math.max(0, Number(seconds) || 0);
                const clamped = dur > 0 ? Math.min(dur, next) : next;
                try {
                    el.currentTime = clamped;
                    emitProgress();
                    return true;
                } catch (_) {
                    return false;
                }
            },
            preload() {
                ensure();
            },
            stop: cleanup,
            isPlaying: isPlayingNow,
            getDuration: () => effectiveDuration(audio),
            seekBy(delta) {
                const el = ensure();
                if (!el) return false;
                const dur = effectiveDuration(el);
                try {
                    const next = Math.max(
                        0,
                        Math.min(dur > 0 ? dur : Number.POSITIVE_INFINITY, el.currentTime + Number(delta))
                    );
                    el.currentTime = next;
                    emitProgress();
                    return true;
                } catch (_) {
                    return false;
                }
            },
            setPlaybackRate(rate) {
                const el = ensure();
                if (!el) return;
                try {
                    el.playbackRate = Number(rate) || 1;
                } catch (_) { }
            },
            setVolume(vol) {
                const el = ensure();
                if (el) el.volume = Math.max(0, Math.min(1, vol));
            },
            getVolume() {
                return audio ? audio.volume : 1;
            }
        };
    }

    // ── Estado de navegação do MediaSession (fonte única) ───────────────
    const __maryNav = {
        currentSlug: null,
        currentArt: null,
        nextArt: null,
        prevArt: null,
        advance: null
    };

    /** Slug da faixa efetivamente em reprodução (sobrevive a rebind DOM atrasado em BG). */
    function getPlayingSlug(fallbackSlug) {
        if (__maryNav.currentSlug) return String(__maryNav.currentSlug);
        try {
            const mp = window.Mary && window.Mary.active && window.Mary.active.player;
            const fromDom = mp && mp.el ? mp.el.dataset.maryCurrentArticle : '';
            if (fromDom) return String(fromDom);
        } catch (_) { /* ignore */ }
        return fallbackSlug ? String(fallbackSlug) : '';
    }

    /**
     * Atualiza player in-page + MediaSession para a faixa tocando.
     * Usado no advance seamless (rebind DOM pode não rodar em BG).
     */
    function applyPlayingArticleChrome(art) {
        if (!art || !art.slug) return;
        // Não sobrescrever "Anúncio" no meio do ad break.
        if (isAdBreakActive()) return;
        __maryNav.currentSlug = art.slug;
        __maryNav.currentArt = art;
        setMediaSessionMetadata(art);

        const mp = window.Mary && window.Mary.active && window.Mary.active.player;
        if (!mp || !mp.el) return;

        mp.el.classList.remove('has-started');
        mp.el.dataset.maryCurrentArticle = art.slug;
        delete mp.el.dataset.userInteracted;

        if (mp.title) mp.title.textContent = art.title || 'Qualquer Tecla';
        if (mp.author) {
            mp.author.textContent = (art.authors && art.authors.name) || 'Equipe Qualquer Tecla';
        }

        const rawThumb = art.featured_image || art.thumbnail || 'assets/img/placeholder-article.svg';
        const src = window.MockData && typeof window.MockData.assetPath === 'function'
            ? window.MockData.assetPath(rawThumb)
            : rawThumb;
        if (mp.cover) mp.cover.src = src;
        if (mp.ambientBg) mp.ambientBg.style.backgroundImage = `url(${src})`;

        if (mp.nextBtn) mp.nextBtn.disabled = !__maryNav.nextArt;
        if (mp.prevBtn) mp.prevBtn.disabled = !__maryNav.prevArt;

        requestAnimationFrame(() => {
            observeMarqueeTitles(mp);
        });

        if (window.FavoritesStore && mp.favBtn && mp.favIcon && mp.favCount) {
            mp.favIcon.classList.remove('ph-fill');
            mp.favIcon.classList.add('ph');
            mp.favIcon.style.color = '';
            mp.favCount.textContent = '—';
            mp.favBtn.setAttribute('aria-pressed', 'false');
            window.FavoritesStore.getState(art.slug).then((state) => {
                if (getPlayingSlug('') !== art.slug) return;
                if (state.isFavorited) {
                    mp.favIcon.classList.remove('ph');
                    mp.favIcon.classList.add('ph-fill');
                    mp.favIcon.style.color = 'var(--qualquer-tecla-gold)';
                    mp.favBtn.setAttribute('aria-pressed', 'true');
                } else {
                    mp.favIcon.classList.remove('ph-fill');
                    mp.favIcon.classList.add('ph');
                    mp.favIcon.style.color = '';
                    mp.favBtn.setAttribute('aria-pressed', 'false');
                }
                mp.favCount.textContent = state.total;
            }).catch(() => {
                if (getPlayingSlug('') !== art.slug) return;
                mp.favCount.textContent = '-';
            });
        }

        MaryAudioTrace.log('applyPlayingArticleChrome', {
            note: 'chrome+mediasession',
            extra: {
                slug: art.slug,
                title: art.title || null
            }
        });
    }

    let articleListPromise = null;
    let activeBindCleanup = null;
    let playerUiInterval = null;
    let handlingEnded = false;
    let autoplayHandled = false;
    let outsideClickBound = false;
    let marqueeObserver = null;

    // Auto-next "próximo episódio": sessão isolada (não é generation global do áudio).
    let autoNextGen = 0;
    global.__maryTraceAutoNextGen = autoNextGen;
    let autoNextTimer = null;
    let autoNextSession = null;

    function bumpAutoNextGen() {
        autoNextGen += 1;
        global.__maryTraceAutoNextGen = autoNextGen;
        return autoNextGen;
    }

    const AD_BREAK_SEC = 8;
    const AD_BREAK_MS = AD_BREAK_SEC * 1000;
    const AD_BREAK_SRC = 'assets/audio/qt-ad-break.wav';
    let adAudio = null;
    let adBreakChromeBackup = null;

    function stopAdAudio() {
        if (!adAudio) return;
        MaryAudioTrace.log('stopAdAudio', {
            el: adAudio,
            note: 'stopAdAudio'
        });
        try {
            adAudio.loop = false;
            MaryAudioTrace.log('pause-call', { el: adAudio, note: 'stopAdAudio' });
            adAudio.pause();
            adAudio.currentTime = 0;
        } catch (_) {
            /* ignore */
        }
    }

    /**
     * Mantém o ad audível durante o handoff swap→próxima faixa (só BG).
     * Não cria/inicia ad do zero — advance manual sem ad break gerava ~1s de anúncio.
     */
    function ensureAdHandoffWarm() {
        if (!adAudio) return;
        if (document.visibilityState === 'visible') {
            // Em foreground o swap não precisa do ad como aquecedor.
            return;
        }
        try {
            if (!adAudio.paused && !adAudio.ended) {
                adAudio.loop = true;
            } else {
                adAudio.loop = true;
                try { adAudio.currentTime = 0; } catch (_) { /* ignore */ }
                const playPromise = adAudio.play();
                MaryAudioTrace.trackPlay(adAudio, playPromise, 'ensureAdHandoffWarm');
                if (playPromise && typeof playPromise.catch === 'function') {
                    playPromise.catch(() => { /* ignore */ });
                }
            }
            MaryAudioTrace.log('ensureAdHandoffWarm', {
                el: adAudio,
                note: 'ad-loop-until-article-playing',
                extra: {
                    paused: adAudio.paused,
                    ended: adAudio.ended,
                    loop: adAudio.loop,
                    currentTime: adAudio.currentTime
                }
            });
        } catch (_) {
            /* ignore */
        }
    }

    function setMediaSessionAdBreak(remainingSec) {
        if (!('mediaSession' in navigator)) return;
        const timeStr = formatAdCountdown(remainingSec);
        const artSrc = resolveAbsoluteUrl('assets/img/brand/qt-android-chrome-512x512.png');
        try {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: 'Anúncio',
                artist: timeStr + ' · Qualquer Tecla',
                album: 'Qualquer Tecla',
                artwork: [{ src: artSrc, sizes: '512x512', type: 'image/png' }]
            });
            navigator.mediaSession.playbackState = 'playing';
        } catch (e) {
            console.warn('Erro ao definir metadados do anúncio no MediaSession:', e);
        }
    }

    /**
     * Avanço com ad break completo (manual / MediaSession next).
     * __maryNav.advance permanece o swap imediato (pós-ad).
     */
    function requestAdvanceWithAd(targetArt) {
        if (!targetArt) return;
        if (isAdBreakActive()) {
            // Já em anúncio: segundo next = pular o ad e avançar.
            clearAutoNext();
            if (typeof __maryNav.advance === 'function') {
                __maryNav.advance(targetArt);
            }
            return;
        }
        if (isAutoNextActive()) {
            clearAutoNext();
        }
        startAutoNext(
            targetArt,
            getPlayingSlug(''),
            'ad',
            (art) => {
                if (typeof __maryNav.advance === 'function') {
                    __maryNav.advance(art);
                }
            },
            () => false
        );
    }

    function playAdAudio() {
        if (!adAudio) {
            adAudio = new Audio(resolveAbsoluteUrl(AD_BREAK_SRC));
            adAudio.preload = 'auto';
            MaryAudioTrace.noteEl(adAudio, 'ad');
            MaryAudioTrace.watchMedia(adAudio, 'ad');
            MaryAudioTrace.log('create-audio', {
                el: adAudio,
                note: 'playAdAudio:create',
                src: 'assets/audio/qt-ad-break.wav'
            });
        }
        try {
            // Sem loop na contagem do ad; o loop liga só no handoff (finishAdBreak/swap).
            adAudio.loop = false;
            MaryAudioTrace.log('pause-call', { el: adAudio, note: 'playAdAudio:reset' });
            adAudio.pause();
            adAudio.currentTime = 0;
            const playPromise = adAudio.play();
            MaryAudioTrace.trackPlay(adAudio, playPromise, 'playAdAudio');
            if (playPromise && typeof playPromise.catch === 'function') {
                playPromise.catch(() => {
                    /* ignore autoplay / abort */
                });
            }
        } catch (_) {
            /* ignore */
        }
    }

    function formatAdCountdown(sec) {
        const s = Math.max(0, Math.floor(Number(sec) || 0));
        return '0:' + (s < 10 ? '0' : '') + s;
    }

    function backupAdBreakChrome() {
        const mp = window.Mary && window.Mary.active && window.Mary.active.player;
        if (!mp || !mp.el) {
            adBreakChromeBackup = null;
            return;
        }
        adBreakChromeBackup = {
            title: mp.title ? String(mp.title.textContent || '') : '',
            author: mp.author ? String(mp.author.textContent || '') : '',
            timeCurrent: mp.timeCurrent ? String(mp.timeCurrent.textContent || '') : '',
            timeRemaining: mp.timeRemaining ? String(mp.timeRemaining.textContent || '') : ''
        };
    }

    function restoreAdBreakChrome() {
        if (!adBreakChromeBackup) return;
        const mp = window.Mary && window.Mary.active && window.Mary.active.player;
        const backup = adBreakChromeBackup;
        adBreakChromeBackup = null;
        if (!mp || !mp.el) return;
        if (mp.title) mp.title.textContent = backup.title;
        if (mp.author) mp.author.textContent = backup.author;
        if (mp.timeCurrent) mp.timeCurrent.textContent = backup.timeCurrent;
        if (mp.timeRemaining) mp.timeRemaining.textContent = backup.timeRemaining;
    }

    function updateAdBreakCountdown(remainingSec) {
        const label = 'Anúncio';
        const timeStr = formatAdCountdown(remainingSec);
        const mp = window.Mary && window.Mary.active && window.Mary.active.player;
        if (mp) {
            if (mp.title) mp.title.textContent = label;
            if (mp.author) mp.author.textContent = timeStr + ' · Qualquer Tecla';
            if (mp.timeCurrent) mp.timeCurrent.textContent = timeStr;
            if (mp.timeRemaining) mp.timeRemaining.textContent = label;
            // Capa do anúncio: marca (não a do artigo).
            const adCover = resolveAbsoluteUrl('assets/img/brand/qt-android-chrome-512x512.png');
            if (mp.cover) mp.cover.src = adCover;
            if (mp.ambientBg) mp.ambientBg.style.backgroundImage = `url(${adCover})`;
        }
        setMediaSessionAdBreak(remainingSec);
        getPlayButtons().forEach((btn) => {
            let count = btn.querySelector('.mary-auto-next-count');
            if (!count) {
                btn.insertAdjacentHTML(
                    'beforeend',
                    '<span class="mary-auto-next-count" aria-hidden="true">' +
                        '<span class="mary-auto-next-count__label"></span>' +
                        '<span class="mary-auto-next-count__time"></span>' +
                    '</span>'
                );
                count = btn.querySelector('.mary-auto-next-count');
            }
            if (!count) return;
            const labelEl = count.querySelector('.mary-auto-next-count__label');
            const timeEl = count.querySelector('.mary-auto-next-count__time');
            if (labelEl) labelEl.textContent = label;
            if (timeEl) timeEl.textContent = timeStr;
            btn.setAttribute('aria-label', 'Anúncio em reprodução — clique para cancelar');
        });
    }

    const PLAY_RING_HTML =
        '<svg class="mary-auto-next-ring" viewBox="0 0 44 44" width="44" height="44" aria-hidden="true" focusable="false">' +
        '<circle class="mary-auto-next-ring__track" cx="22" cy="22" r="20.75" fill="none" />' +
        '<circle class="mary-auto-next-ring__prog" cx="22" cy="22" r="20.75" fill="none" pathLength="100" />' +
        '</svg>';

    /** Mini + expanded play buttons that share visual ring states. */
    function getPlayButtons() {
        return [
            document.getElementById('mary-player-play-mini'),
            document.getElementById('mary-player-play-expanded')
        ].filter(Boolean);
    }

    /**
     * Marca o player como sem áudio utilizável (não confundir com loading).
     * Desabilita só controles de reprodução; expand/fav/share/nav permanecem.
     */
    function setMaryPlaybackUnavailable(unavailable) {
        const mp =
            window.Mary && window.Mary.active && window.Mary.active.player
                ? window.Mary.active.player
                : null;
        const playerEl =
            (mp && mp.el) || document.getElementById('mary-audio-player');
        if (playerEl) {
            playerEl.classList.toggle('is-unavailable', !!unavailable);
        }

        getPlayButtons().forEach((btn) => {
            btn.disabled = !!unavailable;
            if (unavailable) {
                btn.setAttribute('aria-disabled', 'true');
            } else {
                btn.removeAttribute('aria-disabled');
            }
        });

        if (!mp) return;

        if (mp.seekBackBtn) {
            mp.seekBackBtn.disabled = !!unavailable;
            if (unavailable) mp.seekBackBtn.setAttribute('aria-disabled', 'true');
            else mp.seekBackBtn.removeAttribute('aria-disabled');
        }
        if (mp.seekForwardBtn) {
            mp.seekForwardBtn.disabled = !!unavailable;
            if (unavailable) mp.seekForwardBtn.setAttribute('aria-disabled', 'true');
            else mp.seekForwardBtn.removeAttribute('aria-disabled');
        }
        if (mp.speedControl) {
            mp.speedControl.disabled = !!unavailable;
            if (unavailable) {
                mp.speedControl.setAttribute('aria-disabled', 'true');
                mp.speedControl.removeAttribute('data-bs-toggle');
            } else {
                mp.speedControl.removeAttribute('aria-disabled');
                mp.speedControl.setAttribute('data-bs-toggle', 'dropdown');
            }
        }
    }

    /** Update play/pause glyph without wiping the ring SVG. */
    function setPlayBtnIcon(btn, iconClass) {
        if (!btn) return;
        let icon = btn.querySelector('i');
        if (!icon) {
            btn.insertAdjacentHTML('afterbegin', '<i class="' + iconClass + '"></i>');
            return;
        }
        icon.className = iconClass;
    }

    /** Structural only: ensure SVG ring exists. Does not set state classes. */
    function ensurePlayRing(btn) {
        if (!btn) return null;
        let ring = btn.querySelector('.mary-auto-next-ring');
        if (ring) return ring;
        let icon = btn.querySelector('i');
        if (!icon) {
            btn.insertAdjacentHTML('afterbegin', '<i class="ph-fill ph-play-circle"></i>');
            icon = btn.querySelector('i');
        }
        if (icon && icon.insertAdjacentHTML) {
            icon.insertAdjacentHTML('afterend', PLAY_RING_HTML);
        } else {
            btn.insertAdjacentHTML('beforeend', PLAY_RING_HTML);
        }
        return btn.querySelector('.mary-auto-next-ring');
    }

    /** Remove ring only when neither auto-next nor loading is active. */
    function removePlayRingIfIdle(btn) {
        if (!btn) return;
        if (
            btn.classList.contains('is-auto-next') ||
            btn.classList.contains('is-ad-break') ||
            btn.classList.contains('is-audio-loading')
        ) {
            return;
        }
        const ring = btn.querySelector('.mary-auto-next-ring');
        if (ring) ring.remove();
    }

    function clearPlayBtnLoadingUi() {
        const player = document.getElementById('mary-audio-player');
        getPlayButtons().forEach((btn) => {
            btn.classList.remove('is-audio-loading');
            btn.removeAttribute('aria-busy');
            removePlayRingIfIdle(btn);
        });
        if (player) player.classList.remove('is-audio-loading');
    }

    function isAutoNextActive() {
        return Boolean(autoNextSession);
    }

    function isAdBreakActive() {
        return Boolean(autoNextSession && autoNextSession.mode === 'ad');
    }

    function restoreAutoNextUi() {
        const player = document.getElementById('mary-audio-player');
        getPlayButtons().forEach((btn) => {
            btn.classList.remove('is-auto-next');
            btn.classList.remove('is-ad-break');
            btn.style.removeProperty('--mary-auto-next-drain-duration');
            btn.querySelectorAll('.mary-auto-next-count').forEach((el) => el.remove());
            if (!btn.querySelector('i')) {
                btn.insertAdjacentHTML('afterbegin', '<i class="ph-fill ph-play-circle"></i>');
            }
            removePlayRingIfIdle(btn);
            if (
                !btn.getAttribute('aria-label') ||
                /próximo artigo|anúncio/i.test(btn.getAttribute('aria-label') || '')
            ) {
                btn.setAttribute('aria-label', 'Reproduzir');
            }
        });
        if (player) {
            player.classList.remove('is-auto-next');
            player.classList.remove('is-ad-break');
            player.style.removeProperty('--mary-auto-next-drain-duration');
        }
        restoreAdBreakChrome();
    }

    /**
     * @param {{ keepAdAudio?: boolean }} [opts] — keepAdAudio: preserva ad durante handoff swapAndPlay
     */
    function clearAutoNext(opts) {
        bumpAutoNextGen();
        MaryAudioTrace.log('clearAutoNext', {
            note: 'clearAutoNext',
            extra: { keepAdAudio: !!(opts && opts.keepAdAudio) }
        });
        if (autoNextTimer) {
            clearInterval(autoNextTimer);
            autoNextTimer = null;
        }
        // Em handoff seamless, o ad permanece até playing/play resolve da próxima faixa.
        if (!(opts && opts.keepAdAudio)) {
            stopAdAudio();
        }
        autoNextSession = null;
        restoreAutoNextUi();
    }

    /**
     * @param {number} [drainSec] — duração visual do anel; omitir = default CSS (5s)
     * @param {{ adBreak?: boolean, remainingSec?: number }} [opts]
     */
    function renderAutoNextUi(drainSec, opts) {
        const player = document.getElementById('mary-audio-player');
        const buttons = getPlayButtons();
        if (!buttons.length) return;
        const isAd = Boolean(opts && opts.adBreak);
        const drainValue = Number.isFinite(drainSec) && drainSec > 0 ? drainSec + 's' : '';
        if (player) {
            player.classList.add('is-auto-next');
            player.classList.toggle('is-ad-break', isAd);
            if (drainValue) player.style.setProperty('--mary-auto-next-drain-duration', drainValue);
            else player.style.removeProperty('--mary-auto-next-drain-duration');
        }
        buttons.forEach((btn) => {
            if (drainValue) btn.style.setProperty('--mary-auto-next-drain-duration', drainValue);
            else btn.style.removeProperty('--mary-auto-next-drain-duration');
            btn.classList.toggle('is-ad-break', isAd);
            if (!btn.classList.contains('is-auto-next')) {
                btn.classList.add('is-auto-next');
                if (!btn.querySelector('i')) {
                    btn.insertAdjacentHTML('afterbegin', '<i class="ph-fill ph-play-circle"></i>');
                }
                btn.querySelectorAll('.mary-auto-next-count').forEach((el) => el.remove());
                ensurePlayRing(btn);
            } else {
                ensurePlayRing(btn);
            }
            if (isAd) {
                btn.setAttribute('aria-label', 'Anúncio em reprodução — clique para cancelar');
            } else {
                btn.setAttribute('aria-label', 'Próximo artigo em breve — clique para cancelar');
            }
        });
        if (isAd) {
            const remaining = Number.isFinite(opts.remainingSec) ? opts.remainingSec : AD_BREAK_SEC;
            updateAdBreakCountdown(remaining);
        }
    }

    /**
     * Finaliza o ad break com uma única fonte de verdade (timer JS).
     * Invalida a sessão antes de avançar para impedir callbacks obsoletos.
     * Mantém adAudio tocando durante o handoff — stop só em playing/play resolve.
     */
    function finishAdBreak(myGen, advanceFn) {
        if (autoNextGen !== myGen) return;
        if (!autoNextSession || autoNextSession.gen !== myGen || autoNextSession.mode !== 'ad') return;

        const art = autoNextSession.nextArt;
        if (autoNextTimer) {
            clearInterval(autoNextTimer);
            autoNextTimer = null;
        }
        autoNextSession = null;
        bumpAutoNextGen();
        // Ad wav ~8s acaba no mesmo instante do swap; sem loop a sessão BG esfria.
        ensureAdHandoffWarm();
        MaryAudioTrace.log('finishAdBreak', {
            note: 'finishAdBreak',
            extra: {
                myGen: myGen,
                nextSlug: art && art.slug ? art.slug : null,
                keepAdPlaying: !!(adAudio && !adAudio.paused),
                adLoop: !!(adAudio && adAudio.loop)
            }
        });
        restoreAutoNextUi();
        if (typeof advanceFn === 'function' && art) {
            advanceFn(art);
        }
    }

    /**
     * @param {object} nextArt
     * @param {string} sourceSlug
     * @param {'early'|'ended-fallback'|'ad'} mode
     * @param {(art: object) => void} [advanceFn] — obrigatório em ended-fallback e ad
     * @param {() => boolean} [getIsDead] — consulta dead atual no tick do timer
     */
    function startAutoNext(nextArt, sourceSlug, mode, advanceFn, getIsDead) {
        if (!nextArt) return;
        if (isAutoNextActive()) return;

        if (autoNextTimer) {
            clearInterval(autoNextTimer);
            autoNextTimer = null;
        }
        const myGen = bumpAutoNextGen();
        const slug = String(sourceSlug || '');
        let resolvedMode = 'early';
        if (mode === 'ad') resolvedMode = 'ad';
        else if (mode === 'ended-fallback') resolvedMode = 'ended-fallback';

        const isTimed = resolvedMode === 'ad' || resolvedMode === 'ended-fallback';
        const remainingSec = resolvedMode === 'ad'
            ? AD_BREAK_SEC
            : (resolvedMode === 'ended-fallback' ? 5 : undefined);

        autoNextSession = {
            gen: myGen,
            mode: resolvedMode,
            nextArt,
            sourceSlug: slug,
            remaining: remainingSec,
            startedAt: resolvedMode === 'ad' ? performance.now() : undefined
        };

        MaryAudioTrace.log('startAutoNext', {
            note: 'startAutoNext',
            extra: {
                mode: resolvedMode,
                myGen: myGen,
                sourceSlug: slug,
                nextSlug: nextArt && nextArt.slug ? nextArt.slug : null
            }
        });

        if (resolvedMode === 'ad') {
            backupAdBreakChrome();
            renderAutoNextUi(AD_BREAK_SEC, { adBreak: true, remainingSec: AD_BREAK_SEC });
            updateAdBreakCountdown(AD_BREAK_SEC);
            playAdAudio();
        } else {
            renderAutoNextUi();
        }

        if (!isTimed) return;
        if (typeof advanceFn !== 'function') return;

        if (resolvedMode === 'ad') {
            // Avança quando o wav do ad termina (áudio separado completo).
            // Fallback de segurança se 'ended' não disparar.
            let adFinishArmed = false;
            const tryFinishAd = () => {
                if (adFinishArmed) return;
                if (autoNextGen !== myGen) return;
                if (!autoNextSession || autoNextSession.gen !== myGen || autoNextSession.mode !== 'ad') return;
                adFinishArmed = true;
                if (adAudio) {
                    try { adAudio.removeEventListener('ended', onAdEndedNatural); } catch (_) { /* ignore */ }
                }
                const currentSlug = getPlayingSlug('');
                if (slug && currentSlug && currentSlug !== slug) {
                    clearAutoNext();
                    return;
                }
                finishAdBreak(myGen, advanceFn);
            };
            const onAdEndedNatural = () => {
                MaryAudioTrace.log('ad-ended-natural', {
                    el: adAudio,
                    note: 'ad-break-complete'
                });
                tryFinishAd();
            };
            if (adAudio) {
                adAudio.loop = false;
                adAudio.addEventListener('ended', onAdEndedNatural);
            }

            autoNextTimer = setInterval(() => {
                if (autoNextGen !== myGen) return;
                if (!autoNextSession || autoNextSession.gen !== myGen || autoNextSession.mode !== 'ad') return;
                if (typeof getIsDead === 'function' && getIsDead()) {
                    clearAutoNext();
                    return;
                }

                const startedAt = autoNextSession.startedAt || performance.now();
                const elapsed = performance.now() - startedAt;
                const adDurMs = (adAudio && Number.isFinite(adAudio.duration) && adAudio.duration > 0)
                    ? (adAudio.duration * 1000)
                    : AD_BREAK_MS;
                const totalMs = Math.max(AD_BREAK_MS, adDurMs);

                const remainingMs = Math.max(0, totalMs - elapsed);
                const remainingDisplay = Math.max(0, Math.ceil(remainingMs / 1000));
                if (autoNextSession.remaining !== remainingDisplay) {
                    autoNextSession.remaining = remainingDisplay;
                    updateAdBreakCountdown(remainingDisplay || 0);
                }

                // Fallback: wav deveria ter disparado 'ended'; margem de 1.5s.
                if (elapsed >= totalMs + 1500) {
                    tryFinishAd();
                }
            }, 100);
            return;
        }

        // ended-fallback: countdown legado de 5s (sem áudio de anúncio).
        autoNextTimer = setInterval(() => {
            if (autoNextGen !== myGen) return;
            if (!autoNextSession || autoNextSession.gen !== myGen) return;
            if (typeof getIsDead === 'function' && getIsDead()) {
                clearAutoNext();
                return;
            }

            autoNextSession.remaining -= 1;
            if (autoNextSession.remaining > 0) {
                return;
            }

            if (autoNextGen !== myGen) return;
            if (!autoNextSession || autoNextSession.gen !== myGen) return;
            if (typeof getIsDead === 'function' && getIsDead()) {
                clearAutoNext();
                return;
            }
            const currentSlug = getPlayingSlug('');
            if (slug && currentSlug && currentSlug !== slug) {
                clearAutoNext();
                return;
            }

            const art = autoNextSession.nextArt;
            clearInterval(autoNextTimer);
            autoNextTimer = null;
            autoNextSession = null;
            bumpAutoNextGen();
            restoreAutoNextUi();
            advanceFn(art);
        }, 1000);
    }

    function loadArticleList() {
        if (!window.API || typeof window.API.getAllArticles !== 'function') {
            return Promise.resolve([]);
        }
        if (!articleListPromise) {
            articleListPromise = window.API.getAllArticles()
                .then((list) => list || [])
                .catch(() => []);
        }
        return articleListPromise;
    }

    function neighborsFor(list, slug) {
        const idx = (list || []).findIndex((a) => a && a.slug === slug);
        if (idx < 0) return { nextArt: null, prevArt: null };
        return {
            nextArt: idx < list.length - 1 ? list[idx + 1] : null,
            prevArt: idx > 0 ? list[idx - 1] : null
        };
    }

    function applyNavNeighbors(slug) {
        return loadArticleList().then((list) => {
            const neighbors = neighborsFor(list, slug);
            __maryNav.nextArt = neighbors.nextArt;
            __maryNav.prevArt = neighbors.prevArt;
            return neighbors;
        });
    }

    function ensureMarqueeObserver() {
        if (marqueeObserver || typeof ResizeObserver !== 'function') return marqueeObserver;
        marqueeObserver = new ResizeObserver((entries) => {
            entries.forEach((entry) => {
                const parent = entry.target;
                const tEl = parent.querySelector('.mary-player-mini__title, .mary-player-expanded__title');
                if (!tEl) return;
                if (tEl.__maryMarqueeFrame) return;

                tEl.__maryMarqueeFrame = requestAnimationFrame(() => {
                    tEl.__maryMarqueeFrame = 0;

                    const hadMarquee = tEl.classList.contains('is-marquee');
                    if (hadMarquee) {
                        tEl.classList.remove('is-marquee');
                        parent.classList.remove('has-marquee');
                    }

                    const scrollW = tEl.scrollWidth;
                    const clientW = tEl.clientWidth;
                    const shouldMarquee = scrollW > clientW && clientW > 0;

                    if (shouldMarquee === hadMarquee) {
                        if (hadMarquee) {
                            tEl.classList.add('is-marquee');
                            parent.classList.add('has-marquee');
                        }
                        return;
                    }

                    if (shouldMarquee) {
                        tEl.classList.add('is-marquee');
                        parent.classList.add('has-marquee');
                        tEl.style.setProperty('--marquee-dist', '-' + (scrollW - clientW + 32) + 'px');
                    } else {
                        tEl.style.removeProperty('--marquee-dist');
                    }
                });
            });
        });
        return marqueeObserver;
    }

    function observeMarqueeTitles(mp) {
        const observer = ensureMarqueeObserver();
        if (!observer || !mp) return;
        try {
            observer.disconnect();
        } catch (_) {
            /* ignore */
        }
        const titles = [];
        if (mp.miniEl) titles.push(mp.miniEl.querySelector('#mary-player-title-mini'));
        if (mp.expandedEl) titles.push(mp.expandedEl.querySelector('#mary-player-title-expanded'));
        titles.forEach((titleEl) => {
            if (titleEl && titleEl.parentElement) {
                observer.observe(titleEl.parentElement);
            }
        });
    }

    function ensureOutsideClickListener() {
        if (outsideClickBound) return;
        outsideClickBound = true;
        document.addEventListener('click', (e) => {
            const activeMp = window.Mary && window.Mary.active && window.Mary.active.player;
            if (!activeMp || !activeMp.el) return;
            if (!activeMp.el.classList.contains('is-expanded')) return;
            if (activeMp.el.contains(e.target)) return;
            activeMp.el.classList.remove('is-expanded');
            document.body.classList.remove('mary-is-expanded');
        });
    }

    function clearPlayerUiInterval() {
        if (playerUiInterval) {
            clearInterval(playerUiInterval);
            playerUiInterval = null;
        }
    }

    const registerMediaSessionHandlers = () => {
        if (!('mediaSession' in navigator)) return;
        try {
            navigator.mediaSession.setActionHandler('play', () => {
                const ctrl = window.__maryActiveFileController;
                if (ctrl) ctrl.toggle();
            });
            navigator.mediaSession.setActionHandler('pause', () => {
                const ctrl = window.__maryActiveFileController;
                if (ctrl) ctrl.toggle();
            });
            navigator.mediaSession.setActionHandler('nexttrack', () => {
                if (__maryNav.nextArt) {
                    requestAdvanceWithAd(__maryNav.nextArt);
                }
            });
            navigator.mediaSession.setActionHandler('previoustrack', () => {
                if (__maryNav.prevArt && typeof __maryNav.advance === 'function') {
                    __maryNav.advance(__maryNav.prevArt);
                } else {
                    const ctrl = window.__maryActiveFileController;
                    if (ctrl && typeof ctrl.seekRatio === 'function') {
                        ctrl.seekRatio(0);
                    }
                }
            });
            try {
                navigator.mediaSession.setActionHandler('seekbackward', null);
                navigator.mediaSession.setActionHandler('seekforward', null);
            } catch (_) { }
        } catch (_) { }
    };

    registerMediaSessionHandlers();

    /**
     * @param {HTMLButtonElement} button
     * @param {object} article
     */
    function bind(button, article) {
        if (!button || !article) return null;

        if (typeof activeBindCleanup === 'function') {
            activeBindCleanup();
        }

        let dead = false;
        let autoNextDismissed = false;
        let hadFiniteDuration = false;
        // Faixa deste bind; advance seamless atualiza currentSlug/currentArt mesmo sem rebind.
        __maryNav.currentSlug = article.slug;
        __maryNav.currentArt = article;
        const highlighter = createHighlighter();

        const setPlayBtnLoading = (on) => {
            if (dead) return;
            const buttons = getPlayButtons();
            const player = document.getElementById('mary-audio-player');
            if (!buttons.length) return;

            if (on) {
                // Prioridade visual: auto-next / ad-break > loading
                if (
                    isAutoNextActive() ||
                    buttons.some((b) => b.classList.contains('is-auto-next') || b.classList.contains('is-ad-break'))
                ) {
                    return;
                }
                buttons.forEach((btn) => {
                    btn.classList.add('is-audio-loading');
                    ensurePlayRing(btn);
                    btn.setAttribute('aria-busy', 'true');
                });
                if (player) player.classList.add('is-audio-loading');
                return;
            }

            buttons.forEach((btn) => {
                btn.classList.remove('is-audio-loading');
                btn.removeAttribute('aria-busy');
                removePlayRingIfIdle(btn);
            });
            if (player) player.classList.remove('is-audio-loading');
        };

        const onBuffering = (isBuffering) => {
            setPlayBtnLoading(Boolean(isBuffering));
        };

        activeBindCleanup = () => {
            dead = true;
            clearAutoNext();
            clearPlayBtnLoadingUi();
            clearPlayerUiInterval();
            highlighter.reset();
            document.body.classList.remove('mary-is-expanded');
            document.body.classList.remove('mary-is-dragging');
        };

        const audioUrl = String(article.audio_full_url || '').trim();
        const canFile = Boolean(audioUrl);

        // Adoção do controller: URL pretendida (pending||current) OU transição em curso.
        const activeCtrl = window.__maryActiveFileController;
        const sameUrl = Boolean(
            activeCtrl &&
            typeof activeCtrl.getUrl === 'function' &&
            audioUrl &&
            resolveAbsoluteUrl(activeCtrl.getUrl() || '') === resolveAbsoluteUrl(audioUrl)
        );
        const adoptTransitioning = Boolean(
            activeCtrl &&
            !sameUrl &&
            typeof activeCtrl.isTransitioning === 'function' &&
            activeCtrl.isTransitioning()
        );
        const adopt = sameUrl || adoptTransitioning;

        let controller = null;
        let isDraggingProgress = false;

        const updateTimeUI = (cur, dur) => {
            const mp = window.Mary && window.Mary.active && window.Mary.active.player;
            if (!mp) return;
            const rem = Math.max(0, dur - cur);
            const currentStr = formatTime(cur);
            const remainStr = '-' + formatTime(rem);
            if (mp.timeCurrent) mp.timeCurrent.textContent = currentStr;
            if (mp.timeRemaining) mp.timeRemaining.textContent = remainStr;
        };

        const updateProgressUI = (ratio) => {
            const mp = window.Mary && window.Mary.active && window.Mary.active.player;
            if (!mp || !mp.progressFill) return;
            mp.progressFill.style.width = (ratio * 100) + '%';
        };

        const onProgress = (data) => {
            if (dead || !data) return;
            if (isDraggingProgress) return;

            const cur = Number(data.current) || 0;
            const durRaw = Number(data.duration);
            const dur = Number.isFinite(durRaw) ? durRaw : 0;
            const ratio = dur > 0 ? (cur / dur) : 0;

            if (highlighter && typeof highlighter.highlight === 'function') {
                highlighter.highlight(ratio);
            }

            updateTimeUI(cur, dur);
            updateProgressUI(ratio);

            // Auto-next antecipado: faltam <= 5s (só com duration finita).
            if (
                !autoNextDismissed &&
                !isAutoNextActive() &&
                __maryNav.nextArt &&
                Number.isFinite(durRaw) &&
                durRaw > 0 &&
                cur >= durRaw - 5
            ) {
                hadFiniteDuration = true;
                startAutoNext(__maryNav.nextArt, getPlayingSlug(article.slug), 'early');
            } else if (Number.isFinite(durRaw) && durRaw > 0) {
                hadFiniteDuration = true;
            }
        };

        const updateMaryPlayerState = (speaking, paused) => {
            if (dead) return;
            if (!window.Mary || !window.Mary.active) return;
            const mp = window.Mary.active.player;
            if (!mp || !mp.el) return;

            // Bind obsoleto após advance seamless: não reverter capa/título/MediaSession.
            const playingSlug = getPlayingSlug(article.slug);
            const bindOwnsChrome = !playingSlug || playingSlug === article.slug;

            if (bindOwnsChrome && mp.el.dataset.maryCurrentArticle !== article.slug) {
                applyPlayingArticleChrome(article);
            }

            const isActuallyPaused = paused || !speaking;

            if (speaking) {
                mp.el.classList.add('has-started');
            }

            const syncPlayIcon = (isPaused) => {
                const iconClass = isPaused ? 'ph-fill ph-play-circle' : 'ph-fill ph-pause-circle';
                const label = isPaused ? 'Reproduzir' : 'Pausar';
                const autoNext = isAutoNextActive();
                const adBreak = isAdBreakActive();
                getPlayButtons().forEach((btn) => {
                    setPlayBtnIcon(btn, iconClass);
                    if (adBreak || btn.classList.contains('is-ad-break')) {
                        btn.setAttribute('aria-label', 'Anúncio em reprodução — clique para cancelar');
                    } else if (autoNext || btn.classList.contains('is-auto-next')) {
                        btn.setAttribute('aria-label', 'Próximo artigo em breve — clique para cancelar');
                    } else {
                        btn.setAttribute('aria-label', label);
                    }
                });
            };

            if (isActuallyPaused) {
                mp.el.classList.add('is-paused');
                syncPlayIcon(true);
            } else {
                mp.el.classList.remove('is-paused');
                syncPlayIcon(false);
            }
        };

        const syncNavButtons = () => {
            if (dead) return;
            if (!window.Mary || !window.Mary.active || !window.Mary.active.player) return;
            const mp = window.Mary.active.player;
            if (mp.nextBtn) mp.nextBtn.disabled = !__maryNav.nextArt;
            if (mp.prevBtn) mp.prevBtn.disabled = !__maryNav.prevArt;
        };

        // Sempre recalcular vizinhos para o slug da faixa/página atual.
        // (Não pular em adoptTransitioning — nextArt obsoleto quebrava o 2º ended.)
        const navReady = applyNavNeighbors(article.slug);
        navReady.then(() => {
            if (dead) return;
            syncNavButtons();
            const isPlaying = controller ? controller.isPlaying() : false;
            updateMaryPlayerState(isPlaying, !isPlaying);
        });

        const setupMaryPlayerEvents = () => {
            if (dead) return;
            if (!window.Mary || !window.Mary.active) return;
            const mp = window.Mary.active.player;
            if (!mp || !mp.el) return;

            ensureOutsideClickListener();

            if (mp.progressTrack && !mp.progressTrack.dataset.eventsBound) {
                mp.progressTrack.dataset.eventsBound = 'true';
                mp.progressTrack.style.cursor = 'pointer';

                const updateSeek = (e, isFinal) => {
                    if (mp.el && mp.el.classList.contains('is-unavailable')) return;
                    if (!controller || controller.mode !== 'file') return;
                    const activeTrack = mp.el.classList.contains('is-expanded')
                        ? mp.el.querySelector('#mary-player-progress-track-expanded')
                        : mp.el.querySelector('#mary-player-progress-track-mini');
                    if (!activeTrack) return;
                    const rect = activeTrack.getBoundingClientRect();
                    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
                    let x = clientX - rect.left;
                    let ratio = x / rect.width;
                    ratio = Math.max(0, Math.min(1, ratio));

                    updateProgressUI(ratio);

                    if (mp.el && !isFinal) {
                        mp.el.classList.add('is-dragging');
                        document.body.classList.add('mary-is-dragging');
                    }

                    if (controller && typeof controller.getDuration === 'function') {
                        const dur = controller.getDuration();
                        const cur = dur * ratio;
                        updateTimeUI(cur, dur);
                    }

                    if (highlighter && typeof highlighter.highlight === 'function') {
                        highlighter.highlight(ratio);
                    }

                    if (isFinal) {
                        if (controller && typeof controller.seekRatio === 'function') {
                            controller.seekRatio(ratio);
                        }
                    }
                };

                const onMove = (e) => {
                    if (!isDraggingProgress) return;
                    e.preventDefault();
                    updateSeek(e, false);
                };

                const onEnd = (e) => {
                    if (!isDraggingProgress) return;
                    isDraggingProgress = false;
                    updateSeek(e.type.includes('touch') ? e.changedTouches[0] : e, true);
                    window.removeEventListener('mousemove', onMove);
                    window.removeEventListener('mouseup', onEnd);
                    window.removeEventListener('touchmove', onMove);
                    window.removeEventListener('touchend', onEnd);
                    if (mp.el) mp.el.classList.remove('is-dragging');
                    document.body.classList.remove('mary-is-dragging');
                };

                mp.progressTrack.addEventListener('mousemove', (e) => {
                    if (mp.el && !mp.el.classList.contains('has-started')) return;
                    if (isDraggingProgress) return;
                    const activeTrack = mp.el.classList.contains('is-expanded')
                        ? mp.el.querySelector('#mary-player-progress-track-expanded')
                        : mp.el.querySelector('#mary-player-progress-track-mini');
                    if (!activeTrack) return;
                    const rect = activeTrack.getBoundingClientRect();
                    let ratio = (e.clientX - rect.left) / rect.width;
                    ratio = Math.max(0, Math.min(1, ratio));
                    activeTrack.style.setProperty('--hover-ratio', ratio);
                    activeTrack.classList.add('is-hovering');

                    if (controller && typeof controller.getDuration === 'function' && mp.timeCurrent && mp.timeRemaining) {
                        const dur = controller.getDuration();
                        if (dur > 0) {
                            const hoverCur = dur * ratio;
                            const hoverRem = dur - hoverCur;
                            mp.timeCurrent.textContent = formatTime(hoverCur);
                            mp.timeRemaining.textContent = '-' + formatTime(hoverRem);
                        }
                    }
                });
                const clearHover = () => {
                    if (mp.el) {
                        const tr1 = mp.el.querySelector('#mary-player-progress-track-expanded');
                        const tr2 = mp.el.querySelector('#mary-player-progress-track-mini');
                        if (tr1) tr1.classList.remove('is-hovering');
                        if (tr2) tr2.classList.remove('is-hovering');
                    }
                    if (controller && typeof controller.emitCurrentProgress === 'function') {
                        controller.emitCurrentProgress();
                    }
                };
                mp.progressTrack.addEventListener('mouseleave', clearHover);
                mp.progressTrack.addEventListener('touchend', clearHover);
                mp.progressTrack.addEventListener('touchcancel', clearHover);

                mp.progressTrack.addEventListener('mousedown', (e) => {
                    if (mp.el && !mp.el.classList.contains('has-started')) return;
                    if (mp.el) mp.el.dataset.userInteracted = 'true';
                    isDraggingProgress = true;
                    updateSeek(e, false);
                    window.addEventListener('mousemove', onMove, { passive: false });
                    window.addEventListener('mouseup', onEnd);
                });

                let touchMode = '';
                let touchStartX = 0;
                let touchStartY = 0;

                mp.el.addEventListener('touchstart', (e) => {
                    if (e.touches.length !== 1) return;

                    if (e.target.closest('button') || e.target.closest('a')) {
                        touchMode = 'ignore';
                        return;
                    }

                    touchStartX = e.touches[0].clientX;
                    touchStartY = e.touches[0].clientY;

                    if (mp.progressTrack.contains(e.target)) {
                        if (!mp.el.classList.contains('has-started')) {
                            touchMode = 'ignore';
                            return;
                        }
                        touchMode = 'seek';
                        isDraggingProgress = true;
                        updateSeek(e, false);
                    } else {
                        touchMode = '';
                    }
                }, { passive: true });

                mp.el.addEventListener('touchmove', (e) => {
                    if (touchMode === 'scroll' || touchMode === 'ignore') return;

                    if (touchMode === '') {
                        const dx = Math.abs(e.touches[0].clientX - touchStartX);
                        const dy = Math.abs(e.touches[0].clientY - touchStartY);
                        if (dx > 7 && dx > dy) {
                            touchMode = 'seek';
                            isDraggingProgress = true;
                            updateSeek(e, false);
                        } else if (dy > 7 && dy > dx) {
                            touchMode = 'scroll';
                            return;
                        }
                    }

                    if (touchMode === 'seek') {
                        if (e.cancelable) e.preventDefault();
                        updateSeek(e, false);
                    }
                }, { passive: false });

                const onElTouchEnd = (e) => {
                    if (touchMode === 'seek') {
                        isDraggingProgress = false;
                        updateSeek(e.changedTouches[0], true);
                        if (mp.el) mp.el.classList.remove('is-dragging');
                        document.body.classList.remove('mary-is-dragging');
                    }
                    touchMode = '';
                };

                mp.el.addEventListener('touchend', onElTouchEnd);
                mp.el.addEventListener('touchcancel', onElTouchEnd);
            }

            if (mp.seekBackBtn && !mp.seekBackBtn.dataset.eventsBound) {
                mp.seekBackBtn.dataset.eventsBound = 'true';
                mp.seekBackBtn.onclick = (e) => {
                    e.stopPropagation();
                    if (mp.el && mp.el.classList.contains('is-unavailable')) return;
                    if (controller && controller.mode === 'file') controller.seekBy(-10);
                };
            }
            if (mp.seekForwardBtn && !mp.seekForwardBtn.dataset.eventsBound) {
                mp.seekForwardBtn.dataset.eventsBound = 'true';
                mp.seekForwardBtn.onclick = (e) => {
                    e.stopPropagation();
                    if (mp.el && mp.el.classList.contains('is-unavailable')) return;
                    if (controller && controller.mode === 'file') controller.seekBy(10);
                };
            }

            if (mp.speedControl && !mp.speedControl.dataset.eventsBound) {
                mp.speedControl.dataset.eventsBound = 'true';

                if (mp.speedControl) {
                    const dropdownMenu = mp.speedControl.nextElementSibling;
                    if (dropdownMenu && dropdownMenu.classList.contains('mary-speed-dropdown-menu')) {
                        const options = dropdownMenu.querySelectorAll('.mary-speed-option');
                        options.forEach((option) => {
                            option.addEventListener('click', (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (mp.el && mp.el.classList.contains('is-unavailable')) return;

                                const nextSpd = parseFloat(option.dataset.speed) || 1.0;
                                const displaySpd = Number.isInteger(nextSpd) ? nextSpd.toFixed(1) : nextSpd.toString();

                                mp.speedControl.innerHTML = `${displaySpd}x <i class="ph ph-caret-down"></i>`;

                                options.forEach((opt) => opt.classList.remove('active'));
                                option.classList.add('active');

                                if (controller && controller.mode === 'file') {
                                    controller.setPlaybackRate(nextSpd);
                                }

                                const bsDropdown = window.bootstrap && window.bootstrap.Dropdown
                                    ? window.bootstrap.Dropdown.getInstance(mp.speedControl)
                                    : null;
                                if (bsDropdown) {
                                    bsDropdown.hide();
                                }
                            });
                        });
                    }
                }
            }

            if (mp.expandBtn && !mp.expandBtn.dataset.eventsBound) {
                mp.expandBtn.dataset.eventsBound = 'true';
                mp.expandBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (mp.el && !mp.el.classList.contains('is-expanded')) {
                        // No rodapé o mini sobe via translateY para ficar acima do
                        // .qt-footer-deck. Expandir com scroll smooth + zerar o
                        // transform no mesmo frame faz o mini "pular" para baixo.
                        // Scroll instantâneo remove o overlap; o mini permanece
                        // visualmente no mesmo ponto da viewport e aí cresce.
                        const footer =
                            document.querySelector('.qt-footer-deck') ||
                            document.querySelector('#app-footer');
                        if (footer) {
                            const footerRect = footer.getBoundingClientRect();
                            const windowHeight = window.innerHeight;
                            const overlap = Math.max(0, windowHeight - footerRect.top);
                            if (overlap > 0) {
                                window.scrollBy({ top: -overlap, behavior: 'auto' });
                            }
                        }

                        const maryRoot = document.getElementById('mary-root');
                        if (maryRoot) {
                            maryRoot.style.transform = 'translateY(0)';
                        }

                        mp.el.classList.add('is-expanded');
                        document.body.classList.add('mary-is-expanded');
                    }
                });
            }

            if (mp.collapseBtn && !mp.collapseBtn.dataset.eventsBound) {
                mp.collapseBtn.dataset.eventsBound = 'true';
                mp.collapseBtn.onclick = (e) => {
                    e.stopPropagation();
                    if (mp.el) {
                        mp.el.classList.remove('is-expanded');
                        document.body.classList.remove('mary-is-expanded');
                    }
                };
            }

            if (mp.playBtn) {
                mp.playBtn.onclick = (e) => {
                    if (e) e.stopPropagation();
                    if (mp.el && mp.el.classList.contains('is-unavailable')) return;
                    if (!canFile) return;
                    if (isAutoNextActive()) {
                        autoNextDismissed = true;
                        clearAutoNext();
                        return;
                    }
                    if (controller && controller.mode === 'file') {
                        controller.toggle();
                    } else if (canFile) {
                        button.click();
                    }
                };
            }

            if (mp.shareBtn) {
                mp.shareBtn.onclick = async () => {
                    try {
                        if (navigator.share) {
                            await navigator.share({
                                title: article.title || 'Qualquer Tecla',
                                url: window.location.href
                            });
                        } else {
                            await navigator.clipboard.writeText(window.location.href);
                            const originalHTML = mp.shareBtn.innerHTML;
                            mp.shareBtn.innerHTML = '<i class="ph ph-check"></i>';
                            setTimeout(() => { if (mp.shareBtn) mp.shareBtn.innerHTML = originalHTML; }, 1800);
                        }
                    } catch (_) { }
                };
            }

            if (mp.favBtn && window.FavoritesStore) {
                mp.favBtn.onclick = async (e) => {
                    e.stopPropagation();
                    if (!article || !article.slug) return;
                    if (mp.favBtn.disabled || mp.favBtn.dataset.isPending === 'true') return;

                    mp.favBtn.dataset.isPending = 'true';
                    mp.favBtn.style.pointerEvents = 'none';

                    try {
                        const nextState = await window.FavoritesStore.toggleFavorite(article.slug);
                        if (dead) return;
                        if (mp.el.dataset.maryCurrentArticle !== article.slug) return;

                        if (mp.favIcon) {
                            if (nextState.isFavorited) {
                                mp.favIcon.classList.remove('ph');
                                mp.favIcon.classList.add('ph-fill');
                                mp.favIcon.style.color = 'var(--qualquer-tecla-gold)';
                                mp.favBtn.setAttribute('aria-pressed', 'true');
                            } else {
                                mp.favIcon.classList.remove('ph-fill');
                                mp.favIcon.classList.add('ph');
                                mp.favIcon.style.color = '';
                                mp.favBtn.setAttribute('aria-pressed', 'false');
                            }
                        }
                        if (mp.favCount) {
                            mp.favCount.textContent = nextState.total;
                        }
                    } catch (err) {
                        console.error('[Favorites] Erro ao alternar favorito', err);
                    } finally {
                        mp.favBtn.dataset.isPending = 'false';
                        mp.favBtn.style.pointerEvents = '';
                    }
                };
            }

            if (mp.nextBtn) {
                mp.nextBtn.onclick = () => {
                    autoNextDismissed = true;
                    if (__maryNav.nextArt) requestAdvanceWithAd(__maryNav.nextArt);
                };
            }

            if (mp.prevBtn) {
                mp.prevBtn.onclick = () => {
                    autoNextDismissed = true;
                    clearAutoNext();
                    if (__maryNav.prevArt) {
                        advanceToArticle(__maryNav.prevArt);
                    } else if (controller && typeof controller.seekRatio === 'function') {
                        controller.seekRatio(0);
                    }
                };
            }
        };

        const onChrome = (speaking, stopped = false) => {
            if (dead) return;
            syncButton(button, speaking);
            if (speaking) {
                highlighter.start();
            }

            const isPlaying = controller ? controller.isPlaying() : false;
            const paused = !isPlaying && !stopped;
            const active = !stopped;

            updateMaryPlayerState(active, paused);

            if ('mediaSession' in navigator) {
                navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
            }

            if (active && !paused) {
                clearPlayerUiInterval();
                playerUiInterval = setInterval(() => {
                    if (dead) {
                        clearPlayerUiInterval();
                        return;
                    }
                    const pausedNow = (!controller || !controller.isPlaying());
                    updateMaryPlayerState(true, pausedNow);
                    syncButton(button, !pausedNow);
                }, 500);
            } else {
                clearPlayerUiInterval();
            }
        };

        const advanceToArticle = (targetArt) => {
            // Cancela early da faixa que está acabando; após o swap resetamos para a nova.
            autoNextDismissed = true;
            if (!targetArt || dead) {
                clearAutoNext();
                return;
            }
            const targetUrl = '?slug=' + targetArt.slug;
            const canSeamlessSwap = Boolean(
                targetArt.audio_full_url &&
                controller &&
                controller.mode === 'file' &&
                typeof controller.swapAndPlay === 'function'
            );
            // Preserva adAudio no handoff seamless; stop ocorre em playing/play resolve.
            clearAutoNext({ keepAdAudio: canSeamlessSwap });

            if (canSeamlessSwap) {
                const audioSrc = targetArt.audio_full_url;

                // Em BG o rebind DOM pode não rodar: chrome + MediaSession mudam aqui.
                applyPlayingArticleChrome(targetArt);
                // Mesmo bind continua vivo sem rebind — liberar early/onEnded da nova faixa.
                autoNextDismissed = false;
                hadFiniteDuration = false;

                if (controller.swapAndPlay) {
                    controller.swapAndPlay(audioSrc);
                    window.__maryActiveFileController = controller;

                    // Em background, a atualização visual (updateArticleContent) é congelada
                    // pelo requestAnimationFrame. Sem isso, __maryNav.nextArt fica obsoleto.
                    applyNavNeighbors(targetArt.slug).then(() => {
                        if (dead) return;
                        syncNavButtons();
                        // Reaplica metadados após vizinhos (alguns Androids só pintam com sessão playing).
                        if (getPlayingSlug('') === targetArt.slug) {
                            setMediaSessionMetadata(targetArt);
                        }
                    });
                }

                const doDomUpdate = () => {
                    try {
                        window.history.pushState({}, '', targetUrl);
                    } catch (_) {
                        console.warn('history.pushState blockeado no ambiente atual. Atualizando via injeção direta de slug.');
                    }

                    const container = document.getElementById('article-container');
                    if (container) {
                        container.innerHTML = '<div class="py-5 my-5 text-center" style="min-height: 60vh; display: flex; flex-direction: column; align-items: center; justify-content: center;"><div class="spinner-border text-gold" role="status" style="width: 3rem; height: 3rem;"></div><p class="mt-4 font-editorial" style="font-size: 1.25rem;">Carregando próximo artigo...</p></div>';
                    }

                    if (typeof window.updateArticleContent === 'function') {
                        try { window.scrollTo({ top: 0, behavior: 'instant' }); } catch (_) { }
                        setTimeout(() => {
                            try {
                                const res = window.updateArticleContent(targetArt.slug);
                                if (res && typeof res.catch === 'function') {
                                    res.catch((err) => {
                                        console.error('Erro no updateArticleContent assíncrono:', err);
                                        window.location.assign(targetUrl);
                                    });
                                }
                            } catch (err) {
                                console.error('Erro no updateArticleContent síncrono:', err);
                                window.location.assign(targetUrl);
                            }
                        }, 10);
                    } else {
                        window.location.assign(targetUrl);
                    }
                };

                doDomUpdate();
                return;
            }

            const finalUrl = targetUrl + '&autoplay=1';
            if (window.SitePageTransition && typeof window.SitePageTransition.go === 'function') {
                window.SitePageTransition.go(finalUrl);
            } else {
                window.location.href = finalUrl;
            }
        };

        __maryNav.advance = advanceToArticle;

        // Usa o advance do bind vivo (pós-rebind), não o closure do bind morto.
        const liveAdvance = (art) => {
            if (typeof __maryNav.advance === 'function') {
                __maryNav.advance(art);
            }
        };

        const onEnded = () => {
            if (dead) return;
            if (handlingEnded) return;
            handlingEnded = true;
            setTimeout(() => { handlingEnded = false; }, 2000);

            const finishWithoutAdvance = () => {
                if (controller) controller.stop();
                if (window.Mary && window.Mary.active && window.Mary.active.player) {
                    const mp = window.Mary.active.player;
                    if (mp.progressFill) mp.progressFill.style.width = '100%';
                    if (mp.timeCurrent && mp.timeRemaining && controller && typeof controller.getDuration === 'function') {
                        const hasStarted = mp.el.classList.contains('has-started');
                        const userInteracted = mp.el.dataset.userInteracted === 'true';
                        if (hasStarted || userInteracted) {
                            const dur = controller.getDuration();
                            mp.timeCurrent.textContent = formatTime(dur);
                            mp.timeRemaining.textContent = '-0:00';
                        }
                    }
                }
            };

            // Usar faixa TOCANDO, não article.slug do bind (em BG o rebind pode não ocorrer).
            const playingSlug = getPlayingSlug(article.slug);

            const logEndedBranch = (branch, nextArt) => {
                MaryAudioTrace.log('onEnded-branch', {
                    note: branch,
                    ctrlId: controller && controller.__maryTraceCtrlId
                        ? controller.__maryTraceCtrlId
                        : null,
                    extra: {
                        branch: branch,
                        articleSlug: article.slug,
                        playingSlug: playingSlug,
                        nextSlug: nextArt && nextArt.slug ? nextArt.slug : null,
                        autoNextDismissed: autoNextDismissed,
                        hadFiniteDuration: hadFiniteDuration
                    }
                });
            };

            const chainAd = (nextArt, branch) => {
                if (dead) return;
                if (!nextArt) {
                    logEndedBranch('no-next', null);
                    finishWithoutAdvance();
                    return;
                }
                logEndedBranch(branch, nextArt);
                clearAutoNext();
                startAutoNext(nextArt, playingSlug, 'ad', liveAdvance, () => dead);
            };

            // Confirma próxima faixa na lista canônica da faixa TOCANDO antes de qualquer cleanup.
            // !__maryNav.nextArt sozinho NÃO é fim da lista (pode estar stale pós-rebind).
            const cachedNext = __maryNav.nextArt;
            applyNavNeighbors(playingSlug).then((neighbors) => {
                if (dead) return;
                const nextArt = (neighbors && neighbors.nextArt) || null;

                if (!nextArt) {
                    logEndedBranch('no-next', null);
                    finishWithoutAdvance();
                    return;
                }

                // Há próxima faixa real: nunca destruir o elemento — encadear ad→advance.
                if (autoNextDismissed) {
                    chainAd(nextArt, 'dismissed');
                    return;
                }

                const session = autoNextSession;

                // Caminho principal: sessão early ativa → ad break → navega.
                if (session && session.mode === 'early' && session.gen === autoNextGen) {
                    const slug = session.sourceSlug;
                    const currentSlug = getPlayingSlug('');
                    if (slug && currentSlug && currentSlug !== slug) {
                        chainAd(nextArt, 'early-mismatch');
                        return;
                    }
                    const art = session.nextArt || nextArt;
                    chainAd(art, 'ad');
                    return;
                }

                // Fallback: duration nunca foi finita → ad break pós-ended.
                if (!hadFiniteDuration) {
                    if (isAutoNextActive()) return;
                    chainAd(nextArt, 'ad');
                    return;
                }

                // Duration finita mas early não armou (ex.: seek abrupto ao fim) → ad break.
                chainAd(nextArt, 'ad');
            }).catch(() => {
                if (dead) return;
                // Rede/lista falhou: só destrói se também não houver cache de próxima.
                if (cachedNext) {
                    chainAd(cachedNext, 'ad');
                    return;
                }
                logEndedBranch('no-next', null);
                finishWithoutAdvance();
            });
        };
        const controllerOpts = { onProgress, onEnded, onBuffering };

        // Seamless transition recovery — getUrl() = pending||current (URL pretendida).
        // Se o controller ainda está em transição (isTransitioning), adota sem destruir
        // mesmo quando o artigo renderizado ainda não é o destino final (janela ~10 ms).
        if (activeCtrl && adopt) {
            // Nova faixa após advance seamless: não herdar dismiss da faixa anterior.
            autoNextDismissed = false;
            controller = activeCtrl;
            if (typeof controller.updateCallbacks === 'function') {
                controller.updateCallbacks(onChrome, controllerOpts);
            }
            if (typeof controller.emitCurrentProgress === 'function') {
                controller.emitCurrentProgress();
            }
            if (controller && typeof controller.isPlaying === 'function') {
                const isPlaying = controller.isPlaying();
                syncButton(button, isPlaying);
            }
        }

        button.hidden = false;
        if (!canFile) {
            // Mudança deliberada: artigo sem áudio encerra o controller anterior
            // para não deixar áudio/MediaSession do artigo anterior ativos.
            if (window.__maryActiveFileController && typeof window.__maryActiveFileController.stop === 'function') {
                window.__maryActiveFileController.stop();
                window.__maryActiveFileController = null;
            }
            button.disabled = true;
            button.setAttribute('aria-disabled', 'true');
            syncButton(button, false);
            setupMaryPlayerEvents();
            setMaryPlaybackUnavailable(true);
            updateMaryPlayerState(false, true);
            return null;
        }
        button.disabled = false;
        button.removeAttribute('aria-disabled');
        setMaryPlaybackUnavailable(false);

        if (activeCtrl && !adopt) {
            MaryAudioTrace.log('rebind-stop', {
                ctrlId: MaryAudioTrace.getCtrlId(activeCtrl),
                note: 'bind:!adopt → stop()',
                extra: {
                    sameUrl: sameUrl,
                    adoptTransitioning: adoptTransitioning,
                    audioUrl: String(audioUrl || '')
                }
            });
            if (typeof activeCtrl.stop === 'function') {
                activeCtrl.stop();
            }
        }

        if (!controller && canFile) {
            controller = createFileController(audioUrl, onChrome, controllerOpts);
            if (typeof controller.preload === 'function') {
                controller.preload();
            }
            window.__maryActiveFileController = controller;
        }

        button.hidden = false;
        syncButton(button, controller ? controller.isPlaying() : false);

        setupMaryPlayerEvents();
        {
            const isPlaying = controller ? controller.isPlaying() : false;
            updateMaryPlayerState(isPlaying, !isPlaying);
        }

        if (!autoplayHandled) {
            autoplayHandled = true;
            const params = new URLSearchParams(window.location.search);
            const isAutoPlay = params.get('autoplay') === '1';

            if (isAutoPlay) {
                const newUrl = new URL(window.location.href);
                newUrl.searchParams.delete('autoplay');
                window.history.replaceState({}, document.title, newUrl.toString());

                setTimeout(() => {
                    if (dead || button.hidden) return;
                    button.click();
                }, 800);
            }
        }

        button.addEventListener('click', async () => {
            if (dead) return;
            if (window.__maryActiveFileController && window.__maryActiveFileController !== controller) {
                if (typeof window.__maryActiveFileController.stop === 'function') {
                    window.__maryActiveFileController.stop();
                }
            }

            if (canFile && (!controller || controller.mode !== 'file')) {
                controller = createFileController(audioUrl, onChrome, controllerOpts);
                window.__maryActiveFileController = controller;
            }

            if (controller && controller.mode === 'file') {
                const ok = await controller.toggle();

                if (ok === 'blocked') {
                    const resumeOnVisible = () => {
                        if (document.visibilityState === 'visible') {
                            document.removeEventListener('visibilitychange', resumeOnVisible);
                            if (!dead && controller && !controller.isPlaying()) {
                                controller.toggle();
                            }
                        }
                    };
                    document.addEventListener('visibilitychange', resumeOnVisible);
                }
            }
        });

        return {
            stop() {
                if (controller) controller.stop();
            }
        };
    }

    /**
     * Controlador de arquivo para Mary (áudio do resumo).
     */
    function createSummaryAudioController(url, onChrome, opts) {
        return createFileController(url, onChrome, opts);
    }

    /* ── Lifecycle: restaura scroll ao retornar do background ─────────── */
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return;
        if (!document.body.classList.contains('mary-is-expanded')) return;

        const mp = global.Mary && global.Mary.active && global.Mary.active.player;
        if (mp && mp.el) {
            mp.el.classList.remove('is-expanded');
        }
        document.body.classList.remove('mary-is-expanded');
    });

    global.ArticleListen = {
        bind,
        createSummaryAudioController,
    };
})(typeof window !== 'undefined' ? window : globalThis);
