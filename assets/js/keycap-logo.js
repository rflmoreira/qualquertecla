/**
 * Orquestrador da keycap QT — WebGL (base) + PNG gerado (keycap), pressão e sons.
 */
(function (global) {
    const BOUND = 'data-keycap-bound';
    const MOUNTED = 'data-keycap-3d';
    const CACHE = '20260920canonical';

    let modulePromise = null;
    let keycap3d = null;
    let audioCtx = null;
    let pressBuffer = null;
    let releaseBuffer = null;
    let loadPromise = null;
    /** Press pendente se o usuário clicar antes do mount 3D. */
    let pendingPress = false;

    function assetBase() {
        return global.SITE_BASE || '';
    }

    function assetUrl(path) {
        return new URL(`${assetBase()}${path}`, global.location.href).href;
    }

    function moduleUrl() {
        return assetUrl(`assets/js/keycap-3d.js?v=${CACHE}`);
    }

    function loadModule() {
        if (modulePromise) return modulePromise;
        modulePromise = import(moduleUrl());
        return modulePromise;
    }

    function prefersReducedMotion() {
        return (
            typeof matchMedia === 'function' &&
            matchMedia('(prefers-reduced-motion: reduce)').matches
        );
    }

    const GO_TOP_KEY = 'qt-logo-go-top';

    function markGoTopOnNextLoad() {
        try {
            sessionStorage.setItem(GO_TOP_KEY, '1');
        } catch (_) {
            /* ignore */
        }
    }

    function consumeGoTopOnLoad() {
        let shouldGo = false;
        try {
            shouldGo = sessionStorage.getItem(GO_TOP_KEY) === '1';
            if (shouldGo) sessionStorage.removeItem(GO_TOP_KEY);
        } catch (_) {
            return;
        }
        if (!shouldGo) return;

        const go = () => {
            try {
                if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
            } catch (_) {
                /* ignore */
            }
            global.scrollTo(0, 0);
        };
        go();
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', go, { once: true });
        }
        global.addEventListener('load', go, { once: true });
    }

    /** Normaliza / e /index.html para comparar a mesma página. */
    function documentKey(url) {
        let path = String(url.pathname || '/').replace(/\/index\.html$/i, '/');
        if (path.length > 1) path = path.replace(/\/+$/, '');
        if (!path) path = '/';
        return `${url.origin}${path}${url.search || ''}`;
    }

    function scrollPageToTop() {
        if (prefersReducedMotion()) {
            global.scrollTo(0, 0);
        } else {
            global.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    consumeGoTopOnLoad();


    function shouldDisable3D() {
        const conn =
            navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        return !!(conn && conn.saveData);
    }

    function scheduleMount(host) {
        if (!host || host.getAttribute(MOUNTED) === '1') return;

        /* Login: sem WebGL / pressão — só PNG estática */
        if (host.closest('.login-brand-logo')) {
            host.classList.add('qt-keycap-static');
            return;
        }

        if (shouldDisable3D()) {
            host.classList.add('qt-keycap-static');
            return;
        }

        const run = () => {
            loadModule()
                .then(async (mod) => {
                    keycap3d = mod;
                    const ok = await mod.mount(host);
                    if (ok) {
                        host.setAttribute(MOUNTED, '1');
                        if (pendingPress && typeof mod.press === 'function') {
                            mod.press();
                        }
                    } else {
                        host.classList.add('qt-keycap-static');
                    }
                })
                .catch(() => {
                    host.classList.add('qt-keycap-static');
                });
        };

        if (typeof global.requestIdleCallback === 'function') {
            global.requestIdleCallback(run, { timeout: 2000 });
        } else {
            setTimeout(run, 300);
        }
    }

    function mountAll(root) {
        const scope = root && root.querySelectorAll ? root : document;
        scope.querySelectorAll('.main-header-logo-keycap').forEach(scheduleMount);
    }

    function ensureAudio() {
        if (prefersReducedMotion()) return Promise.resolve();
        if (loadPromise) return loadPromise;
        loadPromise = (async () => {
            try {
                const AC = global.AudioContext || global.webkitAudioContext;
                if (!AC) return;
                audioCtx = audioCtx || new AC();
                if (audioCtx.state === 'suspended') {
                    await audioCtx.resume().catch(() => {});
                }
                const [pressRes, releaseRes] = await Promise.all([
                    fetch(assetUrl('assets/audio/qt-keycap-press.mp3')),
                    fetch(assetUrl('assets/audio/qt-keycap-release.mp3')),
                ]);
                if (pressRes.ok) {
                    pressBuffer = await audioCtx.decodeAudioData(
                        (await pressRes.arrayBuffer()).slice(0)
                    );
                }
                if (releaseRes.ok) {
                    releaseBuffer = await audioCtx.decodeAudioData(
                        (await releaseRes.arrayBuffer()).slice(0)
                    );
                }
            } catch (_) {
                /* animação segue sem som */
            }
        })();
        return loadPromise;
    }

    function playBuffer(buffer) {
        try {
            if (prefersReducedMotion()) return;
            if (!audioCtx || !buffer) return;
            if (audioCtx.state === 'suspended') {
                audioCtx.resume().catch(() => {});
            }
            const source = audioCtx.createBufferSource();
            source.buffer = buffer;
            source.detune.value = Math.random() * 200 - 100;
            const gain = audioCtx.createGain();
            gain.gain.value = 0.4;
            source.connect(gain);
            gain.connect(audioCtx.destination);
            source.start(0);
        } catch (_) {
            /* ignore */
        }
    }

    function bindOne(logo) {
        if (!logo || logo.getAttribute(BOUND) === '1') return;
        logo.setAttribute(BOUND, '1');

        const getKeycapHost = () => logo.querySelector('.main-header-logo-keycap');
        const quiet = logo.classList.contains('login-brand-logo');

        /* Login: keycap estática, sem interação / navegação */
        if (quiet) {
            const host = getKeycapHost();
            if (host) host.classList.add('qt-keycap-static');
            return;
        }

        let pressed = false;

        const setPressed = (on) => {
            if (!getKeycapHost()) return;
            pressed = !!on;
            pendingPress = pressed;
        };

        const onDown = (e) => {
            if (e.button != null && e.button !== 0) return;
            setPressed(true);
            const host = getKeycapHost();
            if (keycap3d && typeof keycap3d.press === 'function') {
                keycap3d.press(host);
            }
            ensureAudio().then(() => playBuffer(pressBuffer));
        };

        const onUp = () => {
            if (!pressed) return;
            setPressed(false);
            const host = getKeycapHost();
            if (keycap3d && typeof keycap3d.release === 'function') {
                keycap3d.release(host);
            }
            ensureAudio().then(() => playBuffer(releaseBuffer));
        };

        const onEnter = () => {
            const host = getKeycapHost();
            if (keycap3d && typeof keycap3d.hover === 'function') {
                keycap3d.hover(host, true);
            }
        };

        const onLeave = () => {
            onUp();
            const host = getKeycapHost();
            if (keycap3d && typeof keycap3d.hover === 'function') {
                keycap3d.hover(host, false);
            }
        };

        const onKeyDown = (e) => {
            /* Space: feedback de pressão sem scroll. */
            if (e.key === ' ') {
                if (e.repeat) return;
                e.preventDefault();
                onDown({ button: 0 });
            }
        };

        const onKeyUp = (e) => {
            if (e.key === ' ') {
                e.preventDefault();
                onUp();
            }
        };

        let navigating = false;

        const onClick = (e) => {
            /* Permitir aberturas em nova aba com modificadores ou botão direito/meio */
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || (e.button != null && e.button !== 0)) {
                return;
            }

            const href = logo.getAttribute('href');
            if (!href || href.startsWith('#')) return;

            e.preventDefault();

            if (navigating) return;
            navigating = true;

            const host = getKeycapHost();
            /* Se acionado por teclado (Enter), executa a animação completa de pressão e retorno */
            if (keycap3d) {
                if (!pressed && typeof keycap3d.press === 'function') {
                    keycap3d.press(host);
                    ensureAudio().then(() => playBuffer(pressBuffer));
                }
                setTimeout(() => {
                    if (typeof keycap3d.release === 'function') {
                        keycap3d.release(host);
                    }
                    ensureAudio().then(() => playBuffer(releaseBuffer));
                }, 90);
            }

            const navigate = () => {
                try {
                    const targetUrl = new URL(href, global.location.href);
                    const here = new URL(global.location.href);
                    if (documentKey(targetUrl) === documentKey(here)) {
                        scrollPageToTop();
                        navigating = false;
                        return;
                    }
                    /* Próxima carga (home) deve abrir no topo, sem restaurar scroll antigo */
                    markGoTopOnNextLoad();
                    if (global.SitePageTransition && typeof global.SitePageTransition.go === 'function') {
                        global.SitePageTransition.go(targetUrl.href);
                    } else {
                        global.location.href = targetUrl.href;
                    }
                } catch (_) {
                    markGoTopOnNextLoad();
                    if (global.SitePageTransition && typeof global.SitePageTransition.go === 'function') {
                        global.SitePageTransition.go(href);
                    } else {
                        global.location.href = href;
                    }
                }
            };

            const offcanvas = document.getElementById('mobileMenu');
            const isMenuOpen = offcanvas && offcanvas.classList.contains('show');

            if (isMenuOpen) {
                // No menu hambúrguer, aguarda o feedback inicial de pressão da tecla (~140ms)
                // e então fecha a gaveta, aguardando a animação terminar completamente antes de recarregar/navegar
                setTimeout(() => {
                    if (global.SiteLayout && typeof global.SiteLayout.closeMobileMenuThen === 'function') {
                        global.SiteLayout.closeMobileMenuThen(navigate);
                    } else {
                        let done = false;
                        const finish = () => {
                            if (done) return;
                            done = true;
                            offcanvas.removeEventListener('hidden.bs.offcanvas', finish);
                            navigate();
                        };
                        offcanvas.addEventListener('hidden.bs.offcanvas', finish, { once: true });
                        setTimeout(finish, 550);
                        try {
                            const inst =
                                global.bootstrap?.Offcanvas?.getInstance(offcanvas) ||
                                global.bootstrap?.Offcanvas?.getOrCreateInstance(offcanvas);
                            inst?.hide();
                        } catch (_) {
                            finish();
                        }
                    }
                }, 140);
            } else {
                const delayMs = prefersReducedMotion() ? 120 : 380;
                setTimeout(navigate, delayMs);
            }
        };

        logo.addEventListener('pointerdown', onDown);
        logo.addEventListener('pointerup', onUp);
        logo.addEventListener('pointerenter', onEnter);
        logo.addEventListener('pointerleave', onLeave);
        logo.addEventListener('pointercancel', onUp);
        logo.addEventListener('blur', onUp);
        logo.addEventListener('keydown', onKeyDown);
        logo.addEventListener('keyup', onKeyUp);
        logo.addEventListener('click', onClick);
    }

    function bind(root) {
        mountAll(root);
        const scope = root && root.querySelectorAll ? root : document;
        scope
            .querySelectorAll(
                '.main-header-logo, .mobile-menu-logo, .qt-footer-brand-link, .login-brand-logo'
            )
            .forEach(bindOne);

        const offcanvas = document.getElementById('mobileMenu');
        if (offcanvas && offcanvas.getAttribute('data-keycap-bound') !== '1') {
            offcanvas.setAttribute('data-keycap-bound', '1');
            offcanvas.addEventListener('shown.bs.offcanvas', () => {
                const host = offcanvas.querySelector('.main-header-logo-keycap');
                if (host && keycap3d && typeof keycap3d.resizeInstance === 'function') {
                    keycap3d.resizeInstance(host);
                }
            });
        }
    }

    global.KeycapLogo = { bind };
})(window);
