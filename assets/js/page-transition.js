/**
 * Transição de página “data stream” QT — overlay CSS leve em navegações MPA.
 * Saída: 2 rAF → véu (~180ms) → assign + flag.
 * Chegada: html.qt-arrive::before no <head> (antes do first paint); JS só limpa.
 */
(function (global) {
    const OVERLAY_ID = 'qt-page-stream';
    const COLUMN_COUNT = 16;
    const NAV_DELAY_MS = 180;
    const SAFETY_MS = 4000;
    const ARRIVE_FLAG = 'qt-stream-arrive';
    const ARRIVE_CLASS = 'qt-arrive';

    let active = false;
    let bound = false;
    let safetyTimer = null;
    let navTimer = null;

    function prefersReducedMotion() {
        return (
            typeof global.matchMedia === 'function' &&
            global.matchMedia('(prefers-reduced-motion: reduce)').matches
        );
    }

    function isActive() {
        return active;
    }

    function clearTimers() {
        if (safetyTimer) {
            clearTimeout(safetyTimer);
            safetyTimer = null;
        }
        if (navTimer) {
            clearTimeout(navTimer);
            navTimer = null;
        }
    }

    function resumeLiquid() {
        try {
            if (global.LiquidDistortion && typeof global.LiquidDistortion.resumeAll === 'function') {
                global.LiquidDistortion.resumeAll();
            }
        } catch (_) {
            /* ignore */
        }
    }

    function cleanup() {
        active = false;
        clearTimers();
        const el = document.getElementById(OVERLAY_ID);
        if (el && el.parentNode) el.parentNode.removeChild(el);
        document.documentElement.classList.remove('qt-page-stream-active');
        resumeLiquid();
    }

    function clearArriveClass() {
        const root = document.documentElement;
        const critical = document.getElementById('qt-arrive-critical');
        if (!root.classList.contains(ARRIVE_CLASS) && !critical) return;

        const finish = () => {
            root.classList.remove(ARRIVE_CLASS);
            if (critical && critical.parentNode) critical.parentNode.removeChild(critical);
        };

        if (!root.classList.contains(ARRIVE_CLASS)) {
            finish();
            return;
        }

        const onEnd = (ev) => {
            if (ev.animationName && ev.animationName !== 'qt-arrive-out') return;
            root.removeEventListener('animationend', onEnd);
            finish();
        };
        root.addEventListener('animationend', onEnd);
        /* Guarda: animationend no ::before pode não bubblar em todos os browsers */
        global.setTimeout(() => {
            root.removeEventListener('animationend', onEnd);
            finish();
        }, 320);
    }

    function setArriveFlag() {
        try {
            global.sessionStorage.setItem(ARRIVE_FLAG, '1');
        } catch (_) {
            /* private mode / blocked storage */
        }
    }

    function buildColumnText(len) {
        const parts = [];
        for (let i = 0; i < len; i++) {
            const r = Math.random();
            if (r < 0.07) parts.push(Math.random() < 0.5 ? 'Q' : 'T');
            else if (r < 0.42) parts.push(Math.random() < 0.5 ? '0' : '1');
            else if (r < 0.68) parts.push('·');
            else if (r < 0.84) parts.push('—');
            else if (r < 0.93) parts.push('|');
            else parts.push('/');
        }
        return parts.join('\n');
    }

    function pauseLiquid() {
        try {
            if (global.LiquidDistortion && typeof global.LiquidDistortion.pauseAll === 'function') {
                global.LiquidDistortion.pauseAll();
                return;
            }
            document.querySelectorAll('.massive-brand-text').forEach((el) => {
                const inst = el.__liquidInstance;
                if (inst && typeof inst.pause === 'function') inst.pause();
            });
        } catch (_) {
            /* ignore */
        }
    }

    function ensureOverlay() {
        let root = document.getElementById(OVERLAY_ID);
        if (root) return root;

        root = document.createElement('div');
        root.id = OVERLAY_ID;
        root.className = 'qt-page-stream';
        root.setAttribute('aria-hidden', 'true');
        root.setAttribute('role', 'presentation');

        const inner = document.createElement('div');
        inner.className = 'qt-page-stream-cols';

        for (let i = 0; i < COLUMN_COUNT; i++) {
            const col = document.createElement('span');
            col.className = 'qt-page-stream-col';
            col.setAttribute('aria-hidden', 'true');
            const len = 12 + Math.floor(Math.random() * 14);
            col.textContent = buildColumnText(len);
            inner.appendChild(col);
        }

        root.appendChild(inner);
        document.body.appendChild(root);
        return root;
    }

    function assign(url) {
        try {
            global.location.assign(url);
        } catch (_) {
            global.location.href = url;
        }
    }

    function go(url) {
        if (!url || active) return;

        let targetHref = String(url);
        let sameDocument = false;
        try {
            const target = new URL(url, global.location.href);
            targetHref = target.href;
            sameDocument = targetHref === global.location.href;
        } catch (_) {
            /* raw string fallback */
        }

        if (prefersReducedMotion()) {
            if (sameDocument) global.location.reload();
            else assign(targetHref);
            return;
        }

        active = true;
        pauseLiquid();
        document.documentElement.classList.add('qt-page-stream-active');
        const overlay = ensureOverlay();
        overlay.classList.remove('is-on', 'is-running');

        clearTimers();
        safetyTimer = setTimeout(cleanup, SAFETY_MS);

        /* 1º rAF: paint do overlay em opacity 0; 2º rAF: inicia animação e o delay de assign */
        requestAnimationFrame(() => {
            if (!active) return;
            requestAnimationFrame(() => {
                if (!active) return;
                overlay.classList.add('is-on', 'is-running');

                navTimer = setTimeout(() => {
                    navTimer = null;
                    setArriveFlag();
                    if (sameDocument) global.location.reload();
                    else assign(targetHref);
                }, NAV_DELAY_MS);
            });
        });
    }

    function isSelfHandledLink(link) {
        if (link.closest('#mobileMenu')) return true;
        if (link.classList.contains('main-header-logo')) return true;
        if (link.classList.contains('mobile-menu-logo')) return true;
        if (link.classList.contains('qt-footer-brand-link')) return true;
        if (link.classList.contains('login-brand-logo')) return true;
        return false;
    }

    function isEligibleLink(link, event) {
        if (!link || typeof link.getAttribute !== 'function') return false;
        if (event.defaultPrevented) return false;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
        if (event.button != null && event.button !== 0) return false;
        if (link.target && link.target !== '' && link.target !== '_self') return false;
        if (link.hasAttribute('download')) return false;

        const href = link.getAttribute('href');
        if (!href) return false;
        const trimmed = String(href).trim();
        if (!trimmed || trimmed.startsWith('javascript:')) return false;
        if (trimmed.startsWith('mailto:') || trimmed.startsWith('tel:')) return false;
        if (trimmed.startsWith('#')) return false;
        if (isSelfHandledLink(link)) return false;

        let url;
        try {
            url = new URL(trimmed, global.location.href);
        } catch (_) {
            return false;
        }
        if (url.origin !== global.location.origin) return false;

        if (
            url.pathname === global.location.pathname &&
            url.search === global.location.search &&
            url.hash &&
            url.hash !== global.location.hash
        ) {
            return false;
        }

        return true;
    }

    function onClick(event) {
        if (active) {
            event.preventDefault();
            return;
        }
        const link =
            event.target && event.target.closest ? event.target.closest('a[href]') : null;
        if (!isEligibleLink(link, event)) return;
        event.preventDefault();
        go(link.href);
    }

    function onPageShow(event) {
        /* bfcache: página já pintada — só limpa residual, sem véu */
        if (event && event.persisted) {
            cleanup();
            document.documentElement.classList.remove(ARRIVE_CLASS);
            const critical = document.getElementById('qt-arrive-critical');
            if (critical && critical.parentNode) critical.parentNode.removeChild(critical);
            return;
        }
        if (!active) cleanup();
    }

    function bind() {
        if (bound) return;
        bound = true;
        document.addEventListener('click', onClick, true);
        global.addEventListener('pagehide', cleanup);
        global.addEventListener('pageshow', onPageShow);
        /* Flag já consumida no <head>; aqui só limpa a classe após a animação CSS */
        clearArriveClass();
    }

    global.SitePageTransition = {
        bind,
        go,
        isActive,
        cleanup
    };
})(window);
