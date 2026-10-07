/**
 * Faixa discreta de instalação PWA nas páginas públicas.
 * Chromium: beforeinstallprompt real. iOS/iPadOS Safari: orientação A2HS.
 * “Agora não” = soft dismiss (só nesta página). Instalação concluída = localStorage.
 */
(function (global) {
    const STORAGE_KEY = 'qualquer-tecla-pwa-install-dismissed';
    const ROOT_ID = 'qt-pwa-install';

    let deferredPrompt = null;
    let rootEl = null;
    let listenersBound = false;
    let swRegisterStarted = false;
    let appleMetasEnsured = false;
    let installInFlight = false;
    let softDismissed = false;

    function readInstalled() {
        try {
            return localStorage.getItem(STORAGE_KEY) === '1';
        } catch (_) {
            return false;
        }
    }

    function persistInstalled() {
        try {
            localStorage.setItem(STORAGE_KEY, '1');
        } catch (_) {
            /* private mode */
        }
    }

    function isStandalone() {
        try {
            if (global.matchMedia && global.matchMedia('(display-mode: standalone)').matches) {
                return true;
            }
        } catch (_) {
            /* ignore */
        }
        return global.navigator && global.navigator.standalone === true;
    }

    function canShow() {
        return !isStandalone() && !readInstalled() && !softDismissed;
    }

    function isIosA2hsEligible() {
        const nav = global.navigator || {};
        const ua = String(nav.userAgent || '');
        const platform = String(nav.platform || '');
        const maxTouch = Number(nav.maxTouchPoints) || 0;

        if (/Android/i.test(ua)) return false;

        const isAppleMobile = /iPhone|iPad|iPod/i.test(ua);
        const isIpadOsDesktop = platform === 'MacIntel' && maxTouch > 1;
        if (!isAppleMobile && !isIpadOsDesktop) return false;

        /* Safari/WebKit apropriado — não Chrome/Firefox/Edge/Opera no iOS */
        if (/CriOS|FxiOS|EdgiOS|OPiOS|OPT\//i.test(ua)) return false;

        return true;
    }

    function ensureAppleMetas() {
        if (appleMetasEnsured || !document.head) return;
        appleMetasEnsured = true;

        if (!document.querySelector('meta[name="apple-mobile-web-app-capable"]')) {
            const capable = document.createElement('meta');
            capable.setAttribute('name', 'apple-mobile-web-app-capable');
            capable.setAttribute('content', 'yes');
            document.head.appendChild(capable);
        }

        if (!document.querySelector('meta[name="apple-mobile-web-app-title"]')) {
            const title = document.createElement('meta');
            title.setAttribute('name', 'apple-mobile-web-app-title');
            title.setAttribute('content', 'Qualquer Tecla');
            document.head.appendChild(title);
        }
    }

    function registerServiceWorker() {
        if (swRegisterStarted) return;
        if (!('serviceWorker' in navigator)) return;
        swRegisterStarted = true;
        try {
            navigator.serviceWorker.register('/sw.js').catch(function () {
                /* registro falhou — silencioso */
            });
        } catch (_) {
            /* ignore */
        }
    }

    function removeStrip() {
        if (!rootEl) {
            const existing = document.getElementById(ROOT_ID);
            if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
        } else if (rootEl.parentNode) {
            rootEl.parentNode.removeChild(rootEl);
        }
        rootEl = null;
        const header = document.getElementById('app-header');
        if (header) header.style.removeProperty('top');
    }

    function dismissSoft() {
        softDismissed = true;
        removeStrip();
    }

    function iconUrl() {
        const base = global.SITE_BASE || '';
        return `${base}assets/img/brand/qt-favicon-32x32.png`;
    }

    function buildStrip(variant) {
        const wrap = document.createElement('div');
        wrap.id = ROOT_ID;
        wrap.className = 'qt-pwa-install';
        wrap.setAttribute('role', 'region');
        wrap.setAttribute('aria-label', 'Instalar aplicativo');
        wrap.dataset.variant = variant;

        const inner = document.createElement('div');
        inner.className = 'qt-pwa-install__inner';

        const message = document.createElement('div');
        message.className = 'qt-pwa-install__message';

        const icon = document.createElement('img');
        icon.className = 'qt-pwa-install__icon';
        icon.src = iconUrl();
        icon.alt = '';
        icon.width = 20;
        icon.height = 20;
        icon.decoding = 'async';
        icon.setAttribute('aria-hidden', 'true');

        const copyWrap = document.createElement('div');
        copyWrap.className = 'qt-pwa-install__copy-wrap';

        const copy = document.createElement('p');
        copy.className = 'qt-pwa-install__copy';
        copy.id = 'qt-pwa-install-copy';
        copy.tabIndex = -1;
        // Mesmo texto em todos os casos — sem instrução específica de navegador.
        copy.textContent = 'Instale o Qualquer Tecla';

        copyWrap.appendChild(copy);
        message.appendChild(icon);
        message.appendChild(copyWrap);

        const actions = document.createElement('div');
        actions.className = 'qt-pwa-install__actions';

        const narrow =
            typeof global.matchMedia === 'function' &&
            global.matchMedia('(max-width: 575.98px)').matches;

        // Sempre mostra o CTA dourado. Chromium: prompt nativo. iOS: destaca o passo a passo.
        // Em mobile o rótulo curto evita cortar "Instale o Qualquer Tecla".
        const installBtn = document.createElement('button');
        installBtn.type = 'button';
        installBtn.className = 'btn btn-gold qt-pwa-install__install';
        installBtn.textContent = narrow ? 'Instalar' : 'Instalar app';
        if (variant === 'chromium') {
            installBtn.addEventListener('click', onInstallClick);
        } else {
            installBtn.setAttribute('aria-describedby', 'qt-pwa-install-copy');
            installBtn.addEventListener('click', function () {
                copy.classList.remove('is-hint');
                void copy.offsetWidth;
                copy.classList.add('is-hint');
                try {
                    copy.focus({ preventScroll: true });
                } catch (_) {
                    /* ignore */
                }
            });
        }
        actions.appendChild(installBtn);

        const dismissBtn = document.createElement('button');
        dismissBtn.type = 'button';
        dismissBtn.className = 'qt-pwa-install__dismiss';
        dismissBtn.textContent = 'Agora não';
        dismissBtn.addEventListener('click', dismissSoft);
        actions.appendChild(dismissBtn);

        inner.appendChild(message);
        inner.appendChild(actions);
        wrap.appendChild(inner);
        return wrap;
    }

    function showStrip(variant) {
        if (!canShow()) return;
        if (variant !== 'chromium' && variant !== 'ios') return;
        if (variant === 'chromium' && !deferredPrompt) return;

        const existing = rootEl || document.getElementById(ROOT_ID);
        if (existing) {
            if (!existing.isConnected) {
                rootEl = null;
            } else if (existing.dataset.variant === variant) {
                rootEl = existing;
                return;
            } else {
                removeStrip();
            }
        }

        const header = document.getElementById('app-header');
        if (!header || !header.parentNode) return;

        rootEl = buildStrip(variant);
        header.parentNode.insertBefore(rootEl, header);
        syncHeaderOffset();
        requestAnimationFrame(syncHeaderOffset);
    }

    function syncHeaderOffset() {
        const strip = rootEl || document.getElementById(ROOT_ID);
        const header = document.getElementById('app-header');
        if (!header) return;
        if (!strip) {
            header.style.removeProperty('top');
            return;
        }
        const h = Math.ceil(strip.getBoundingClientRect().height);
        if (h > 0) header.style.top = h + 'px';
    }

    async function onInstallClick() {
        if (installInFlight || !deferredPrompt) return;
        installInFlight = true;
        const promptEvent = deferredPrompt;
        try {
            promptEvent.prompt();
            const choice = await promptEvent.userChoice;
            /* Evento consumido — só pode prompt() uma vez */
            deferredPrompt = null;
            if (choice && choice.outcome === 'accepted') {
                persistInstalled();
                removeStrip();
            }
            /* cancelamento: faixa permanece; nova tentativa quando o browser reenviar o evento */
        } catch (_) {
            deferredPrompt = null;
        } finally {
            installInFlight = false;
        }
    }

    function bindGlobalListeners() {
        if (listenersBound) return;
        listenersBound = true;

        global.addEventListener('beforeinstallprompt', function (event) {
            event.preventDefault();
            deferredPrompt = event;
            if (!canShow()) return;
            if (isIosA2hsEligible()) return;
            showStrip('chromium');
        });

        global.addEventListener('appinstalled', function () {
            deferredPrompt = null;
            persistInstalled();
            removeStrip();
        });

        global.addEventListener('resize', function () {
            if (rootEl || document.getElementById(ROOT_ID)) syncHeaderOffset();
        });
    }

    function mount() {
        ensureAppleMetas();
        registerServiceWorker();
        bindGlobalListeners();

        if (!canShow()) {
            removeStrip();
            return;
        }

        if (isIosA2hsEligible()) {
            showStrip('ios');
            return;
        }

        if (deferredPrompt) {
            showStrip('chromium');
        }
    }

    global.SitePwaInstall = {
        STORAGE_KEY: STORAGE_KEY,
        mount: mount
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mount, { once: true });
    } else {
        mount();
    }
})(window);
