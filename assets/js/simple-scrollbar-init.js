/**
 * Integração Simple Scrollbar 0.4.0 nas páginas públicas.
 * Expõe window.SiteScrollbar — não altera a biblioteca vendor.
 */
(function (global) {
    'use strict';

    const PAGE_ID = 'page-scroll';
    const INNER_SELECTORS = [
        '.mobile-menu-nav',
        '.comments-panel-scroll',
        '.mary-panel__messages',
        '.consent-panel.is-expanded'
    ];

    const PORTAL_IDS = {
        'app-mobile-menu': true,
        'app-search': true,
        'comments-root': true,
        consentRoot: true,
        'mary-root': true,
        [PAGE_ID]: true
    };

    let started = false;
    let pageBridgeInstalled = false;
    let lockBound = false;
    let pageLockCount = 0;
    let nativeScrollTo = null;
    let nativeScrollBy = null;
    let nativeScrollYDesc = null;
    let nativePageYOffsetDesc = null;

    function isAdmin() {
        return Boolean(document.body && document.body.classList.contains('admin-page'));
    }

    function api() {
        return global.SimpleScrollbar || null;
    }

    function isInited(el) {
        return Boolean(el && Object.prototype.hasOwnProperty.call(el, 'data-simple-scrollbar'));
    }

    function instanceOf(el) {
        return isInited(el) ? el['data-simple-scrollbar'] : null;
    }

    function getPageRoot() {
        return document.getElementById(PAGE_ID);
    }

    function getPageScroller() {
        const root = getPageRoot();
        if (!root) return null;
        return root.querySelector(':scope > .ss-wrapper > .ss-content');
    }

    function getScroller(host) {
        if (!host) return null;
        if (host.classList.contains('ss-content')) return host;
        const inner = host.querySelector(':scope > .ss-wrapper > .ss-content');
        return inner || host;
    }

    function moveBar(el) {
        const inst = instanceOf(el);
        if (inst && typeof inst.moveBar === 'function') inst.moveBar();
    }

    function initElSafe(el) {
        const SS = api();
        if (!SS || !el || isInited(el)) return false;
        if (typeof SS.initEl !== 'function') return false;
        SS.initEl(el);
        return true;
    }

    function shouldKeepOutside(node) {
        if (!node || node.nodeType !== 1) return false;
        if (node.tagName === 'SCRIPT') return true;
        if (node.id && PORTAL_IDS[node.id]) return true;
        return false;
    }

    function portalNodes() {
        const ids = [
            'app-mobile-menu',
            'app-search',
            'comments-root',
            'consentRoot',
            'mary-root'
        ];
        const nodes = [];
        for (let i = 0; i < ids.length; i += 1) {
            const el = document.getElementById(ids[i]);
            if (el) nodes.push(el);
        }
        return nodes;
    }

    /**
     * Garante que portais nunca fiquem dentro de #page-scroll
     * (nem após wraps da SimpleScrollbar / mounts tardios).
     */
    function ensurePortalsOutside(pageRoot) {
        const body = document.body;
        if (!body || !pageRoot) return;

        const portals = portalNodes();
        for (let i = 0; i < portals.length; i += 1) {
            const portal = portals[i];
            if (!pageRoot.contains(portal)) continue;
            if (pageRoot.nextSibling) {
                body.insertBefore(portal, pageRoot.nextSibling);
            } else {
                body.appendChild(portal);
            }
        }
    }

    function ensurePageRoot() {
        let root = getPageRoot();
        const body = document.body;
        if (!body) return null;

        if (!root) {
            root = document.createElement('div');
            root.id = PAGE_ID;

            const children = Array.from(body.childNodes);
            body.insertBefore(root, body.firstChild);

            for (let i = 0; i < children.length; i += 1) {
                const node = children[i];
                if (node === root) continue;
                if (shouldKeepOutside(node)) continue;
                if (
                    node.nodeType === 1 &&
                    node.closest &&
                    node.closest(
                        '#app-mobile-menu, #app-search, #comments-root, #consentRoot, #mary-root'
                    )
                ) {
                    continue;
                }
                root.appendChild(node);
            }
        }

        ensurePortalsOutside(root);
        return root;
    }

    function getScrollTop() {
        const scroller = getPageScroller();
        if (scroller) return scroller.scrollTop || 0;
        return (
            global.pageYOffset ||
            document.documentElement.scrollTop ||
            document.body.scrollTop ||
            0
        );
    }

    function getScrollHeight() {
        const scroller = getPageScroller();
        if (scroller) return scroller.scrollHeight || 0;
        return document.documentElement.scrollHeight || document.body.scrollHeight || 0;
    }

    function getClientHeight() {
        const scroller = getPageScroller();
        if (scroller) return scroller.clientHeight || 0;
        return document.documentElement.clientHeight || global.innerHeight || 0;
    }

    function parseScrollArgs(args) {
        if (!args || !args.length) return { top: 0, left: 0, behavior: 'auto' };
        if (typeof args[0] === 'number') {
            return {
                left: Number(args[0]) || 0,
                top: Number(args[1]) || 0,
                behavior: 'auto'
            };
        }
        const opts = args[0] || {};
        return {
            top: opts.top != null ? Number(opts.top) : 0,
            left: opts.left != null ? Number(opts.left) : 0,
            behavior: opts.behavior || 'auto'
        };
    }

    function scrollTo() {
        const scroller = getPageScroller();
        const parsed = parseScrollArgs(arguments);
        if (scroller) {
            scroller.scrollTo(parsed);
            return;
        }
        if (nativeScrollTo) nativeScrollTo.apply(global, arguments);
        else global.scrollTo(parsed);
    }

    function scrollBy() {
        const scroller = getPageScroller();
        const parsed = parseScrollArgs(arguments);
        if (scroller) {
            scroller.scrollBy(parsed);
            return;
        }
        if (nativeScrollBy) nativeScrollBy.apply(global, arguments);
        else global.scrollBy(parsed);
    }

    function installPageScrollBridge() {
        if (pageBridgeInstalled) return;
        const scroller = getPageScroller();
        if (!scroller) return;

        pageBridgeInstalled = true;
        nativeScrollTo = global.scrollTo.bind(global);
        nativeScrollBy = global.scrollBy.bind(global);

        global.scrollTo = function bridgedScrollTo() {
            if (getPageScroller()) return scrollTo.apply(null, arguments);
            return nativeScrollTo.apply(global, arguments);
        };
        global.scrollBy = function bridgedScrollBy() {
            if (getPageScroller()) return scrollBy.apply(null, arguments);
            return nativeScrollBy.apply(global, arguments);
        };

        try {
            nativeScrollYDesc =
                Object.getOwnPropertyDescriptor(global, 'scrollY') ||
                Object.getOwnPropertyDescriptor(Window.prototype, 'scrollY');
            Object.defineProperty(global, 'scrollY', {
                configurable: true,
                enumerable: true,
                get() {
                    const el = getPageScroller();
                    if (el) return el.scrollTop || 0;
                    if (nativeScrollYDesc && typeof nativeScrollYDesc.get === 'function') {
                        return nativeScrollYDesc.get.call(global);
                    }
                    return global.pageYOffset || 0;
                }
            });
        } catch (_) {
            /* ignore — callers usam getScrollTop quando necessário */
        }

        try {
            nativePageYOffsetDesc =
                Object.getOwnPropertyDescriptor(global, 'pageYOffset') ||
                Object.getOwnPropertyDescriptor(Window.prototype, 'pageYOffset');
            Object.defineProperty(global, 'pageYOffset', {
                configurable: true,
                enumerable: true,
                get() {
                    const el = getPageScroller();
                    if (el) return el.scrollTop || 0;
                    if (nativePageYOffsetDesc && typeof nativePageYOffsetDesc.get === 'function') {
                        return nativePageYOffsetDesc.get.call(global);
                    }
                    return 0;
                }
            });
        } catch (_) {
            /* ignore */
        }

        scroller.addEventListener(
            'scroll',
            () => {
                try {
                    global.dispatchEvent(new Event('scroll'));
                } catch (_) {
                    /* ignore */
                }
            },
            { passive: true }
        );
    }

    function isBlockingOffcanvas(el) {
        if (!el || !el.id) return false;
        return el.id === 'mobileMenu' || el.id === 'commentsOffcanvas';
    }

    function isSearchOpen() {
        return document.documentElement.classList.contains('search-open');
    }

    function restorePageScrollTop(scroller, top) {
        if (!scroller) return;
        scroller.scrollTop = top;
        // Mudar overflow pode zerar scrollTop no Chromium; reaplicar em frames seguintes.
        requestAnimationFrame(() => {
            if (!scroller.isConnected) return;
            if (scroller.dataset.ssLocked === '1') return;
            scroller.scrollTop = top;
            requestAnimationFrame(() => {
                if (!scroller.isConnected) return;
                if (scroller.dataset.ssLocked === '1') return;
                scroller.scrollTop = top;
            });
        });
    }

    function applyPageLock() {
        const scroller = getPageScroller();
        if (!scroller) return;
        const shouldLock =
            pageLockCount > 0 ||
            isSearchOpen() ||
            document.body.classList.contains('mary-is-expanded');

        if (shouldLock) {
            if (scroller.dataset.ssLocked === '1') return;
            scroller.dataset.ssLockTop = String(scroller.scrollTop || 0);
            scroller.dataset.ssLocked = '1';
            scroller.style.overflow = 'hidden';
        } else if (scroller.dataset.ssLocked === '1') {
            const top = Number(scroller.dataset.ssLockTop || 0);
            scroller.style.overflow = '';
            scroller.dataset.ssLocked = '0';
            restorePageScrollTop(scroller, top);
        }
    }

    function bindOverlayLocks() {
        if (lockBound) return;
        lockBound = true;

        document.addEventListener(
            'show.bs.offcanvas',
            (ev) => {
                if (!isBlockingOffcanvas(ev.target)) return;
                pageLockCount += 1;
                applyPageLock();
            },
            true
        );
        document.addEventListener(
            'shown.bs.offcanvas',
            (ev) => {
                if (!isBlockingOffcanvas(ev.target)) return;
                applyPageLock();
                refresh();
            },
            true
        );
        // Mantém lock durante a animação de fechamento; só libera em hidden.
        document.addEventListener(
            'hide.bs.offcanvas',
            (ev) => {
                if (!isBlockingOffcanvas(ev.target)) return;
                applyPageLock();
            },
            true
        );
        document.addEventListener(
            'hidden.bs.offcanvas',
            (ev) => {
                if (!isBlockingOffcanvas(ev.target)) return;
                pageLockCount = Math.max(0, pageLockCount - 1);
                applyPageLock();
                refresh();
            },
            true
        );

        const body = document.body;
        if (body) {
            const bodyObs = new MutationObserver(() => applyPageLock());
            bodyObs.observe(body, { attributes: true, attributeFilter: ['class'] });
        }

        const htmlObs = new MutationObserver(() => applyPageLock());
        htmlObs.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['class']
        });

        // Enquanto locked, impede drift/scrollIntoView de alterar a posição salva.
        document.addEventListener(
            'scroll',
            (ev) => {
                const scroller = getPageScroller();
                if (!scroller || scroller.dataset.ssLocked !== '1') return;
                if (ev.target !== scroller) return;
                const top = Number(scroller.dataset.ssLockTop || 0);
                if (Math.abs((scroller.scrollTop || 0) - top) > 0.5) {
                    scroller.scrollTop = top;
                }
            },
            true
        );
    }

    function initPage() {
        const root = ensurePageRoot();
        if (!root) return;
        document.documentElement.classList.add('ss-active');
        initElSafe(root);
        ensurePortalsOutside(root);
        installPageScrollBridge();
        moveBar(root);
    }

    function initInnerTargets() {
        ensurePortalsOutside(getPageRoot());
        for (let i = 0; i < INNER_SELECTORS.length; i += 1) {
            const nodes = document.querySelectorAll(INNER_SELECTORS[i]);
            for (let j = 0; j < nodes.length; j += 1) {
                const el = nodes[j];
                if (!el || !el.isConnected) continue;
                initElSafe(el);
                moveBar(el);
            }
        }
    }

    function refresh() {
        if (isAdmin()) return;
        if (!api()) return;
        if (!started) {
            init();
            return;
        }
        ensurePortalsOutside(getPageRoot());
        initInnerTargets();
        const root = getPageRoot();
        if (root) moveBar(root);
        applyPageLock();
    }

    function init() {
        if (isAdmin()) return;
        if (!api()) return;
        if (!document.body) return;

        initPage();
        initInnerTargets();
        bindOverlayLocks();
        applyPageLock();
        started = true;
    }

    global.SiteScrollbar = {
        init,
        refresh,
        getPageRoot,
        getPageScroller,
        getScroller,
        getScrollTop,
        getScrollHeight,
        getClientHeight,
        scrollTo,
        scrollBy
    };
})(window);
