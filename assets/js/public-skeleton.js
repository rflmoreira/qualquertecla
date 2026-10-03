/**
 * Skeleton + Shimmer — somente site público editorial.
 * Observa #main-content após a hidratação existente. Sem patch de html.js / api.js / theme.js.
 */
(function (global) {
    const TIMEOUTS = { IMG: 12000, VIDEO: 15000, IFRAME: 20000 };
    const EXCLUDE_SELECTOR = [
        '.massive-brand-wrapper',
        '#app-header',
        '#app-footer',
        '#app-mobile-menu',
        '#app-search',
        '#mary-root',
        '.mary',
        '#comments-root',
        '#disqus_thread'
    ].join(',');

    const bound = new WeakSet();
    const revealTimers = new WeakMap();
    const controllers = new WeakMap();
    const hostFills = new WeakMap();

    function prefersReducedMotion() {
        return Boolean(
            global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches
        );
    }

    function isExcluded(el) {
        if (!el || el.nodeType !== 1) return true;
        if (typeof el.closest !== 'function') return true;
        if (!el.closest('#main-content')) return true;
        if (el.closest(EXCLUDE_SELECTOR)) return true;
        if (el.closest('[data-orb-lazy]') || el.matches('[data-orb-lazy]')) return true;
        if (el.classList && el.classList.contains('qt-skel-fill')) return true;
        return false;
    }

    function mediaSrc(el) {
        if (!el) return '';
        const tag = el.tagName;
        if (tag === 'IMG') return String(el.currentSrc || el.getAttribute('src') || '').trim();
        if (tag === 'VIDEO') return String(el.currentSrc || el.getAttribute('src') || '').trim();
        if (tag === 'IFRAME') return String(el.getAttribute('src') || '').trim();
        return '';
    }

    function imgPixelsReady(media) {
        return Boolean(media && media.complete && media.naturalWidth > 0);
    }

    function ensureFill(host) {
        if (!host) return null;
        let fill = hostFills.get(host);
        if (fill && fill.isConnected && fill.parentNode === host) return fill;
        fill = null;
        for (let i = 0; i < host.children.length; i += 1) {
            if (host.children[i].classList.contains('qt-skel-fill')) {
                fill = host.children[i];
                break;
            }
        }
        if (!fill) {
            fill = document.createElement('div');
            fill.className = 'qt-skel-fill';
            fill.setAttribute('aria-hidden', 'true');
            host.insertBefore(fill, host.firstChild);
        }
        hostFills.set(host, fill);
        return fill;
    }

    function wrapAsMediaBox(node, extraClass) {
        if (node.parentElement && node.parentElement.classList.contains('qt-skel-media')) {
            if (extraClass) node.parentElement.classList.add(...extraClass.split(/\s+/).filter(Boolean));
            else if (!node.parentElement.classList.contains('qt-skel--box') &&
                !node.parentElement.classList.contains('qt-skel--featured') &&
                !node.parentElement.classList.contains('qt-skel--rail-thumb') &&
                !node.parentElement.classList.contains('qt-skel--avatar-sm')) {
                node.parentElement.classList.add('qt-skel--box');
            }
            return node.parentElement;
        }
        const box = document.createElement('div');
        box.className = extraClass ? `qt-skel-media ${extraClass}` : 'qt-skel-media qt-skel--box';
        node.parentNode.insertBefore(box, node);
        box.appendChild(node);
        return box;
    }

    function resolveHost(media) {
        if (media.closest('.img-wrapper')) return media.closest('.img-wrapper');
        if (media.closest('.author-avatar')) return media.closest('.author-avatar');
        if (media.closest('.article-author-avatar')) return media.closest('.article-author-avatar');
        if (media.classList.contains('hero-author-avatar')) {
            const pic = media.closest('picture');
            return wrapAsMediaBox(pic || media, 'qt-skel--avatar-sm');
        }
        if (media.classList.contains('author-avatar-img')) {
            if (media.closest('.author-avatar')) return media.closest('.author-avatar');
            const pic = media.closest('picture');
            return wrapAsMediaBox(pic || media, 'qt-skel--avatar-sm');
        }
        if (media.classList.contains('hero-rail-thumb') || media.closest('.hero-rail-item picture')) {
            const picture = media.closest('picture');
            if (picture && picture.closest('.hero-rail-item')) {
                return wrapAsMediaBox(picture, 'qt-skel--rail-thumb');
            }
            if (media.classList.contains('hero-rail-thumb')) {
                return wrapAsMediaBox(media, 'qt-skel--rail-thumb');
            }
        }
        if (media.classList.contains('hero-card-img') || (media.closest('.hero-card') && !media.closest('.hero-card-overlay'))) {
            return media.closest('.hero-card');
        }
        if (media.closest('.article-featured')) {
            const target = media.closest('picture') || media;
            if (target.parentElement && target.parentElement.classList.contains('qt-skel--featured')) {
                return target.parentElement;
            }
            return wrapAsMediaBox(target, 'qt-skel--featured');
        }
        if (media.closest('.video-embed')) return media.closest('.video-embed');
        if (media.closest('.social-embed')) return media.closest('.social-embed');
        const picture = media.closest('picture');
        if (picture && picture.parentElement && picture.parentElement.classList.contains('qt-skel-media')) {
            return picture.parentElement;
        }
        const wrapTarget = picture || media;
        const box = wrapAsMediaBox(wrapTarget);
        const ratioEl = media.tagName === 'IMG' ? media : wrapTarget.querySelector && wrapTarget.querySelector('img');
        if (ratioEl && box && !box.classList.contains('qt-skel--featured')) {
            const w = Number(ratioEl.getAttribute('width'));
            const h = Number(ratioEl.getAttribute('height'));
            if (w > 0 && h > 0) box.style.aspectRatio = `${w} / ${h}`;
        }
        return box;
    }

    function clearRevealTimer(host) {
        const id = revealTimers.get(host);
        if (id) {
            global.clearTimeout(id);
            revealTimers.delete(host);
        }
    }

    function abortController(host) {
        const controller = controllers.get(host);
        if (controller) {
            try {
                controller.abort();
            } catch (_) {
                /* ignore */
            }
            controllers.delete(host);
        }
    }

    function markMediaReady(host) {
        if (!host) return;
        host.setAttribute('data-qt-media-ready', '1');
    }

    function finishReveal(host) {
        if (!host) return;
        clearRevealTimer(host);
        abortController(host);
        markMediaReady(host);
        host.classList.remove(
            'qt-skel--pending',
            'qt-skel--revealing',
            'qt-skel--error',
            'qt-skel--loading',
            'qt-skel-host'
        );
        const fill = hostFills.get(host);
        if (fill && fill.parentNode) fill.parentNode.removeChild(fill);
        hostFills.delete(host);
        /* Fallback se o fill veio do HTML estático sem passar por ensureFill */
        const stray = host.querySelector(':scope > .qt-skel-fill');
        if (stray && stray.parentNode) stray.parentNode.removeChild(stray);
    }

    function lockBoxAspect(media, host) {
        if (!host || !host.classList.contains('qt-skel--box')) return;
        if (host.style.aspectRatio) return;
        const img =
            media && media.tagName === 'IMG'
                ? media
                : host.querySelector && host.querySelector('img');
        if (!img || !img.naturalWidth || !img.naturalHeight) return;
        host.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`;
        host.style.minHeight = '';
    }

    function reveal(media, host) {
        if (!host || !host.isConnected) return;
        markMediaReady(host);
        if (!host.classList.contains('qt-skel--pending') && !host.classList.contains('qt-skel--revealing')) {
            finishReveal(host);
            return;
        }
        lockBoxAspect(media, host);
        host.classList.remove('qt-skel--pending', 'qt-skel--loading');
        if (prefersReducedMotion()) {
            finishReveal(host);
            return;
        }
        host.classList.add('qt-skel--revealing');
        const done = () => finishReveal(host);
        const onEnd = (ev) => {
            if (ev.target !== host && !(ev.target && ev.target.classList && ev.target.classList.contains('qt-skel-fill'))) {
                return;
            }
            if (ev.propertyName && ev.propertyName !== 'opacity') return;
            host.removeEventListener('transitionend', onEnd);
            done();
        };
        host.addEventListener('transitionend', onEnd);
        clearRevealTimer(host);
        revealTimers.set(host, global.setTimeout(done, 240));
    }

    function decodeImg(media) {
        if (typeof media.decode !== 'function') {
            return Promise.resolve(imgPixelsReady(media) ? 'ready' : 'error');
        }
        return media.decode().then(
            () => (imgPixelsReady(media) ? 'ready' : 'error'),
            () => (imgPixelsReady(media) ? 'ready' : 'error')
        );
    }

    function whenReady(media, signal) {
        const tag = media.tagName;
        const src = mediaSrc(media);

        if (!src) return Promise.resolve('empty');

        if (tag === 'IMG') {
            if (media.complete && media.naturalWidth === 0) {
                return Promise.resolve('error');
            }
            if (imgPixelsReady(media)) {
                return decodeImg(media);
            }
            return new Promise((resolve) => {
                const finish = (reason) => {
                    media.removeEventListener('load', onLoad);
                    media.removeEventListener('error', onError);
                    resolve(reason);
                };
                const onLoad = () => {
                    decodeImg(media).then(finish);
                };
                const onError = () => finish('error');
                if (signal) {
                    signal.addEventListener('abort', () => finish('abort'), { once: true });
                }
                media.addEventListener('load', onLoad);
                media.addEventListener('error', onError);
            });
        }

        if (tag === 'VIDEO') {
            if (media.readyState >= 2) return Promise.resolve('ready');
            return new Promise((resolve) => {
                const finish = (reason) => {
                    media.removeEventListener('loadeddata', onReady);
                    media.removeEventListener('canplay', onReady);
                    media.removeEventListener('error', onError);
                    resolve(reason);
                };
                const onReady = () => finish('ready');
                const onError = () => finish('error');
                if (signal) {
                    signal.addEventListener('abort', () => finish('abort'), { once: true });
                }
                media.addEventListener('loadeddata', onReady);
                media.addEventListener('canplay', onReady);
                media.addEventListener('error', onError);
            });
        }

        if (tag === 'IFRAME') {
            return new Promise((resolve) => {
                const finish = (reason) => {
                    media.removeEventListener('load', onLoad);
                    media.removeEventListener('error', onError);
                    resolve(reason);
                };
                const onLoad = () => finish('ready');
                const onError = () => finish('error');
                if (signal) {
                    signal.addEventListener('abort', () => finish('abort'), { once: true });
                }
                media.addEventListener('load', onLoad);
                media.addEventListener('error', onError);
            });
        }

        return Promise.resolve('ready');
    }

    function timeoutMsFor(media) {
        if (media.tagName === 'VIDEO') return TIMEOUTS.VIDEO;
        if (media.tagName === 'IFRAME') return TIMEOUTS.IFRAME;
        return TIMEOUTS.IMG;
    }

    function startTimeout(ms, signal) {
        return new Promise((resolve) => {
            const id = global.setTimeout(() => resolve('timeout'), ms);
            if (signal) {
                signal.addEventListener(
                    'abort',
                    () => {
                        global.clearTimeout(id);
                        resolve('abort');
                    },
                    { once: true }
                );
            }
        });
    }

    function bindMedia(media) {
        if (!media || media.nodeType !== 1) return;
        if (isExcluded(media)) return;
        if (bound.has(media)) return;

        const host = resolveHost(media);
        if (!host || isExcluded(host) || host.closest('.massive-brand-wrapper')) {
            return;
        }

        if (host.getAttribute('data-qt-media-ready') === '1' && !host.classList.contains('qt-skel--pending')) {
            bound.add(media);
            return;
        }

        bound.add(media);

        /* Cache fast-path: already decoded pixels — skip PENDING shimmer/fade. */
        if (media.tagName === 'IMG' && imgPixelsReady(media)) {
            markMediaReady(host);
            finishReveal(host);
            return;
        }

        /* Broken/cached empty image — never leave opacity:0 forever. */
        if (media.tagName === 'IMG' && media.complete && media.naturalWidth === 0 && mediaSrc(media)) {
            host.classList.add('qt-skel-host', 'qt-skel--pending', 'qt-skel--loading');
            host.removeAttribute('data-qt-media-ready');
            ensureFill(host);
            reveal(media, host);
            return;
        }

        host.classList.add('qt-skel-host', 'qt-skel--pending', 'qt-skel--loading');
        host.removeAttribute('data-qt-media-ready');
        ensureFill(host);

        const controller = new AbortController();
        controllers.set(host, controller);
        const { signal } = controller;
        let started = false;

        if (!media.isConnected) {
            controller.abort();
            finishReveal(host);
            return;
        }

        const run = () => {
            if (started) return;
            started = true;
            Promise.race([whenReady(media, signal), startTimeout(timeoutMsFor(media), signal)]).then(
                (reason) => {
                    if (reason === 'abort') {
                        if (host.isConnected) finishReveal(host);
                        return;
                    }
                    if (!media.isConnected || !host.isConnected) {
                        finishReveal(host);
                        return;
                    }
                    reveal(media, host);
                }
            );
        };

        const lazy = media.tagName === 'IMG' && media.getAttribute('loading') === 'lazy';
        if (lazy && !media.complete) {
            /* Arm whenReady + IMG 12s timeout immediately; do not wait for currentSrc/loadstart. */
            run();
            return;
        }

        run();
    }

    function scan(root) {
        if (!root) return;
        if (root.nodeType === 1) {
            if (root.matches && root.matches('img, video, iframe')) {
                bindMedia(root);
            }
            if (root.querySelectorAll) {
                root.querySelectorAll('img, video, iframe').forEach(bindMedia);
            }
        }
    }

    function line(mods) {
        return `<span class="qt-skel-line ${mods}" aria-hidden="true"></span>`;
    }

    function cardHtml(colClass) {
        const col = colClass || 'col-12 col-md-6';
        return `
<div class="${col} latest-news-item">
  <article class="editorial-card" aria-hidden="true">
    <div class="img-wrapper qt-skel-host qt-skel--pending">
      <div class="qt-skel-fill"></div>
    </div>
    <div class="editorial-card-body">
      ${line('qt-skel-line--badge')}
      <div class="qt-skel-lines qt-skel-lines--card-title">
        ${line('qt-skel-line--title qt-skel-line--w92')}
        ${line('qt-skel-line--title qt-skel-line--w64')}
      </div>
      <div class="qt-skel-lines qt-skel-lines--card-excerpt">
        ${line('qt-skel-line--excerpt qt-skel-line--w100')}
        ${line('qt-skel-line--excerpt qt-skel-line--w78')}
      </div>
    </div>
  </article>
</div>`;
    }

    function feedHtml(count, colClass) {
        const n = Math.max(1, Number(count) || 6);
        const col = colClass || 'col-md-6 col-lg-4';
        let html = '';
        for (let i = 0; i < n; i += 1) html += cardHtml(col);
        return html;
    }

    function mostReadHtml(count) {
        const n = Math.max(1, Number(count) || 5);
        let rows = '';
        for (let i = 0; i < n; i += 1) {
            rows += `
<div class="qt-skel-most-read-row">
  ${line('qt-skel-line--rank')}
  <div class="qt-skel-lines">
    ${line('qt-skel-line--badge')}
    ${line('qt-skel-line--title qt-skel-line--w92')}
  </div>
</div>`;
        }
        return `<div class="qt-skel-most-read" aria-hidden="true">${rows}</div>`;
    }

    function railItemHtml() {
        return `
<div class="hero-rail-item" aria-hidden="true">
  <div class="qt-skel-host qt-skel--pending qt-skel-media qt-skel--rail-thumb">
    <div class="qt-skel-fill"></div>
  </div>
  <div class="hero-rail-body">
    ${line('qt-skel-line--badge')}
    <div class="qt-skel-lines qt-skel-lines--card-title">
      ${line('qt-skel-line--title qt-skel-line--w100')}
      ${line('qt-skel-line--title qt-skel-line--w64')}
    </div>
  </div>
</div>`;
    }

    function heroHtml() {
        return `
<div class="col-lg-8">
  <div class="card border-0 overflow-hidden hero-card qt-skel-host qt-skel--pending">
    <div class="qt-skel-fill" aria-hidden="true"></div>
    <div class="card-img-overlay d-flex flex-column justify-content-end hero-card-overlay">
      <div class="col-md-8">
        ${line('qt-skel-line--badge')}
        <div class="qt-skel-lines qt-skel-lines--hero-title">
          ${line('qt-skel-line--hero-title qt-skel-line--w92')}
          ${line('qt-skel-line--hero-title qt-skel-line--w64')}
        </div>
        <div class="qt-skel-lines qt-skel-lines--hero-excerpt">
          ${line('qt-skel-line--excerpt qt-skel-line--w100')}
          ${line('qt-skel-line--excerpt qt-skel-line--w78')}
        </div>
      </div>
    </div>
  </div>
</div>
<div class="col-lg-4">
  <div class="hero-rail" aria-hidden="true">
    ${railItemHtml()}
    ${railItemHtml()}
    ${railItemHtml()}
  </div>
</div>`;
    }

    function articleHtml() {
        return `
<div class="row position-relative" aria-hidden="true">
  <div class="col-lg-2 d-none d-lg-block"></div>
  <div class="col-lg-8">
    <div class="article-header article-header--with-image">
      ${line('qt-skel-line--badge')}
      <div class="qt-skel-lines qt-skel-lines--article-title">
        ${line('qt-skel-line--article-title qt-skel-line--w100')}
        ${line('qt-skel-line--article-title qt-skel-line--w92')}
        ${line('qt-skel-line--article-title qt-skel-line--w64')}
      </div>
      <div class="qt-skel-lines qt-skel-lines--article-subtitle">
        ${line('qt-skel-line--excerpt qt-skel-line--w100')}
        ${line('qt-skel-line--excerpt qt-skel-line--w78')}
      </div>
      ${line('qt-skel-line--meta qt-skel-line--w40')}
      <div class="article-meta-bar">
        <div class="author-info">
          <span class="qt-skel-avatar"></span>
          <div class="author-meta-text flex-grow-1">
            ${line('qt-skel-line--meta qt-skel-line--w64')}
            ${line('qt-skel-line--meta qt-skel-line--w78')}
          </div>
        </div>
      </div>
      <div class="qt-skel-media qt-skel--featured qt-skel-host qt-skel--pending">
        <div class="qt-skel-fill"></div>
      </div>
    </div>
    <div class="qt-skel-lines qt-skel-lines--article-body">
      <div class="qt-skel-para">
        ${line('qt-skel-line--w100')}
        ${line('qt-skel-line--w100')}
        ${line('qt-skel-line--w92')}
        ${line('qt-skel-line--w64')}
      </div>
      <div class="qt-skel-para">
        ${line('qt-skel-line--w100')}
        ${line('qt-skel-line--w100')}
        ${line('qt-skel-line--w78')}
        ${line('qt-skel-line--w40')}
      </div>
    </div>
  </div>
</div>`;
    }

    function observeMain() {
        const root = document.getElementById('main-content');
        if (!root) return;
        scan(root);
        const observer = new MutationObserver((records) => {
            for (let i = 0; i < records.length; i += 1) {
                const added = records[i].addedNodes;
                for (let j = 0; j < added.length; j += 1) {
                    const node = added[j];
                    if (node.nodeType !== 1) continue;
                    if (node.classList && node.classList.contains('qt-skel-fill')) continue;
                    if (node.closest && node.closest('.massive-brand-wrapper')) continue;
                    scan(node);
                }
            }
        });
        observer.observe(root, { childList: true, subtree: true });
        observeSkelBlocks(root);
    }

    /**
     * Desliga shimmer fora da viewport (animation: none → descarta layer).
     * Um observer, poucos blocos raiz — não dezenas de elementos.
     */
    function observeSkelBlocks(root) {
        if (!root || typeof IntersectionObserver !== 'function') return;
        const selectors = [
            '#hero-section',
            '#latest-news-container',
            '#most-read-container',
            '.newsletter-box',
            '#category-feed',
            '#search-results',
            '#article-container'
        ];
        const blocks = [];
        for (let i = 0; i < selectors.length; i += 1) {
            const el = root.querySelector(selectors[i]);
            if (el) blocks.push(el);
        }
        if (!blocks.length) return;

        const io = new IntersectionObserver(
            (entries) => {
                for (let i = 0; i < entries.length; i += 1) {
                    const entry = entries[i];
                    entry.target.classList.toggle('qt-skel--idle', !entry.isIntersecting);
                }
            },
            { root: null, rootMargin: '120px 0px', threshold: 0 }
        );
        blocks.forEach((el) => io.observe(el));
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', observeMain, { once: true });
    } else {
        observeMain();
    }

    /**
     * Mantém o shell textual visível o suficiente para o shimmer ser perceptível
     * com MockData/API rápida. Não atrasa mídia após a troca de innerHTML.
     * Resolve no rAF seguinte ao piso para a troca cair em fronteira de frame.
     */
    function waitTextShell(startedAt, minMs) {
        const min = Math.max(0, Number(minMs) || 150);
        const start = Number(startedAt) || Date.now();
        const remaining = min - (Date.now() - start);
        return new Promise((resolve) => {
            const finish = () => {
                global.requestAnimationFrame(() => resolve());
            };
            if (remaining <= 0) {
                finish();
                return;
            }
            global.setTimeout(finish, remaining);
        });
    }

    /**
     * Fade curto de entrada após troca de skeleton → conteúdo real.
     * Sem forced reflow: o container é conteúdo novo e qt-enter nunca está presente.
     */
    function enter(el) {
        if (!el || el.nodeType !== 1) return;
        if (prefersReducedMotion()) return;
        el.classList.add('qt-enter');
        const clear = () => {
            el.classList.remove('qt-enter');
            el.removeEventListener('animationend', onEnd);
        };
        const onEnd = (ev) => {
            if (ev.target !== el) return;
            clear();
        };
        el.addEventListener('animationend', onEnd);
        global.setTimeout(clear, 280);
    }

    global.PublicSkeleton = {
        scan,
        cardHtml,
        feedHtml,
        mostReadHtml,
        heroHtml,
        articleHtml,
        waitTextShell,
        enter
    };
})(window);
