/**
 * Mary — assistente de IA flutuante.
 * Orb (orb-animation) é o avatar e o launcher; o chat controla os fluxos.
 */
(function (global) {
    'use strict';

    const ROOT_ID = 'mary-root';
    const PANEL_ID = 'mary-panel';
    const TYPE_MAX_DURATION = 4500;
    const TYPE_BASE_STEP = 28;

    const GREETING =
        'Oi! Eu sou a Mariana, mas pode me chamar de Mary. Sou a inteligência artificial por aqui... ou talvez não. 😏\n\nFica à vontade. Escolha uma opção e vamos conversar.';

    const COMPOSER_SEED_TEXT = 'Oi';

    const LAUNCHER_TIP_TEXT = 'Olá. 🖖 Posso resumir esta notícia para você, de forma objetiva e lógica.';
    const LAUNCHER_TIP_SHOW_MS = 8000;
    const LAUNCHER_TIP_FADE_MS = 280;

    let activeInstance = null;

    function assetPath(rel) {
        return global.MockData && typeof global.MockData.assetPath === 'function'
            ? global.MockData.assetPath(rel)
            : rel;
    }

    function prefersReducedMotion() {
        return Boolean(
            global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches
        );
    }

    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function articleUrl(slug) {
        const base = global.SITE_BASE || '';
        return `${base}noticia.html?slug=${encodeURIComponent(String(slug || '').trim())}`;
    }

    function resolveMediaUrl(src) {
        const raw = String(src || '').trim();
        if (!raw) return '';
        if (/^(https?:|data:|blob:)/i.test(raw)) return raw;
        return assetPath(raw);
    }

    const RELATED_LIMIT = 5;

    /**
     * Completa relacionados com mesma categoria (só no fluxo Mary).
     * Não altera API.getRelatedArticles / fromMockRelated.
     */
    async function padRelatedWithCategory(article, related, limit) {
        const max = Math.max(1, Math.min(Number(limit) || RELATED_LIMIT, RELATED_LIMIT));
        const selfSlug = String((article && article.slug) || '').trim();
        const seen = new Set();
        const out = [];

        const push = (item) => {
            if (!item || !item.slug) return;
            const slug = String(item.slug).trim();
            if (!slug || slug === selfSlug || seen.has(slug)) return;
            seen.add(slug);
            out.push(item);
        };

        (Array.isArray(related) ? related : []).forEach(push);
        if (out.length >= max) return out.slice(0, max);

        const catSlug = String(
            (article && article.categories && article.categories.slug) ||
                (article && article.category_slug) ||
                ''
        ).trim();
        if (
            !catSlug ||
            !global.API ||
            typeof global.API.getAllArticles !== 'function'
        ) {
            return out.slice(0, max);
        }

        try {
            const all = await global.API.getAllArticles();
            (Array.isArray(all) ? all : []).forEach((item) => {
                if (out.length >= max) return;
                const itemCat = String(
                    (item && item.categories && item.categories.slug) ||
                        (item && item.category_slug) ||
                        ''
                ).trim();
                if (itemCat !== catSlug) return;
                push(item);
            });
        } catch (err) {
            console.error('[Mary] Fallback de categoria:', err);
        }

        return out.slice(0, max);
    }


    /* ── Typewriter (cadência do bloco Resumo por IA) ─────────────────────── */

    function createTypewriter() {
        let typeTimer = null;
        let typeToken = 0;

        const clearTypeTimer = () => {
            if (typeTimer) {
                clearTimeout(typeTimer);
                typeTimer = null;
            }
        };

        const stop = ({ reset, el } = {}) => {
            typeToken += 1;
            clearTypeTimer();
            if (reset && el) el.textContent = '';
        };

        const renderTyped = (el, visible, showCaret) => {
            el.textContent = '';
            el.appendChild(document.createTextNode(visible));
            if (showCaret) {
                const caret = document.createElement('span');
                caret.className = 'mary-caret-blink';
                caret.setAttribute('aria-hidden', 'true');
                el.appendChild(caret);
            }
        };

        const typeInto = (el, text, { onTick, onDone, stepMs, holdMs } = {}) =>
            new Promise((resolve) => {
                const full = String(text || '');
                stop({ reset: false });
                const token = ++typeToken;

                const finish = () => {
                    if (token !== typeToken) return;
                    renderTyped(el, full, false);
                    if (typeof onDone === 'function') onDone();
                    resolve();
                };

                if (!full) {
                    finish();
                    return;
                }

                if (prefersReducedMotion()) {
                    renderTyped(el, full, false);
                    if (typeof onTick === 'function') onTick();
                    if (typeof onDone === 'function') onDone();
                    resolve();
                    return;
                }

                /* stepMs/holdMs opcionais: mesma animação/caret, só cadência. */
                const step =
                    typeof stepMs === 'number' && Number.isFinite(stepMs)
                        ? Math.max(12, stepMs)
                        : Math.max(
                              12,
                              Math.min(
                                  TYPE_BASE_STEP,
                                  Math.floor(TYPE_MAX_DURATION / Math.max(full.length, 1))
                              )
                          );
                const hold =
                    typeof holdMs === 'number' && Number.isFinite(holdMs)
                        ? Math.max(0, holdMs)
                        : 700;

                let i = 0;
                renderTyped(el, '', true);
                if (typeof onTick === 'function') onTick();

                const tick = () => {
                    if (token !== typeToken) return;
                    i += 1;
                    const done = i >= full.length;
                    /* Caret permanece até o hold final. */
                    renderTyped(el, full.slice(0, i), true);
                    if (typeof onTick === 'function') onTick();
                    if (done) {
                        typeTimer = setTimeout(() => {
                            if (token !== typeToken) return;
                            finish();
                        }, hold);
                        return;
                    }
                    typeTimer = setTimeout(tick, step);
                };

                typeTimer = setTimeout(tick, step);
            });

        return { typeInto, stop };
    }




    /* ── Orb lazy video ───────────────────────────────────────────────────── */

    function initOrbVideos(root) {
        if (!root || prefersReducedMotion()) return () => {};

        const cleanups = [];
        const videos = root.querySelectorAll('video.mary-orb__video[data-orb-lazy]');
        videos.forEach((video) => {
            const sources = Array.from(video.querySelectorAll('source[data-src]'));
            if (!sources.length) return;

            let loaded = false;

            const ensureSources = () => {
                if (loaded) return;
                loaded = true;
                sources.forEach((source) => {
                    const src = source.getAttribute('data-src');
                    if (src) source.setAttribute('src', src);
                });
                video.load();
            };

            const tryPlay = () => {
                ensureSources();
                if (document.visibilityState === 'hidden') {
                    video.pause();
                    return;
                }
                const playPromise = video.play();
                if (playPromise && typeof playPromise.catch === 'function') {
                    playPromise.catch(() => { });
                }
            };

            const onVisibility = () => {
                if (!loaded) return;
                if (document.visibilityState === 'hidden') {
                    // Não pausar o vídeo se o player de artigo estiver ativo —
                    // o pause no vídeo pode desassociar o MediaSession do <audio>
                    if (global.__maryActiveFileController) return;
                    video.pause();
                } else {
                    if (global.__maryActiveFileController) return;
                    tryPlay();
                }
            };
            document.addEventListener('visibilitychange', onVisibility);
            cleanups.push(() => document.removeEventListener('visibilitychange', onVisibility));

            if (!('IntersectionObserver' in global)) {
                tryPlay();
                return;
            }

            const io = new IntersectionObserver(
                (entries) => {
                    entries.forEach((entry) => {
                        if (entry.isIntersecting) tryPlay();
                        else if (loaded) video.pause();
                    });
                },
                { rootMargin: '80px', threshold: 0.01 }
            );
            io.observe(video);
            cleanups.push(() => io.disconnect());
        });

        return () => {
            cleanups.forEach((fn) => {
                try { fn(); } catch (_) { /* ignore */ }
            });
        };
    }

    function orbMarkup(sizeClass) {
        const mp4 = assetPath('assets/video/orb-animation.mp4');
        const poster = assetPath('assets/video/orb-animation-poster.jpg');
        return `
<div class="mary-orb ${sizeClass || ''}" aria-hidden="true">
  <video
    class="mary-orb__video"
    muted
    loop
    playsinline
    preload="none"
    poster="${escapeHtml(poster)}"
    data-orb-lazy="true">
    <source data-src="${escapeHtml(mp4)}" type="video/mp4">
  </video>
</div>`;
    }

    /* ── Action registry ──────────────────────────────────────────────────── */

    function buildActions(ctx) {
        return {
            summarize: {
                id: 'summarize',
                label: 'Resumir notícia',
                available: () => Boolean(ctx.summary),
                run: null /* bound per instance */
            },
            related: {
                id: 'related',
                label: 'Artigos relacionados',
                available: () => Boolean(ctx.slug),
                run: null /* bound per instance */
            }
        };
    }

    /* ── Instance ─────────────────────────────────────────────────────────── */

    function makeSyncElement(els) {
        const validEls = els.filter(Boolean);
        if (!validEls.length) return null;
        return new Proxy(validEls[0], {
            set(target, prop, value) {
                validEls.forEach(el => {
                    if (prop === 'onclick' && typeof value === 'function') {
                        el.onclick = value;
                    } else {
                        el[prop] = value;
                    }
                });
                return true;
            },
            get(target, prop) {
                if (prop === 'addEventListener') {
                    return (type, listener, options) => {
                        validEls.forEach(el => el.addEventListener(type, listener, options));
                    };
                }
                if (prop === 'setAttribute') {
                    return (name, val) => {
                        validEls.forEach(el => el.setAttribute(name, val));
                    };
                }
                if (prop === 'classList') {
                    return {
                        add: (...args) => validEls.forEach(el => el.classList.add(...args)),
                        remove: (...args) => validEls.forEach(el => el.classList.remove(...args)),
                        toggle: (...args) => validEls.forEach(el => el.classList.toggle(...args))
                    };
                }
                if (prop === 'dataset') {
                    return new Proxy(target.dataset, {
                        set(dsTarget, dsProp, dsValue) {
                            validEls.forEach(el => el.dataset[dsProp] = dsValue);
                            return true;
                        },
                        get(dsTarget, dsProp) {
                            return dsTarget[dsProp];
                        }
                    });
                }
                if (prop === 'style') {
                    return new Proxy(target.style, {
                        set(styleTarget, styleProp, styleValue) {
                            validEls.forEach(el => el.style[styleProp] = styleValue);
                            return true;
                        },
                        get(styleTarget, styleProp) {
                            const val = styleTarget[styleProp];
                            return typeof val === 'function' ? val.bind(styleTarget) : val;
                        }
                    });
                }
                const val = target[prop];
                return typeof val === 'function' ? val.bind(target) : val;
            }
        });
    }

    function createMary(options) {
        const ctx = {
            summary: String(options.summary || '').trim(),
            title: String(options.title || '').trim(),
            slug: String(options.slug || '').trim(),
            articleId: options.articleId || options.slug || '',
            audioSummaryUrl: String(options.audioSummaryUrl || '').trim(),
            audioStatus: String(options.audioStatus || '').trim()
        };

        if (!ctx.summary) return null;

        unmount();

        const typewriter = createTypewriter();
        let open = false;
        let greeted = false;
        let flowBusy = false;
        let composerLocked = false;
        let composerSeedReady = false;
        let composerSeedToken = 0;
        let speech = null;

        const root = document.createElement('div');
        root.id = ROOT_ID;
        root.className = 'mary fixed-bottom';
        root.innerHTML = `
<div class="mary-launcher-row">
  <button type="button" class="mary-launcher" aria-expanded="false" aria-label="Abrir chat com Mary">
    <span class="mary-launcher__hit" aria-hidden="true"></span>
    ${orbMarkup('mary-orb--launcher')}
  </button>
  <div class="mary-launcher-tip" hidden role="status" aria-live="polite"></div>
</div>
<div class="mary-dock">
  <div class="mary-audio-player is-paused" id="mary-audio-player" aria-label="Player de Áudio">
    
    <!-- MODO MINI -->
    <div class="mary-player-mini" id="mary-player-mini">
      <img src="" class="mary-player-mini__bg-cover" id="mary-player-bg-cover-mini" alt="" aria-hidden="true">
      
      <div class="mary-player-mini__body">
        <button type="button" class="mary-player-mini__expand-btn" aria-label="Expandir"><i class="ph ph-caret-up"></i></button>
        
        <div class="mary-player-mini__top">
          <div class="mary-player-mini__time-display" id="mary-player-time-display-mini">
            <span id="mary-player-time-current-mini">0:00</span>
            <span id="mary-player-time-remaining-mini">-0:00</span>
          </div>
          <div class="mary-player-mini__info">
            <div class="mary-player-mini__title" id="mary-player-title-mini"></div>
            <div class="mary-player-mini__author" id="mary-player-author-mini"></div>
          </div>
          <div class="mary-player-mini__controls">
            <button type="button" class="mary-player-mini__play-circle" id="mary-player-play-mini" aria-label="Reproduzir"><i class="ph-fill ph-play-circle"></i></button>
          </div>
        </div>
      </div>
      
      <div class="mary-player-mini__progress">
        <div class="mary-player-mini__progress-track" id="mary-player-progress-track-mini">
          <div class="mary-player-mini__progress-fill" id="mary-player-progress-fill-mini"></div>
        </div>
      </div>
    </div>

    <!-- MODO EXPANDIDO -->
    <div class="mary-player-expanded__ambient-bg" id="mary-player-ambient-bg"></div>
    <div class="mary-player-expanded" id="mary-player-expanded">
      <button type="button" class="mary-player-expanded__collapse-btn" id="mary-player-collapse" aria-label="Recolher"><i class="ph ph-caret-down"></i></button>
      
      <div class="mary-player-expanded__cover-wrapper">
        <img src="" class="mary-player-expanded__cover" id="mary-player-cover-expanded" alt="" aria-hidden="true">
      </div>
      
      <div class="mary-player-expanded__info-wrapper" style="display: flex; justify-content: space-between; align-items: flex-start; width: 100%; margin-bottom: 2rem;">
        <div class="mary-player-expanded__info" style="margin-bottom: 0; flex: 1;">
          <div class="mary-player-expanded__title-wrapper">
            <div class="mary-player-expanded__title" id="mary-player-title-expanded"></div>
          </div>
          <div class="mary-player-expanded__author" id="mary-player-author-expanded"></div>
        </div>
      </div>
      
      <div class="mary-player-expanded__progress-section">
        <div class="mary-player-expanded__progress-track" id="mary-player-progress-track-expanded">
          <div class="mary-player-expanded__progress-fill" id="mary-player-progress-fill-expanded"></div>
        </div>
        <div class="mary-player-expanded__time-row">
          <span id="mary-player-time-current-expanded">0:00</span>
          <span id="mary-player-time-remaining-expanded">-0:00</span>
        </div>
      </div>
      
      <div class="mary-player-expanded__main-controls">
        <button type="button" class="mary-player-expanded__btn mary-player-expanded__btn--seek" id="mary-player-seek-back" aria-label="Voltar 10 segundos"><i class="ph-fill ph-arrow-counter-clockwise"></i><span class="seek-label">-10s</span></button>
        <button type="button" class="mary-player-expanded__btn mary-player-expanded__btn--skip" id="mary-player-prev" aria-label="Artigo anterior" disabled><i class="ph-fill ph-skip-back"></i></button>
        <button type="button" class="mary-player-expanded__btn mary-player-expanded__btn--play" id="mary-player-play-expanded" aria-label="Reproduzir"><i class="ph-fill ph-play-circle"></i></button>
        <button type="button" class="mary-player-expanded__btn mary-player-expanded__btn--skip" id="mary-player-next" aria-label="Próximo artigo" disabled><i class="ph-fill ph-skip-forward"></i></button>
        <button type="button" class="mary-player-expanded__btn mary-player-expanded__btn--seek" id="mary-player-seek-forward" aria-label="Avançar 10 segundos"><i class="ph-fill ph-arrow-clockwise"></i><span class="seek-label">+10s</span></button>
      </div>

      <div class="mary-player-expanded__bottom-row">
        <div class="mary-player-expanded__bottom-controls">
          <div class="dropdown dropup">
            <button type="button" class="mary-speed-btn" id="mary-speed-control" aria-label="Velocidade de reprodução" data-bs-toggle="dropdown" aria-expanded="false">1.0x <i class="ph ph-caret-down"></i></button>
            <ul class="dropdown-menu dropdown-menu-dark mary-speed-dropdown-menu">
              <li><button type="button" class="dropdown-item mary-speed-option" data-speed="0.75">0.75x</button></li>
              <li><button type="button" class="dropdown-item mary-speed-option active" data-speed="1.0">1.0x (Normal)</button></li>
              <li><button type="button" class="dropdown-item mary-speed-option" data-speed="1.25">1.25x</button></li>
              <li><button type="button" class="dropdown-item mary-speed-option" data-speed="1.5">1.5x</button></li>
              <li><button type="button" class="dropdown-item mary-speed-option" data-speed="2.0">2.0x</button></li>
            </ul>
          </div>
          <div class="mary-player-expanded__action-group">
            <button type="button" class="mary-player-expanded__btn mary-player-expanded__btn--favorite" id="mary-player-favorite" aria-label="Favoritar artigo" aria-pressed="false">
              <i class="ph ph-heart" id="mary-player-favorite-icon"></i>
              <span id="mary-player-favorite-count">249</span>
            </button>
            <button type="button" class="mary-player-expanded__btn mary-player-expanded__btn--share" id="mary-player-share" aria-label="Compartilhar artigo"><i class="ph ph-export"></i><span id="mary-player-share-text">Enviar</span></button>
          </div>
        </div>
      </div>

      <div class="mary-player-expanded__credits">
        Áudio gerado pela <a href="sobre-mary-ai.html">Mary AI</a>, ferramenta de inteligência artificial desenvolvida e treinada pela <a href="https://alt42.com.br/" target="_blank" rel="noopener noreferrer">alt42</a> para o Qualquer Tecla. Player em versão beta · v1.0
      </div>
    </div>

  </div>
</div>
<div class="mary-panel" id="${PANEL_ID}" role="dialog" aria-modal="true" aria-labelledby="mary-panel-title" hidden>
  <header class="mary-panel__header">
    ${orbMarkup('mary-orb--avatar')}
    <div class="mary-panel__identity">
      <span class="mary-panel__name" id="mary-panel-title">Mary AI</span>
      <span class="mary-panel__presence"><span class="mary-panel__presence-label" data-mary-presence>Online</span><span class="mary-panel__presence-dots" aria-hidden="true"></span></span>
    </div>
    <button type="button" class="mary-panel__close" aria-label="Fechar chat">
      <i class="ph ph-x" aria-hidden="true"></i>
    </button>
  </header>
  <div class="mary-panel__messages" data-mary-messages tabindex="0"></div>
  <p class="mary-panel__credits">
    Respostas geradas pela <a href="sobre-mary-ai.html">Mary AI</a>
  </p>
  <footer class="mary-panel__footer">
    <form class="mary-composer" data-mary-composer>
      <div
        class="mary-composer__input"
        data-mary-input-surface
        role="textbox"
        aria-readonly="true"
        aria-label="Mensagem para Mary"
      ></div>
      <input type="hidden" data-mary-input value="" />
      <button type="submit" class="mary-composer__send" data-mary-send aria-label="Enviar mensagem">
        <i class="ph ph-paper-plane-tilt" aria-hidden="true"></i>
      </button>
    </form>
  </footer>
</div>`;

        document.body.appendChild(root);

        if (global.SiteScrollbar && typeof global.SiteScrollbar.refresh === 'function') {
            global.SiteScrollbar.refresh();
        }

        const updateMaryPosition = () => {
            // Expandido precisa ocupar a viewport inteira; o translateY do mini
            // (afastamento do footer) não pode permanecer ativo nesse estado.
            if (document.body.classList.contains('mary-is-expanded')) {
                root.style.transform = 'translateY(0)';
                return;
            }
            const footer = document.querySelector('.qt-footer-deck') || document.querySelector('#app-footer');
            if (!footer) return;
            const footerRect = footer.getBoundingClientRect();
            const windowHeight = window.innerHeight;
            if (footerRect.top < windowHeight) {
                // Mantém o mini ancorado imediatamente acima do .qt-footer-deck.
                // Limite dinâmico: sobe com o footer, mas nunca sai da viewport.
                const rootHeight = Math.max(0, root.offsetHeight || 0);
                const overlap = Math.max(0, windowHeight - footerRect.top);
                const maxLift = Math.max(0, windowHeight - rootHeight);
                const lift = Math.min(overlap, maxLift);
                root.style.transform = lift > 0 ? `translateY(-${lift}px)` : 'translateY(0)';
            } else {
                root.style.transform = 'translateY(0)';
            }
        };

        // article-listen adiciona/remove mary-is-expanded; reagir aqui evita herdar
        // o deslocamento do mini e restaura o cálculo do footer no collapse.
        let wasMaryExpanded = document.body.classList.contains('mary-is-expanded');
        const onMaryExpandedClass = () => {
            const isExpanded = document.body.classList.contains('mary-is-expanded');
            if (isExpanded === wasMaryExpanded) return;
            wasMaryExpanded = isExpanded;
            if (isExpanded) {
                root.style.transform = 'translateY(0)';
            } else {
                updateMaryPosition();
            }
        };
        const maryExpandedObserver = new MutationObserver(onMaryExpandedClass);
        maryExpandedObserver.observe(document.body, {
            attributes: true,
            attributeFilter: ['class']
        });
        if (wasMaryExpanded) {
            root.style.transform = 'translateY(0)';
        }

        window.addEventListener('scroll', updateMaryPosition, { passive: true });
        window.addEventListener('resize', updateMaryPosition, { passive: true });
        // Initial call after a tiny delay to ensure footer is rendered
        setTimeout(updateMaryPosition, 50);

        const launcher = root.querySelector('.mary-launcher');
        const launcherTip = root.querySelector('.mary-launcher-tip');
        const panel = root.querySelector('.mary-panel');
        const messagesEl = root.querySelector('[data-mary-messages]');
        const closeBtn = root.querySelector('.mary-panel__close');
        const presenceEl = root.querySelector('.mary-panel__presence');
        const presenceLabel = root.querySelector('[data-mary-presence]');
        const composerForm = root.querySelector('[data-mary-composer]');
        const composerSurface = root.querySelector('[data-mary-input-surface]');
        const composerInput = root.querySelector('[data-mary-input]');
        const composerSend = root.querySelector('[data-mary-send]');

        if (panel && !panel.hasAttribute('tabindex')) {
            panel.setAttribute('tabindex', '-1');
        }

        let tipDead = false;
        let tipShowTimer = null;
        let tipHideTimer = null;

        const clearLauncherTipTimers = () => {
            if (tipShowTimer) {
                clearTimeout(tipShowTimer);
                tipShowTimer = null;
            }
            if (tipHideTimer) {
                clearTimeout(tipHideTimer);
                tipHideTimer = null;
            }
        };

        const hideLauncherTip = ({ immediate = false } = {}) => {
            clearLauncherTipTimers();
            launcher?.classList.remove('is-tip-active');
            if (!launcherTip) return;
            launcherTip.classList.remove('is-visible');
            if (immediate || prefersReducedMotion()) {
                launcherTip.hidden = true;
                launcherTip.textContent = '';
                return;
            }
            tipHideTimer = setTimeout(() => {
                tipHideTimer = null;
                if (tipDead || !launcherTip) return;
                launcherTip.hidden = true;
                launcherTip.textContent = '';
            }, LAUNCHER_TIP_FADE_MS);
        };

        const showLauncherTip = () => {
            if (tipDead || !launcherTip) return;
            clearLauncherTipTimers();
            launcher?.classList.remove('is-tip-active');
            launcherTip.textContent = LAUNCHER_TIP_TEXT;
            launcherTip.hidden = false;
            launcherTip.classList.remove('is-visible');
            requestAnimationFrame(() => {
                if (tipDead || !launcherTip) return;
                launcherTip.classList.add('is-visible');
                launcher?.classList.add('is-tip-active');
            });
            tipShowTimer = setTimeout(() => {
                tipShowTimer = null;
                if (tipDead) return;
                hideLauncherTip();
            }, LAUNCHER_TIP_SHOW_MS);
        };

        const messagesScroller = () => {
            if (
                global.SiteScrollbar &&
                typeof global.SiteScrollbar.getScroller === 'function'
            ) {
                return global.SiteScrollbar.getScroller(messagesEl) || messagesEl;
            }
            return messagesEl;
        };

        const setPresence = (label, { recording = false } = {}) => {
            if (presenceLabel) presenceLabel.textContent = label;
            if (presenceEl) {
                presenceEl.classList.toggle('is-recording', Boolean(recording));
                presenceEl.setAttribute('aria-live', recording ? 'polite' : 'off');
            }
        };

        const cleanupOrbVideos = initOrbVideos(root) || (() => {});

        const nearBottom = () => {
            const el = messagesScroller();
            const threshold = 100;
            return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
        };

        const scrollToLatest = (force) => {
            if (!force && !nearBottom()) return;
            const el = messagesScroller();
            el.scrollTop = el.scrollHeight;
        };

        const appendRow = (className) => {
            const row = document.createElement('div');
            row.className = `mary-msg ${className || ''}`.trim();
            // SimpleScrollbar envolve o host; mensagens devem ir no .ss-content,
            // senão ficam após o .ss-wrapper (height:100%) e caem na base do painel.
            messagesScroller().appendChild(row);
            scrollToLatest(true);
            return row;
        };

        const resetComposerSurface = () => {
            if (composerSurface) composerSurface.replaceChildren();
            if (composerInput) composerInput.value = '';
            composerSeedReady = false;
        };

        const setComposerSessionLocked = (locked) => {
            composerLocked = locked;
            if (composerForm) {
                composerForm.classList.toggle('is-disabled', locked);
            }
            if (composerSend) {
                composerSend.disabled = locked || !composerSeedReady;
            }
        };

        const waitForPanelReveal = () =>
            new Promise((resolve) => {
                if (!panel || prefersReducedMotion()) {
                    resolve();
                    return;
                }
                /* Começa no meio do fade (~0.32s) — acompanha a abertura sem “travar” no fim. */
                setTimeout(resolve, 160);
            });

        const playComposerSeed = async () => {
            const token = ++composerSeedToken;
            resetComposerSurface();
            setComposerSessionLocked(false);
            if (composerSend) composerSend.disabled = true;
            if (!composerSurface) return;

            await waitForPanelReveal();
            if (token !== composerSeedToken || !open || greeted) return;

            /* Cadência próxima da digitação natural — suave, sem pausas longas entre letras. */
            await typewriter.typeInto(composerSurface, COMPOSER_SEED_TEXT, {
                stepMs: 72,
                holdMs: 280
            });

            if (token !== composerSeedToken || !open || greeted) return;

            if (composerInput) composerInput.value = COMPOSER_SEED_TEXT;
            composerSeedReady = true;
            if (composerSend) {
                composerSend.disabled = false;
                composerSend.focus({ preventScroll: true });
            }
        };

        const appendUserMessage = (text) => {
            const row = appendRow('mary-msg--user');
            const body = document.createElement('div');
            body.className = 'mary-msg__text';
            body.textContent = text;
            row.appendChild(body);
            scrollToLatest(true);
            return row;
        };

        const say = async (text) => {
            const row = appendRow('mary-msg--assistant');
            const body = document.createElement('div');
            body.className = 'mary-msg__text';
            row.appendChild(body);
            await typewriter.typeInto(body, text, {
                onTick: () => scrollToLatest(false)
            });
            scrollToLatest(true);
            return row;
        };

        const showLoading = () => {
            const row = appendRow('mary-msg--loading');
            row.innerHTML =
                '<span class="mary-msg__dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="visually-hidden">Mary está pensando</span>';
            scrollToLatest(true);
            return row;
        };

        const addActions = (items, { onPick } = {}) => {
            const row = appendRow('mary-msg--actions');
            const group = document.createElement('div');
            group.className = 'mary-actions';
            group.setAttribute('role', 'group');
            items.forEach((item) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'btn btn-outline-gold mary-chip';
                btn.textContent = item.label;
                btn.dataset.actionId = item.id;
                btn.addEventListener('click', () => {
                    if (btn.disabled) return;
                    group.querySelectorAll('.mary-chip').forEach((el) => {
                        el.disabled = true;
                        el.classList.toggle('is-selected', el === btn);
                    });
                    if (typeof onPick === 'function') onPick(item, btn);
                });
                group.appendChild(btn);
            });
            row.appendChild(group);
            scrollToLatest(true);
            return row;
        };

        const addSummaryCard = async (summaryText) => {
            const row = appendRow('mary-msg--summary');
            const card = document.createElement('div');
            card.className = 'mary-summary-card';
            const textEl = document.createElement('p');
            textEl.className = 'mary-summary-card__text';
            card.appendChild(textEl);
            row.appendChild(card);
            await typewriter.typeInto(textEl, summaryText, {
                onTick: () => scrollToLatest(false)
            });
            scrollToLatest(true);
            return { row, card, textEl };
        };

        const safeVoiceSeconds = (value) => {
            const n = Number(value);
            return Number.isFinite(n) && n >= 0 ? n : 0;
        };

        const formatVoiceTime = (seconds) => {
            const total = Math.max(0, Math.floor(safeVoiceSeconds(seconds)));
            const m = Math.floor(total / 60);
            const s = total % 60;
            return `${m}:${String(s).padStart(2, '0')}`;
        };

        const buildWaveBars = (count = 36) => {
            const bars = [];
            for (let i = 0; i < count; i += 1) {
                const wave =
                    0.28 +
                    0.55 * Math.abs(Math.sin(i * 0.55)) +
                    0.2 * Math.abs(Math.sin(i * 1.37 + 0.4));
                const h = Math.max(18, Math.min(100, Math.round(wave * 100)));
                bars.push(`<i style="--mary-bar:${h}%"></i>`);
            }
            return bars.join('');
        };

        const resolveMaryAvatar = () => assetPath('assets/img/authors/avatar-default.svg');

        const mountVoiceBubble = () => {
            if (speech && typeof speech.stop === 'function') speech.stop();

            const row = appendRow('mary-msg--voice');
            const bubble = document.createElement('div');
            bubble.className = 'mary-voice';
            bubble.setAttribute('role', 'group');
            bubble.setAttribute('aria-label', 'Áudio do resumo');

            const now = new Date();
            const stamp = now.toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });

            bubble.innerHTML = `
                <button type="button" class="mary-voice__play" aria-pressed="false" aria-label="Ouvir o resumo" data-mary-voice-play>
                  <i class="ph-fill ph-play" aria-hidden="true" data-mary-speak-icon></i>
                </button>
                <div class="mary-voice__body">
                  <button type="button" class="mary-voice__wave" aria-label="Progresso do áudio" data-mary-wave>
                    <span class="mary-voice__bars" aria-hidden="true">${buildWaveBars()}</span>
                    <span class="mary-voice__progress" data-mary-progress aria-hidden="true"></span>
                    <span class="mary-voice__knob" data-mary-knob aria-hidden="true"></span>
                  </button>
                  <div class="mary-voice__meta">
                    <span class="mary-voice__time" data-mary-time>0:00</span>
                    <span class="mary-voice__stamp">
                      <time datetime="${escapeHtml(now.toISOString())}">${escapeHtml(stamp)}</time>
                    </span>
                  </div>
                </div>
                <div class="mary-voice__avatar" aria-hidden="true">
                  <img src="${escapeHtml(resolveMaryAvatar())}" alt="" width="44" height="44" decoding="async">
                  <i class="ph-fill ph-microphone mary-voice__mic" aria-hidden="true"></i>
                </div>
                <button type="button" class="mary-voice__speed" data-mary-voice-speed aria-label="Velocidade 1x">
                  1x
                </button>`;

            row.appendChild(bubble);
            scrollToLatest(true);

            const playBtn = bubble.querySelector('[data-mary-voice-play]');
            const icon = bubble.querySelector('[data-mary-speak-icon]');
            const timeEl = bubble.querySelector('[data-mary-time]');
            const progressEl = bubble.querySelector('[data-mary-progress]');
            const knobEl = bubble.querySelector('[data-mary-knob]');
            const waveEl = bubble.querySelector('[data-mary-wave]');
            const speedBtn = bubble.querySelector('[data-mary-voice-speed]');

            const VOICE_SPEEDS = [1, 1.5, 2];
            let speedIdx = 0;

            const formatVoiceSpeed = (rate) => {
                const n = Number(rate) || 1;
                if (Number.isInteger(n)) return `${n}x`;
                return `${String(n).replace('.', ',')}x`;
            };

            let durationSec = 0;
            let currentSec = 0;
            let speechTicker = null;
            let speechStartedAt = 0;
            const speechEstimate = Math.max(
                8,
                Math.round(String(ctx.summary || '').replace(/\s+/g, ' ').trim().length / 13)
            );

            const clearSpeechTicker = () => {
                if (speechTicker) {
                    clearInterval(speechTicker);
                    speechTicker = null;
                }
            };

            const renderProgress = (current, duration, playing) => {
                currentSec = safeVoiceSeconds(current);
                const nextDur = safeVoiceSeconds(duration);
                if (nextDur > 0) durationSec = nextDur;
                const ratio =
                    durationSec > 0 ? Math.max(0, Math.min(1, currentSec / durationSec)) : 0;
                const pct = `${(ratio * 100).toFixed(2)}%`;
                if (progressEl) progressEl.style.width = pct;
                if (knobEl) knobEl.style.left = pct;
                if (timeEl) {
                    if (playing || currentSec > 0) {
                        timeEl.textContent = formatVoiceTime(currentSec);
                    } else {
                        timeEl.textContent = formatVoiceTime(
                            durationSec > 0 ? durationSec : speechEstimate
                        );
                    }
                }
            };

            const sync = (speaking) => {
                playBtn.setAttribute('aria-pressed', speaking ? 'true' : 'false');
                playBtn.setAttribute(
                    'aria-label',
                    speaking ? 'Pausar a leitura' : 'Ouvir o resumo'
                );
                if (icon) {
                    icon.className = speaking ? 'ph-fill ph-pause' : 'ph-fill ph-play';
                }
                bubble.classList.toggle('is-playing', speaking);
            };

            const canFile = Boolean(ctx.audioSummaryUrl);
            let fileCtrlRef = null;

            if (
                canFile &&
                global.ArticleListen &&
                typeof global.ArticleListen.createSummaryAudioController === 'function'
            ) {
                const fileCtrl = global.ArticleListen.createSummaryAudioController(
                    ctx.audioSummaryUrl,
                    sync,
                    {
                        onProgress: ({ current, duration, playing }) => {
                            renderProgress(current, duration, playing);
                        }
                    }
                );
                fileCtrlRef = fileCtrl;

                const applyVoiceSpeed = () => {
                    const rate = VOICE_SPEEDS[speedIdx] || 1;
                    if (typeof fileCtrl.setPlaybackRate === 'function') {
                        fileCtrl.setPlaybackRate(rate);
                    }
                    if (speedBtn) {
                        const label = formatVoiceSpeed(rate);
                        speedBtn.textContent = label;
                        speedBtn.setAttribute('aria-label', `Velocidade ${label}`);
                    }
                };

                speech = {
                    mode: 'file',
                    async toggle() {
                        const ok = await fileCtrl.toggle();
                        applyVoiceSpeed();
                        return ok;
                    },
                    seek(sec) {
                        if (typeof fileCtrl.seek === 'function') {
                            return fileCtrl.seek(sec);
                        }
                        return false;
                    },
                    stop() {
                        fileCtrl.stop();
                    },
                    setPlaybackRate(rate) {
                        if (typeof fileCtrl.setPlaybackRate === 'function') {
                            fileCtrl.setPlaybackRate(rate);
                        }
                    }
                };
                if (typeof fileCtrl.preload === 'function') fileCtrl.preload();
                applyVoiceSpeed();

                speedBtn?.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    speedIdx = (speedIdx + 1) % VOICE_SPEEDS.length;
                    applyVoiceSpeed();
                });
            } else {
                row.remove();
                return null;
            }

            renderProgress(0, durationSec || speechEstimate, false);

            const resolveVoiceDuration = () => {
                if (durationSec > 0) return durationSec;
                if (fileCtrlRef && typeof fileCtrlRef.getDuration === 'function') {
                    const dur = safeVoiceSeconds(fileCtrlRef.getDuration());
                    if (dur > 0) {
                        durationSec = dur;
                        return dur;
                    }
                }
                return 0;
            };

            const seekFromClientX = (clientX, { optimistic = true } = {}) => {
                if (!speech || !waveEl) return false;
                const rect = waveEl.getBoundingClientRect();
                if (!rect.width) return false;
                const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
                const dur = resolveVoiceDuration();
                const playing = bubble.classList.contains('is-playing');
                const uiDur = dur > 0 ? dur : speechEstimate;
                let applied = false;

                if (fileCtrlRef && typeof fileCtrlRef.seekRatio === 'function') {
                    applied = fileCtrlRef.seekRatio(ratio) === true;
                }
                if (!applied && typeof speech.seek === 'function' && dur > 0) {
                    const seekResult = speech.seek(ratio * dur);
                    applied = seekResult !== false;
                }

                if (optimistic && uiDur > 0) {
                    renderProgress(ratio * uiDur, uiDur, playing);
                }

                return applied;
            };

            playBtn.addEventListener('click', (event) => {
                event.preventDefault();
                if (!speech) return;
                const result = speech.toggle();
                if (result && typeof result.then === 'function') {
                    result.catch(() => { });
                }
            });

            let waveScrubbing = false;

            waveEl.addEventListener('pointerdown', (event) => {
                event.preventDefault();
                event.stopPropagation();
                waveScrubbing = true;
                try {
                    waveEl.setPointerCapture(event.pointerId);
                } catch (_) {
                    /* ignore */
                }
                const ok = seekFromClientX(event.clientX, { optimistic: true });
                if (!ok && resolveVoiceDuration() <= 0) {
                    playBtn.click();
                }
            });

            waveEl.addEventListener('pointermove', (event) => {
                if (!waveScrubbing) return;
                event.preventDefault();
                seekFromClientX(event.clientX, { optimistic: true });
            });

            const endWaveScrub = (event) => {
                if (!waveScrubbing) return;
                waveScrubbing = false;
                if (event && event.pointerId != null) {
                    try {
                        waveEl.releasePointerCapture(event.pointerId);
                    } catch (_) {
                        /* ignore */
                    }
                }
            };

            waveEl.addEventListener('pointerup', endWaveScrub);
            waveEl.addEventListener('pointercancel', endWaveScrub);

            return bubble;
        };

        const mountRelatedList = (items) => {
            const row = appendRow('mary-msg--related');
            const list = document.createElement('div');
            list.className = 'mary-related';
            list.setAttribute('role', 'list');

            (Array.isArray(items) ? items : []).forEach((item) => {
                const slug = String((item && item.slug) || '').trim();
                if (!slug) return;

                const title = String((item && item.title) || 'Sem título').trim();
                const catName = String(
                    (item.categories && (item.categories.name || item.categories.slug)) ||
                        item.category_slug ||
                        ''
                ).trim();
                const imgSrc = resolveMediaUrl(item.featured_image);

                const link = document.createElement('a');
                link.className = 'mary-related__item';
                link.href = articleUrl(slug);
                link.setAttribute('role', 'listitem');

                const thumb = document.createElement('span');
                thumb.className = 'mary-related__thumb' + (imgSrc ? '' : ' is-empty');
                thumb.setAttribute('aria-hidden', 'true');
                if (imgSrc) {
                    const img = document.createElement('img');
                    img.src = imgSrc;
                    img.alt = '';
                    img.width = 52;
                    img.height = 52;
                    img.loading = 'lazy';
                    img.decoding = 'async';
                    thumb.appendChild(img);
                }

                const body = document.createElement('span');
                body.className = 'mary-related__body';

                const titleEl = document.createElement('span');
                titleEl.className = 'mary-related__title';
                titleEl.textContent = title;
                body.appendChild(titleEl);

                if (catName) {
                    const meta = document.createElement('span');
                    meta.className = 'mary-related__meta';
                    meta.textContent = catName;
                    body.appendChild(meta);
                }

                link.appendChild(thumb);
                link.appendChild(body);
                list.appendChild(link);
            });

            row.appendChild(list);
            scrollToLatest(true);
            return row;
        };

        const offerBackToMenu = () => {
            addActions([{ id: 'back', label: 'Voltar' }], {
                onPick: () => {
                    presentMenu({ includeExit: true });
                }
            });
        };

        const runRelatedFlow = async () => {
            if (flowBusy) return;
            flowBusy = true;

            try {
                const loading = showLoading();
                await new Promise((r) => setTimeout(r, prefersReducedMotion() ? 120 : 700));

                let items = [];
                try {
                    if (
                        !ctx.slug ||
                        !global.API ||
                        typeof global.API.getArticleBySlug !== 'function' ||
                        typeof global.API.getRelatedArticles !== 'function'
                    ) {
                        throw new Error('Contexto ou API indisponível');
                    }

                    const article = await global.API.getArticleBySlug(ctx.slug);
                    if (!article) {
                        throw new Error('Artigo não encontrado');
                    }

                    const related = await global.API.getRelatedArticles(
                        article,
                        RELATED_LIMIT
                    );
                    items = await padRelatedWithCategory(
                        article,
                        related,
                        RELATED_LIMIT
                    );
                } catch (err) {
                    console.error('[Mary] Artigos relacionados:', err);
                    items = [];
                }

                loading.remove();

                if (items.length) {
                    await say('Aqui vão alguns artigos relacionados 👇');
                    mountRelatedList(items);
                } else {
                    await say(
                        'Não encontrei artigos relacionados o suficiente para esta matéria.'
                    );
                }

                offerBackToMenu();
            } finally {
                flowBusy = false;
            }
        };

        const runSummarizeFlow = async () => {
            if (flowBusy) return;
            flowBusy = true;

            try {
                const loading = showLoading();
                await new Promise((r) => setTimeout(r, prefersReducedMotion() ? 120 : 700));
                loading.remove();

                // Já veio de "Resumir notícia" — entrega o resumo direto, sem pedir confirmação.
                await say('Aqui está o resumo da notícia 👇');
                await addSummaryCard(ctx.summary);

                const canListen =
                    (Boolean(ctx.audioSummaryUrl) &&
                        (ctx.audioStatus === 'ready' || !ctx.audioStatus));

                if (!canListen) {
                    await say('Infelizmente, não consigo enviar áudio no momento. 😔');
                    return;
                }

                await say('Quer que eu leia o resumo para você?');

                await new Promise((resolveListen) => {
                    addActions(
                        [
                            { id: 'listen-offer', label: 'Ouvir resumo' },
                            { id: 'listen-skip', label: 'Agora não' }
                        ],
                        {
                            onPick: async (item) => {
                                try {
                                    if (item.id === 'listen-offer') {
                                        await say(
                                            'Claro! Vou ler o resumo para você e mandar um áudio.'
                                        );
                                        setPresence('Gravando áudio', { recording: true });
                                        await new Promise((r) =>
                                            setTimeout(r, prefersReducedMotion() ? 1100 : 3400)
                                        );
                                        mountVoiceBubble();
                                        setPresence('Online', { recording: false });
                                    } else if (item.id === 'listen-skip') {
                                        await say(
                                            'Sem problemas! Se quiser ouvir depois, é só pedir.'
                                        );
                                    }
                                } finally {
                                    setPresence('Online', { recording: false });
                                    resolveListen();
                                }
                            }
                        }
                    );
                });
            } finally {
                flowBusy = false;
            }

            presentMenu({ exitOnly: true });
        };

        const ACTIONS = buildActions(ctx);
        ACTIONS.summarize.run = runSummarizeFlow;
        ACTIONS.related.run = runRelatedFlow;

        const availableActions = () =>
            Object.values(ACTIONS).filter((a) => a.available());

        let presentMenu = () => {};

        const startGreeting = async () => {
            if (greeted) return;
            greeted = true;
            await say(GREETING);
            presentMenu({ includeExit: true });
        };

        const hasActiveActions = () =>
            Boolean(messagesEl?.querySelector('.mary-chip:not([disabled])'));

        const clearChat = () => {
            typewriter.stop();
            if (speech && typeof speech.stop === 'function') speech.stop();
            speech = null;
            flowBusy = false;
            greeted = false;
            setPresence('Online', { recording: false });
            const scroller = messagesScroller();
            if (scroller) scroller.replaceChildren();
            if (
                messagesEl &&
                scroller !== messagesEl &&
                messagesEl.querySelector('.mary-msg')
            ) {
                messagesEl.querySelectorAll('.mary-msg').forEach((el) => el.remove());
            }
            if (global.SiteScrollbar && typeof global.SiteScrollbar.refresh === 'function') {
                global.SiteScrollbar.refresh();
            }
        };

        const setOpen = (next) => {
            const wasOpen = open;
            open = next;
            launcher?.setAttribute('aria-expanded', open ? 'true' : 'false');
            launcher?.setAttribute(
                'aria-label',
                open ? 'Fechar chat com Mary' : 'Abrir chat com Mary'
            );
            root.classList.toggle('is-open', open);

            if (open) {
                hideLauncherTip({ immediate: true });
                panel.hidden = false;
                requestAnimationFrame(() => {
                    root.classList.add('is-visible');
                });
                if (!greeted) {
                    /* Abertura vazia: seed “Oi” no composer; conversa só após o envio. */
                    playComposerSeed();
                } else if (!flowBusy && !hasActiveActions()) {
                    /* Após Sair (ou chips todos desabilitados), reoferece o menu. */
                    presentMenu({ includeExit: true });
                    (closeBtn || panel).focus({ preventScroll: true });
                } else {
                    (closeBtn || panel).focus({ preventScroll: true });
                }
            } else {
                root.classList.remove('is-visible');
                if (wasOpen) {
                    composerSeedToken += 1;
                    typewriter.stop({ reset: true, el: composerSurface });
                    clearChat();
                    resetComposerSurface();
                    setComposerSessionLocked(false);
                    if (composerSend) composerSend.disabled = true;
                }
                const onEnd = () => {
                    if (!open) panel.hidden = true;
                    panel.removeEventListener('transitionend', onEnd);
                };
                if (prefersReducedMotion()) {
                    panel.hidden = true;
                } else {
                    panel.addEventListener('transitionend', onEnd);
                    setTimeout(onEnd, 400);
                }
                launcher?.focus({ preventScroll: true });
            }
        };

        presentMenu = ({ includeExit = false, exitOnly = false } = {}) => {
            const items = exitOnly
                ? [
                      { id: 'restart', label: 'Recomeçar' },
                      { id: 'exit', label: 'Sair' }
                  ]
                : availableActions().map((a) => ({ id: a.id, label: a.label }));
            if (!exitOnly && includeExit) {
                items.push({ id: 'exit', label: 'Sair' });
            }
            if (!items.length) return;
            addActions(items, {
                onPick: async (item) => {
                    if (item.id === 'restart') {
                        clearChat();
                        resetComposerSurface();
                        setComposerSessionLocked(true);
                        await startGreeting();
                        return;
                    }
                    if (item.id === 'exit') {
                        await say('Até logo! Qualquer coisa, estou por aqui. 😊');
                        setOpen(false);
                        return;
                    }
                    const action = ACTIONS[item.id];
                    if (action && typeof action.run === 'function') action.run();
                }
            });
        };

        const onLauncherClick = () => setOpen(!open);
        const onCloseClick = () => setOpen(false);

        const submitComposer = async () => {
            if (composerLocked || !composerSeedReady) return;
            const text = COMPOSER_SEED_TEXT;
            resetComposerSurface();
            appendUserMessage(text);
            setComposerSessionLocked(true);
            await startGreeting();
        };

        const onComposerSubmit = (e) => {
            e.preventDefault();
            submitComposer();
        };

        const onComposerKeydown = (e) => {
            if (e.key !== 'Enter' || e.shiftKey) return;
            if (composerLocked || !composerSeedReady) return;
            e.preventDefault();
            submitComposer();
        };

        const onPointerDownOutside = (e) => {
            if (!open) return;
            const target = e.target;
            if (!(target instanceof Node)) return;
            if (panel.contains(target)) return;
            if (launcher && launcher.contains(target)) return;
            setOpen(false);
        };

        const onKeydown = (e) => {
            if (!open) return;
            if (e.key === 'Escape') {
                e.preventDefault();
                setOpen(false);
            }
        };

        resetComposerSurface();
        setComposerSessionLocked(false);
        if (composerSend) composerSend.disabled = true;

        composerForm?.addEventListener('submit', onComposerSubmit);
        composerForm?.addEventListener('keydown', onComposerKeydown);

        launcher?.addEventListener('click', onLauncherClick);
        closeBtn?.addEventListener('click', onCloseClick);
        document.addEventListener('pointerdown', onPointerDownOutside, true);
        document.addEventListener('keydown', onKeydown);

        showLauncherTip();

        const destroy = () => {
            tipDead = true;
            clearLauncherTipTimers();
            launcher?.classList.remove('is-tip-active');
            maryExpandedObserver.disconnect();
            window.removeEventListener('scroll', updateMaryPosition);
            window.removeEventListener('resize', updateMaryPosition);
            cleanupOrbVideos();
            if (speech) speech.stop();
            typewriter.stop();
            document.removeEventListener('keydown', onKeydown);
            document.removeEventListener('pointerdown', onPointerDownOutside, true);
            launcher?.removeEventListener('click', onLauncherClick);
            closeBtn?.removeEventListener('click', onCloseClick);
            composerForm?.removeEventListener('submit', onComposerSubmit);
            composerForm?.removeEventListener('keydown', onComposerKeydown);
            if (root.parentNode) root.parentNode.removeChild(root);
        };

        return {
            destroy,
            open: () => setOpen(true),
            close: () => setOpen(false),
            player: {
                el: root.querySelector('#mary-audio-player'),
                miniEl: root.querySelector('#mary-player-mini'),
                expandedEl: root.querySelector('#mary-player-expanded'),
                expandBtn: root.querySelector('.mary-player-mini__expand-btn'),
                collapseBtn: root.querySelector('#mary-player-collapse'),
                ambientBg: root.querySelector('#mary-player-ambient-bg'),

                cover: makeSyncElement([root.querySelector('#mary-player-bg-cover-mini'), root.querySelector('#mary-player-cover-expanded')]),
                title: makeSyncElement([root.querySelector('#mary-player-title-mini'), root.querySelector('#mary-player-title-expanded')]),
                author: makeSyncElement([root.querySelector('#mary-player-author-mini'), root.querySelector('#mary-player-author-expanded')]),
                playBtn: makeSyncElement([root.querySelector('#mary-player-play-mini'), root.querySelector('#mary-player-play-expanded')]),

                prevBtn: root.querySelector('#mary-player-prev'),
                nextBtn: root.querySelector('#mary-player-next'),
                shareBtn: makeSyncElement([root.querySelector('#mary-player-share')]),
                favBtn: root.querySelector('#mary-player-favorite'),
                favIcon: root.querySelector('#mary-player-favorite-icon'),
                favCount: root.querySelector('#mary-player-favorite-count'),

                progressFill: makeSyncElement([root.querySelector('#mary-player-progress-fill-mini'), root.querySelector('#mary-player-progress-fill-expanded')]),
                progressTrack: makeSyncElement([root.querySelector('#mary-player-progress-track-mini'), root.querySelector('#mary-player-progress-track-expanded')]),

                timeCurrent: makeSyncElement([root.querySelector('#mary-player-time-current-mini'), root.querySelector('#mary-player-time-current-expanded')]),
                timeRemaining: makeSyncElement([root.querySelector('#mary-player-time-remaining-mini'), root.querySelector('#mary-player-time-remaining-expanded')]),

                seekBackBtn: root.querySelector('#mary-player-seek-back'),
                seekForwardBtn: root.querySelector('#mary-player-seek-forward'),
                speedControl: root.querySelector('#mary-speed-control')
            }
        };
    }

    function mount(options) {
        const instance = createMary(options || {});
        if (!instance) return null;
        activeInstance = instance;
        return instance;
    }

    function unmount() {
        if (activeInstance && typeof activeInstance.destroy === 'function') {
            activeInstance.destroy();
        }
        activeInstance = null;
        const leftover = document.getElementById(ROOT_ID);
        if (leftover && leftover.parentNode) leftover.parentNode.removeChild(leftover);
    }

    global.Mary = {
        mount,
        unmount,
        get active() { return activeInstance; }
    };
})(typeof window !== 'undefined' ? window : globalThis);
