/**
 * Utilitários de HTML seguro — escape e sanitização allowlist.
 */
(function (global) {
    const ESCAPE_MAP = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    };

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch]);
    }

    function escapeAttr(value) {
        return escapeHtml(value).replace(/`/g, '&#96;');
    }

    /** Tags e atributos permitidos no corpo editorial. */
    const ALLOWED_TAGS = new Set([
        'P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'H2', 'H3', 'H4',
        'BLOCKQUOTE', 'UL', 'OL', 'LI', 'A', 'SPAN', 'HR', 'DIV', 'IFRAME', 'CODE',
        'PRE', 'IMG', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'FIGURE', 'FIGCAPTION'
    ]);

    const ALLOWED_ATTRS = {
        A: new Set(['href', 'title', 'rel', 'target']),
        SPAN: new Set(['class']),
        P: new Set(['class']),
        DIV: new Set(['class']),
        CODE: new Set(['class']),
        PRE: new Set(['class']),
        H2: new Set(['class']),
        H3: new Set(['class']),
        H4: new Set(['class']),
        IMG: new Set(['src', 'alt', 'title', 'loading', 'width', 'height']),
        TABLE: new Set(['class']),
        TH: new Set(['class']),
        TD: new Set(['class']),
        FIGURE: new Set(['class']),
        FIGCAPTION: new Set(['class']),
        IFRAME: new Set([
            'src',
            'title',
            'allow',
            'allowfullscreen',
            'frameborder',
            'loading',
            'referrerpolicy'
        ])
    };

    function isSafeHref(href) {
        if (!href) return false;
        const trimmed = href.trim();
        // Rejeita protocol-relative (//evil.com) — não tratar como path local.
        if (trimmed.startsWith('//')) return false;
        if (/^(https?:|mailto:|tel:|\/|#)/i.test(trimmed)) return true;
        return false;
    }

    function isSafeImgSrc(src) {
        if (!src) return false;
        const trimmed = src.trim();
        if (/^data:image\/(png|jpe?g|gif|webp)(;|,)/i.test(trimmed)) return true;
        if (trimmed.startsWith('//')) return false;
        if (/^(https?:|\/)/i.test(trimmed)) return true;
        if (/^assets\//i.test(trimmed)) return true;
        return false;
    }

    function isSafeYoutubeEmbed(src) {
        return isSafeEmbedSrc(src) && /youtube(-nocookie)?\.com\/embed\//i.test(String(src || ''));
    }

    /** Iframes de redes/plataformas permitidas no corpo editorial. */
    function isSafeEmbedSrc(src) {
        if (!src) return false;
        try {
            const url = new URL(String(src).trim(), 'https://example.com');
            if (url.protocol !== 'https:') return false;
            const host = url.hostname.replace(/^www\./, '').toLowerCase();
            const path = url.pathname || '';

            if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
                return path.startsWith('/embed/');
            }
            // Invidious (ex.: inv.nadeko.net) — /embed/{videoId}
            if (host === 'inv.nadeko.net') {
                return /^\/embed\/[A-Za-z0-9_-]{11}\/?$/.test(path);
            }
            if (host === 'player.vimeo.com') {
                return /^\/video\/\d+/.test(path);
            }
            if (host === 'platform.twitter.com') {
                return path.toLowerCase().includes('/embed/tweet.html');
            }
            if (host === 'instagram.com') {
                return /\/(p|reel|tv)\/[^/]+\/embed\/?$/i.test(path) || /\/embed\/?$/i.test(path);
            }
            if (host === 'facebook.com' || host === 'www.facebook.com') {
                return path.startsWith('/plugins/');
            }
            if (host === 'tiktok.com') {
                return path.startsWith('/embed');
            }
            if (host === 'open.spotify.com') {
                return path.startsWith('/embed/');
            }
            if (host === 'embed.reddit.com' || host === 'www.redditmedia.com' || host === 'redditmedia.com') {
                return true;
            }
            return false;
        } catch (_) {
            return false;
        }
    }

    /**
     * Sanitiza HTML editorial (allowlist). Remove scripts, eventos e tags perigosas.
     */
    function sanitizeHtml(dirty) {
        if (!dirty) return '';
        const parser = new DOMParser();
        const doc = parser.parseFromString(String(dirty), 'text/html');

        const walk = (node) => {
            const children = Array.from(node.childNodes);
            children.forEach((child) => {
                if (child.nodeType === Node.ELEMENT_NODE) {
                    const tag = child.tagName;
                    if (!ALLOWED_TAGS.has(tag)) {
                        // Mantém texto interno, descarta o wrapper perigoso
                        while (child.firstChild) {
                            node.insertBefore(child.firstChild, child);
                        }
                        node.removeChild(child);
                        return;
                    }

                    // Remove atributos não permitidos / handlers
                    Array.from(child.attributes).forEach((attr) => {
                        const name = attr.name.toLowerCase();
                        if (name.startsWith('on') || name === 'style') {
                            child.removeAttribute(attr.name);
                            return;
                        }
                        const allowed = ALLOWED_ATTRS[tag];
                        if (!allowed || !allowed.has(attr.name)) {
                            child.removeAttribute(attr.name);
                            return;
                        }
                        if (attr.name === 'href' && !isSafeHref(attr.value)) {
                            child.removeAttribute('href');
                        }
                        if (tag === 'IMG' && attr.name === 'src' && !isSafeImgSrc(attr.value)) {
                            child.removeAttribute('src');
                        }
                        if (tag === 'IFRAME' && attr.name === 'src' && !isSafeEmbedSrc(attr.value)) {
                            child.removeAttribute('src');
                        }
                        if (attr.name === 'target') {
                            child.setAttribute('rel', 'noopener noreferrer');
                        }
                    });

                    if (tag === 'IFRAME') {
                        if (!isSafeEmbedSrc(child.getAttribute('src'))) {
                            node.removeChild(child);
                            return;
                        }
                        // Não usar loading=lazy em iframes — falha dentro de modais/containers com overflow.
                        child.removeAttribute('loading');
                        child.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
                        child.setAttribute('allowfullscreen', '');
                    }

                    if (tag === 'IMG') {
                        if (!isSafeImgSrc(child.getAttribute('src'))) {
                            node.removeChild(child);
                            return;
                        }
                        if (!child.getAttribute('loading')) {
                            child.setAttribute('loading', 'lazy');
                        }
                    }

                    walk(child);
                } else if (child.nodeType === Node.COMMENT_NODE) {
                    node.removeChild(child);
                }
            });
        };

        walk(doc.body);
        return doc.body.innerHTML;
    }

    global.HtmlSafe = {
        escapeHtml,
        escapeAttr,
        sanitizeHtml,
        isSafeYoutubeEmbed,
        isSafeEmbedSrc,
        isSafeHref,
        isSafeImgSrc
    };
})(window);
