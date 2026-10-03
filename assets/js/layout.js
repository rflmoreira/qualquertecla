/**
 * Layout público compartilhado — header, menu mobile, footer editorial, massive brand e overlay de busca.
 * Páginas devem definir window.SITE_BASE ('' na raiz) antes de carregar este script.
 */
(function (global) {
    const base = () => global.SITE_BASE || '';

    const GAMES_LINKS = [
        /* Manter sincronizado com seedCategories (parent: games) em mock-data.js */
        ['playstation', 'PlayStation'],
        ['xbox', 'Xbox'],
        ['nintendo', 'Nintendo'],
        ['pc', 'PC'],
        ['esports', 'eSports'],
        ['lancamentos', 'Lançamentos'],
        ['industria-games', 'Indústria dos Games']
    ];

    const GEEK_LINKS = [
        /* Manter sincronizado com seedCategories (parent: geek) em mock-data.js */
        ['filmes-series', 'Filmes & Séries'],
        ['anime-manga', 'Anime & Mangá'],
        ['quadrinhos', 'Quadrinhos'],
        ['marvel-dc', 'Marvel & DC'],
        ['star-wars', 'Star Wars'],
        ['ficcao-cientifica', 'Ficção Científica'],
        ['cultura-nerd', 'Cultura Nerd'],
        ['cosplay-eventos', 'Cosplay & Eventos']
    ];

    const MAIS_LINKS = [
        /* Manter sincronizado com seedCategories raiz: ciencia, cultura-digital */
        ['ciencia', 'Ciência'],
        ['cultura-digital', 'Cultura Digital']
    ];

    /** Incluído no dropdown Mais apenas em breakpoints onde Música some do topo. */
    const MAIS_LINKS_COMPACT_EXTRA = [['musica', 'Música']];

    const INSTITUCIONAL = [
        ['sobre.html', 'Sobre nós', 'Sobre'],
        ['sobre-mary-ai.html', 'Mary AI', 'Mary AI'],
        ['contato.html', 'Contato', 'Contato'],
        ['politica-editorial.html', 'Política Editorial', 'Política Editorial'],
        ['termos-de-uso.html', 'Termos de Uso', 'Termos de Uso'],
        ['politica-privacidade.html', 'Privacidade', 'Privacidade']
    ];

    function catUrl(slug) {
        return `${base()}categoria.html?slug=${encodeURIComponent(slug)}`;
    }

    function pageUrl(file) {
        return `${base()}${file}`;
    }

    function escapeHtml(value) {
        if (global.HtmlSafe && typeof global.HtmlSafe.escapeHtml === 'function') {
            return global.HtmlSafe.escapeHtml(value);
        }
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function escapeAttr(value) {
        if (global.HtmlSafe && typeof global.HtmlSafe.escapeAttr === 'function') {
            return global.HtmlSafe.escapeAttr(value);
        }
        return escapeHtml(value).replace(/`/g, '&#96;');
    }

    function isSafeHref(href) {
        if (global.HtmlSafe && typeof global.HtmlSafe.isSafeHref === 'function') {
            return global.HtmlSafe.isSafeHref(href);
        }
        if (!href) return false;
        const trimmed = String(href).trim();
        if (trimmed.startsWith('//')) return false;
        return /^(https?:|mailto:|tel:|\/|#)/i.test(trimmed);
    }

    const DEFAULT_SITE_SETTINGS = {
        siteName: 'Qualquer Tecla',
        siteDescription: 'Para a próxima novidade, pressione Qualquer Tecla.',
        contactEmail: 'redacao@qualquertecla.com.br',
        supportUrl: 'https://buy.stripe.com/qualquer-tecla',
        supportEnabled: true
    };

    const DEFAULT_SOCIAL_LINKS = [
        { id: 'twitch', label: 'Twitch', url: 'https://www.twitch.tv', icon: 'ph-twitch-logo', enabled: true },
        { id: 'youtube', label: 'YouTube', url: 'https://www.youtube.com', icon: 'ph-youtube-logo', enabled: true },
        { id: 'facebook', label: 'Facebook', url: 'https://www.facebook.com', icon: 'ph-facebook-logo', enabled: true },
        { id: 'instagram', label: 'Instagram', url: 'https://www.instagram.com', icon: 'ph-instagram-logo', enabled: true },
        { id: 'x', label: 'X', url: 'https://x.com', icon: 'ph-x-logo', enabled: true },
        { id: 'spotify', label: 'Spotify', url: 'https://open.spotify.com', icon: 'ph-spotify-logo', enabled: true }
    ];

    const SOCIAL_LINKS_SEED_VERSION_KEY = 'qualquer-tecla_social_links_seed';
    const SOCIAL_LINKS_SEED_VERSION = 'spotify-1';
    const SOCIAL_LINKS_SEED_ADDITIONS = ['spotify'];

    function isHttpUrl(url) {
        try {
            const parsed = new URL(String(url || '').trim());
            return parsed.protocol === 'http:' || parsed.protocol === 'https:';
        } catch (_) {
            return false;
        }
    }

    function filterVisibleSocials(list) {
        return (Array.isArray(list) ? list : []).filter(
            (s) => s && s.enabled !== false && isHttpUrl(s.url)
        );
    }

    const LEGACY_SITE_DESCRIPTIONS = new Set([
        'Portal de Notícias Premium',
        'Portal de Noticias Premium',
        'Portal de Notícias',
        'Portal de Noticias',
        'Tudo o que você quer saber, em qualquer tecla.'
    ]);

    const LEGACY_SITE_NAMES = new Set(['QUALQUER TECLA', 'QUALQUER TECLA']);

    function migrateLegacySiteDescription(desc) {
        const value = String(desc || '').trim();
        if (LEGACY_SITE_DESCRIPTIONS.has(value)) {
            return DEFAULT_SITE_SETTINGS.siteDescription;
        }
        return value || DEFAULT_SITE_SETTINGS.siteDescription;
    }

    function migrateLegacySiteName(name) {
        const value = String(name || '').trim();
        if (!value || LEGACY_SITE_NAMES.has(value.toLocaleUpperCase('pt-BR'))) {
            return DEFAULT_SITE_SETTINGS.siteName;
        }
        return value;
    }

    function readSiteSettingsSync() {
        try {
            const raw =
                localStorage.getItem('qualquer-tecla_site_settings') ||
                sessionStorage.getItem('qualquer-tecla_site_settings');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') {
                    const rawSiteName = String(parsed.siteName || '').trim();
                    const siteName = brandDisplayName(migrateLegacySiteName(rawSiteName));
                    const siteDescription = migrateLegacySiteDescription(
                        parsed.siteDescription || parsed.siteDesc
                    );
                    const hasSupportUrl =
                        Object.prototype.hasOwnProperty.call(parsed, 'supportUrl') ||
                        Object.prototype.hasOwnProperty.call(parsed, 'support_url');
                    const supportUrl = hasSupportUrl
                        ? String(parsed.supportUrl || parsed.support_url || '').trim()
                        : DEFAULT_SITE_SETTINGS.supportUrl;
                    const supportEnabledRaw =
                        parsed.supportEnabled ?? parsed.support_enabled;
                    const supportEnabled =
                        supportEnabledRaw === undefined || supportEnabledRaw === null
                            ? DEFAULT_SITE_SETTINGS.supportEnabled
                            : Boolean(supportEnabledRaw);
                    const needsPersist =
                        siteName !== rawSiteName ||
                        LEGACY_SITE_DESCRIPTIONS.has(
                            String(parsed.siteDescription || parsed.siteDesc || '').trim()
                        );
                    if (needsPersist) {
                        try {
                            const next = {
                                siteName,
                                siteDesc: siteDescription,
                                siteDescription,
                                contactEmail:
                                    String(parsed.contactEmail || '').trim() ||
                                    DEFAULT_SITE_SETTINGS.contactEmail,
                                supportUrl,
                                supportEnabled
                            };
                            const json = JSON.stringify(next);
                            localStorage.setItem('qualquer-tecla_site_settings', json);
                            sessionStorage.setItem('qualquer-tecla_site_settings', json);
                        } catch (_) {
                            /* ignore */
                        }
                    }
                    return {
                        siteName,
                        siteDescription,
                        contactEmail:
                            String(parsed.contactEmail || '').trim() ||
                            DEFAULT_SITE_SETTINGS.contactEmail,
                        supportUrl,
                        supportEnabled
                    };
                }
            }
        } catch (_) {
            /* ignore */
        }
        return { ...DEFAULT_SITE_SETTINGS };
    }

    function resolveSupportUrl(settings) {
        const s = settings && typeof settings === 'object' ? settings : readSiteSettingsSync();
        const enabled = s.supportEnabled !== false;
        const url = String(s.supportUrl || '').trim();
        if (!enabled || !isHttpUrl(url)) return '';
        return url;
    }

    function supportMenuSectionHtml(url) {
        if (!url) return '';
        return `
      <div class="mobile-menu-section mobile-menu-support">
        <a href="${escapeAttr(url)}" class="mobile-menu-support-link" target="_blank" rel="noopener noreferrer">
          <i class="ph ph-coffee" aria-hidden="true"></i>
          <span>Me pague um café</span>
        </a>
      </div>`;
    }

    function applySupportLinkToDom(settings) {
        const nav = document.querySelector('#mobileMenu .mobile-menu-nav');
        if (!nav) return;
        const url = resolveSupportUrl(settings);
        const existing = nav.querySelector('.mobile-menu-support');
        if (!url) {
            if (existing) existing.remove();
            return;
        }
        const html = supportMenuSectionHtml(url).trim();
        if (existing) {
            existing.outerHTML = html;
            return;
        }
        const meta = nav.querySelector('.mobile-menu-meta');
        if (meta) {
            meta.insertAdjacentHTML('afterend', html);
        } else {
            nav.insertAdjacentHTML('beforeend', html);
        }
    }

    /** Nome da marca para prosa: Title Case (ex.: Qualquer Tecla). */
    function brandDisplayName(name) {
        const raw =
            String(name || DEFAULT_SITE_SETTINGS.siteName).trim() ||
            DEFAULT_SITE_SETTINGS.siteName;
        return raw
            .toLocaleLowerCase('pt-BR')
            .split(/\s+/)
            .filter(Boolean)
            .map((word) => word.charAt(0).toLocaleUpperCase('pt-BR') + word.slice(1))
            .join(' ');
    }

    /** Partes do lockup visual: lead minúsculo + mark em caixa alta (ex.: qualquer / TECLA). */
    function brandLockupParts(name) {
        const words = brandDisplayName(name)
            .split(/\s+/)
            .filter(Boolean);
        if (words.length >= 2) {
            return {
                lead: words
                    .slice(0, -1)
                    .join(' ')
                    .toLocaleLowerCase('pt-BR'),
                mark: words[words.length - 1].toLocaleUpperCase('pt-BR')
            };
        }
        if (words.length === 1) {
            return { lead: '', mark: words[0].toLocaleUpperCase('pt-BR') };
        }
        return { lead: 'qualquer', mark: 'TECLA' };
    }

    /** String visual do lockup (watermarks, massive): "qualquer TECLA". */
    function brandLockupText(name) {
        const { lead, mark } = brandLockupParts(name);
        return lead ? `${lead} ${mark}` : mark;
    }

    /**
     * Lockup do massive brand: caixa alta + espaço normal entre palavras.
     * (word-spacing CSS/canvas só age em U+0020 — thin/hair space ignoram o token.)
     */
    function brandLockupTextMassive(name) {
        const { lead, mark } = brandLockupParts(name);
        const leadUp = lead ? lead.toLocaleUpperCase('pt-BR') : '';
        const markUp = mark.toLocaleUpperCase('pt-BR');
        return leadUp ? `${leadUp} ${markUp}` : markUp;
    }

    /** Logo do header: keycap PNG gerada + base WebGL (somente o logotipo, sem wordmark). */
    function headerBrandLogoHtml(name) {
        const assetBase = base();
        const v = '20260920canonical';
        const tex = `${assetBase}assets/img/brand/qt-keycap-top.png?v=${v}`;
        const fallback = `${assetBase}assets/img/brand/qt-keycap-fallback.png?v=${v}`;
        const prose = brandDisplayName(name);
        return (
            `<span class="main-header-logo-keycap" aria-hidden="true" ` +
            `data-keycap-texture="${tex}">` +
            `<img class="qt-keycap-fallback" src="${fallback}" alt="" width="64" height="64" decoding="async">` +
            `<canvas class="qt-keycap-canvas" aria-hidden="true"></canvas>` +
            `</span>` +
            `<span class="visually-hidden">${escapeHtml(prose)}</span>`
        );
    }

    /** Lockup tipográfico do footer: QUALQUER + TECLA em caixa alta. */
    function footerWordmarkHtml(name) {
        const { lead, mark } = brandLockupParts(name);
        const leadUp = lead ? lead.toLocaleUpperCase('pt-BR') : '';
        const markUp = mark.toLocaleUpperCase('pt-BR');
        const leadHtml = leadUp
            ? `<span class="brand-word brand-word--lead">${escapeHtml(leadUp)}</span>`
            : '';
        return (
            `<span class="qt-footer-wordmark" aria-hidden="true">` +
            `${leadHtml}<span class="brand-word brand-word--mark">${escapeHtml(markUp)}</span>` +
            `</span>`
        );
    }

    /** Logo do footer: keycap + wordmark tipográfico integrado. */
    function footerBrandLogoHtml(name) {
        const assetBase = base();
        const v = '20260920canonical';
        const tex = `${assetBase}assets/img/brand/qt-keycap-top.png?v=${v}`;
        const fallback = `${assetBase}assets/img/brand/qt-keycap-fallback.png?v=${v}`;
        const prose = brandDisplayName(name);
        return (
            `<span class="main-header-logo-keycap" aria-hidden="true" ` +
            `data-keycap-texture="${tex}">` +
            `<img class="qt-keycap-fallback" src="${fallback}" alt="" width="64" height="64" decoding="async">` +
            `<canvas class="qt-keycap-canvas" aria-hidden="true"></canvas>` +
            `</span>` +
            footerWordmarkHtml(name) +
            `<span class="visually-hidden">${escapeHtml(prose)}</span>`
        );
    }

    function syncFooterWordmark(el, name) {
        const { lead, mark } = brandLockupParts(name);
        const leadUp = lead ? lead.toLocaleUpperCase('pt-BR') : '';
        const markUp = mark.toLocaleUpperCase('pt-BR');
        let wm = el.querySelector('.qt-footer-wordmark');
        if (!wm) {
            wm = document.createElement('span');
            wm.className = 'qt-footer-wordmark';
            wm.setAttribute('aria-hidden', 'true');
            const keycap = el.querySelector('.main-header-logo-keycap');
            if (keycap && keycap.nextSibling) {
                el.insertBefore(wm, keycap.nextSibling);
            } else if (keycap) {
                keycap.after(wm);
            } else {
                el.appendChild(wm);
            }
        }
        let leadEl = wm.querySelector('.brand-word--lead');
        let markEl = wm.querySelector('.brand-word--mark');
        if (leadUp) {
            if (!leadEl) {
                leadEl = document.createElement('span');
                leadEl.className = 'brand-word brand-word--lead';
                wm.insertBefore(leadEl, markEl || null);
            }
            leadEl.textContent = leadUp;
            leadEl.hidden = false;
        } else if (leadEl) {
            leadEl.remove();
        }
        if (!markEl) {
            markEl = document.createElement('span');
            markEl.className = 'brand-word brand-word--mark';
            wm.appendChild(markEl);
        }
        markEl.textContent = markUp;
    }

    function bindHeaderKeycapLogo() {
        if (global.KeycapLogo && typeof global.KeycapLogo.bind === 'function') {
            global.KeycapLogo.bind(document);
        }
    }

    /**
     * Completa a lista persistida com as redes novas do seed, enquanto a flag de
     * versão não estiver marcada. Só afeta a renderização: quem persiste é o
     * MockData/admin, então uma remoção feita no admin continua valendo.
     */
    function mergeSeedSocialAdditions(list) {
        try {
            if (localStorage.getItem(SOCIAL_LINKS_SEED_VERSION_KEY) === SOCIAL_LINKS_SEED_VERSION) {
                return list;
            }
        } catch (_) {
            return list;
        }
        const ids = new Set(list.map((item) => item && item.id));
        const missing = DEFAULT_SOCIAL_LINKS.filter(
            (item) => SOCIAL_LINKS_SEED_ADDITIONS.includes(item.id) && !ids.has(item.id)
        );
        return missing.length ? list.concat(missing) : list;
    }

    function readSocialLinksSync() {
        try {
            const raw =
                localStorage.getItem('qualquer-tecla_social_links') ||
                sessionStorage.getItem('qualquer-tecla_social_links');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length) {
                    return filterVisibleSocials(mergeSeedSocialAdditions(parsed));
                }
            }
        } catch (_) {
            /* ignore */
        }
        return filterVisibleSocials(DEFAULT_SOCIAL_LINKS);
    }

    function renderSocialButtons(links, options = {}) {
        const className = String(options.className || 'footer-social-btn').trim();
        const limit = Number.isFinite(options.limit) ? options.limit : null;
        let list = Array.isArray(links) ? links : [];
        if (limit != null && limit >= 0) list = list.slice(0, limit);
        return list
            .map((item) => {
                const label = escapeAttr(item.label || 'Rede social');
                let rawUrl = String(item.url || '#').trim();
                if (!isSafeHref(rawUrl)) rawUrl = '#';
                const url = escapeAttr(rawUrl);
                const icon = escapeAttr(item.icon || 'ph-link');
                return (
                    `<a href="${url}" class="${className}" aria-label="${label}" ` +
                    `rel="noopener noreferrer" target="_blank">` +
                    `<i class="ph ${icon}" aria-hidden="true"></i></a>`
                );
            })
            .join('');
    }

    function socialConnectBlock(links, { titleTag, titleClass, iconsClass, wrapperClass }) {
        const buttons = renderSocialButtons(links);
        if (!buttons) return '';
        const title = titleTag === 'h6'
            ? `<h6 class="${titleClass}">Conecte-se</h6>`
            : `<h5 class="${titleClass}">Conecte-se</h5>`;
        const inner = `${title}<div class="${iconsClass}">${buttons}</div>`;
        if (wrapperClass) {
            return `<div class="${wrapperClass}">${inner}</div>`;
        }
        return inner;
    }

    function applySocialLinksToDom(links) {
        const visible = filterVisibleSocials(
            Array.isArray(links) ? links : readSocialLinksSync()
        );

        const mobileWrapper = document.querySelector('.mobile-socials-wrapper');
        if (mobileWrapper) {
            const html = socialConnectBlock(visible, {
                titleTag: 'h6',
                titleClass: 'mobile-menu-connect-title',
                iconsClass: 'mobile-menu-socials'
            });
            if (html) {
                mobileWrapper.hidden = false;
                mobileWrapper.innerHTML = html;
            } else {
                mobileWrapper.hidden = true;
                mobileWrapper.innerHTML = '';
            }
        }

        const footerConnect = document.querySelector('.qt-footer-col--connect');
        const footerSocials = document.querySelector('.qt-footer-socials-host');
        if (footerSocials) {
            const buttons = renderSocialButtons(visible);
            if (buttons) {
                if (footerConnect) footerConnect.hidden = false;
                footerSocials.hidden = false;
                footerSocials.innerHTML = buttons;
            } else {
                if (footerConnect) footerConnect.hidden = true;
                footerSocials.hidden = true;
                footerSocials.innerHTML = '';
            }
        }
    }

    async function refreshSocialLinksFromApi() {
        if (!global.API || typeof global.API.getSiteSettings !== 'function') {
            if (!global.API || typeof global.API.getSocialLinks !== 'function') return;
            if (!global.API.isRemoteEnabled || !global.API.isRemoteEnabled()) return;
            try {
                const links = await global.API.getSocialLinks();
                applySocialLinksToDom(links);
            } catch (err) {
                console.error('[Layout] Redes sociais:', err);
            }
            return;
        }
        if (!global.API.isRemoteEnabled || !global.API.isRemoteEnabled()) return;
        try {
            const settings = await global.API.getSiteSettings();
            applySiteIdentityToDom(settings);
            applySocialLinksToDom(settings.socialLinks);
        } catch (err) {
            console.error('[Layout] Configurações do site:', err);
        }
    }

    function applySiteIdentityToDom(settings) {
        const s = settings && typeof settings === 'object' ? settings : readSiteSettingsSync();
        const name = brandDisplayName(s.siteName);
        const lockup = brandLockupText(s.siteName);
        const email =
            String(s.contactEmail || '').trim() || DEFAULT_SITE_SETTINGS.contactEmail;

        let keycapRemounted = false;
        document.querySelectorAll('.main-header-logo, .mobile-menu-logo, .qt-footer-brand-link').forEach((el) => {
            const isFooter = el.classList.contains('qt-footer-brand-link');
            const withWordmark =
                isFooter || el.classList.contains('mobile-menu-logo');
            const legacyWordmark = el.querySelector('.main-header-logo-wordmark');
            if (legacyWordmark) {
                legacyWordmark.remove();
            }
            const keycap = el.querySelector('.main-header-logo-keycap');
            if (keycap) {
                let sr = el.querySelector('.visually-hidden');
                if (!sr) {
                    sr = document.createElement('span');
                    sr.className = 'visually-hidden';
                    el.appendChild(sr);
                }
                sr.textContent = name;
                if (withWordmark) {
                    syncFooterWordmark(el, s.siteName);
                }
            } else {
                el.innerHTML = withWordmark
                    ? footerBrandLogoHtml(s.siteName)
                    : headerBrandLogoHtml(s.siteName);
                keycapRemounted = true;
            }
            el.setAttribute('aria-label', name);
        });
        if (keycapRemounted) {
            bindHeaderKeycapLogo();
        }

        document.querySelectorAll('[data-site-description]').forEach((el) => {
            el.textContent =
                String(s.siteDescription || '').trim() || DEFAULT_SITE_SETTINGS.siteDescription;
        });

        document.querySelectorAll('.mobile-menu-watermark:not(.comments-watermark)').forEach((el) => {
            el.textContent = lockup;
        });

        document.querySelectorAll('.massive-brand-text').forEach((el) => {
            const massiveLockup = brandLockupTextMassive(s.siteName);
            el.setAttribute('data-text', massiveLockup);
            el.setAttribute('aria-label', name);
            if (el.classList.contains('is-liquid-static')) {
                if (
                    global.QualquerTeclaMassiveBrand &&
                    typeof global.QualquerTeclaMassiveBrand.layoutStatic === 'function'
                ) {
                    global.QualquerTeclaMassiveBrand.layoutStatic(el);
                }
                return;
            }
            const inst = el.__liquidInstance;
            if (inst && !inst.destroyed && inst.active && inst.material && inst.material.uniforms) {
                inst.text = massiveLockup;
                try {
                    const oldTexture = inst.material.uniforms.uTexture.value;
                    inst.material.uniforms.uTexture.value = inst.createTextTexture();
                    if (oldTexture && typeof oldTexture.dispose === 'function') oldTexture.dispose();
                } catch (_) {
                    /* ignore */
                }
            }
        });

        /* Home watermark only — não sobrescreve editoria do artigo/categoria */
        document.querySelectorAll('.category-header').forEach((header) => {
            if (header.getAttribute('data-watermark') === 'editorial') return;
            header.querySelectorAll('.category-title').forEach((el) => {
                el.textContent = lockup;
            });
        });

        document.querySelectorAll('[data-site-email]').forEach((el) => {
            if (el.tagName === 'A') {
                el.setAttribute('href', `mailto:${email}`);
                el.textContent = email;
            } else {
                el.textContent = email;
            }
        });

        document.querySelectorAll('[data-site-name]').forEach((el) => {
            el.textContent = name;
        });

        applySupportLinkToDom(s);
    }

    function dropdownItems(items, options = {}) {
        const itemClass = String(options.itemClass || '').trim();
        return items
            .map(([slug, label]) => {
                const liClass = itemClass ? ` class="${itemClass}"` : '';
                return `<li${liClass}><a class="dropdown-item" href="${catUrl(slug)}">${label}</a></li>`;
            })
            .join('');
    }

    function renderHeader() {
        const root = document.getElementById('app-header');
        if (!root) return;
        const settings = readSiteSettingsSync();
        const brandLabel = escapeAttr(brandDisplayName(settings.siteName));
        const newsletterHref = `${pageUrl('index.html')}#newsletter-form`;

        root.innerHTML = `
<header class="main-header">
  <div class="main-header-masthead">
    <div class="main-header-inner main-header-inner--masthead">
      <div class="main-header-cluster main-header-cluster--start">
        <button type="button" class="main-header-icon main-header-menu-btn" data-bs-toggle="offcanvas" data-bs-target="#mobileMenu" aria-controls="mobileMenu" aria-expanded="false" aria-label="Abrir menu">
          <span class="main-header-burger" aria-hidden="true"><span></span><span></span><span></span></span>
        </button>
        <a href="${newsletterHref}" class="main-header-news-cta">
          <span class="main-header-news-cta-label">Receba destaques</span>
          <i class="ph ph-envelope-simple" aria-hidden="true"></i>
        </a>
      </div>
      <div class="main-header-cluster main-header-cluster--brand">
        <a href="${pageUrl('index.html')}" class="logo main-header-logo" aria-label="${brandLabel}">${headerBrandLogoHtml(settings.siteName)}</a>
      </div>
      <div class="main-header-cluster main-header-cluster--end">
        <button type="button" class="main-header-icon" onclick="toggleSearch(event)" aria-label="Abrir busca" aria-controls="searchOverlay" aria-expanded="false" id="searchOpenBtn">
          <i class="ph ph-magnifying-glass" aria-hidden="true"></i>
        </button>
      </div>
    </div>
  </div>
  <nav class="main-header-subnav" aria-label="Editorias">
    <div class="main-header-inner main-header-inner--subnav">
      <ul class="main-header-subnav-list">
        <li class="main-header-item main-header-item--link">
          <a href="${catUrl('tech')}" class="main-header-link">Tech</a>
        </li>
        <li class="main-header-item main-header-item--link">
          <a href="${catUrl('ia')}" class="main-header-link">IA</a>
        </li>
        <li class="main-header-item main-header-item--link dropdown">
          <button type="button" class="main-header-link dropdown-toggle" data-bs-toggle="dropdown" aria-expanded="false" aria-haspopup="true" id="dropdownGames">Games<i class="ph ph-plus main-header-chevron" aria-hidden="true"></i></button>
          <ul class="dropdown-menu" aria-labelledby="dropdownGames">${dropdownItems(GAMES_LINKS)}</ul>
        </li>
        <li class="main-header-item main-header-item--link dropdown">
          <button type="button" class="main-header-link dropdown-toggle" data-bs-toggle="dropdown" aria-expanded="false" aria-haspopup="true" id="dropdownGeek">Geek<i class="ph ph-plus main-header-chevron" aria-hidden="true"></i></button>
          <ul class="dropdown-menu" aria-labelledby="dropdownGeek">${dropdownItems(GEEK_LINKS)}</ul>
        </li>
        <li class="main-header-item main-header-item--link">
          <a href="${catUrl('ciencia')}" class="main-header-link">Ciência</a>
        </li>
        <li class="main-header-item main-header-item--link main-header-item--cultura">
          <a href="${catUrl('cultura-digital')}" class="main-header-link">Cultura Digital</a>
        </li>
        <li class="main-header-item main-header-item--link main-header-item--musica">
          <a href="${catUrl('musica')}" class="main-header-link">Música</a>
        </li>

      </ul>
    </div>
  </nav>
</header>`;
    }

    function collapseLinks(items) {
        return items
            .map(
                ([slug, label]) =>
                    `<a href="${catUrl(slug)}" class="mobile-menu-sublink">${label}</a>`
            )
            .join('');
    }

    function expandToggle(id, label) {
        return `
<button type="button" class="mobile-menu-item mobile-menu-item--toggle" data-bs-toggle="collapse" data-bs-target="#${id}" aria-expanded="false" aria-controls="${id}">
  <span class="mobile-menu-item-label">${label}</span>
  <span class="mobile-menu-plus" aria-hidden="true">
    <i class="ph ph-plus mobile-menu-plus-icon"></i>
  </span>
</button>`;
    }

    function renderMobileMenu() {
        const root = document.getElementById('app-mobile-menu');
        if (!root) return;

        const settings = readSiteSettingsSync();
        const name = brandDisplayName(settings.siteName);

        const inst = INSTITUCIONAL.map(
            ([file, label]) =>
                `<a href="${pageUrl(file)}" class="mobile-menu-item mobile-menu-item--meta">${label}</a>`
        ).join('');

        root.innerHTML = `
<div class="offcanvas offcanvas-start mobile-menu-offcanvas mobile-menu-offcanvas--nav" tabindex="-1" id="mobileMenu" aria-labelledby="mobileMenuLabel">
  <div class="mobile-menu-watermark" aria-hidden="true">${escapeHtml(name)}</div>

  <div class="mobile-menu-top">
    <div class="mobile-menu-header">
      <a href="${pageUrl('index.html')}" class="logo mobile-menu-logo" id="mobileMenuLabel" aria-label="${escapeAttr(brandDisplayName(settings.siteName))}">${footerBrandLogoHtml(settings.siteName)}</a>
      <button type="button" class="mobile-menu-close" data-bs-dismiss="offcanvas" aria-label="Fechar menu">
        <i class="ph ph-x" aria-hidden="true"></i>
      </button>
    </div>
    <form action="${pageUrl('busca.html')}" method="get" class="mobile-search-form" role="search">
      <label for="mobileSearchInput" class="visually-hidden">Buscar no site</label>
      <div class="mobile-search-field">
        <button type="submit" class="mobile-search-submit" aria-label="Buscar">
          <i class="ph ph-magnifying-glass" aria-hidden="true"></i>
        </button>
        <input type="search" name="q" id="mobileSearchInput" class="mobile-search-input" placeholder="O que você procura?" autocomplete="off" enterkeyhint="search" inputmode="search">
        <button type="button" class="mobile-search-clear" id="mobileSearchClear" hidden aria-label="Limpar busca">
          <i class="ph ph-eraser" aria-hidden="true"></i>
        </button>
      </div>
    </form>
    <div class="mobile-theme-switch" role="group" aria-label="Tema do site">
      <button type="button" class="btn btn-outline-gold mobile-theme-btn" data-theme-set="light">
        <i class="ph ph-sun" aria-hidden="true"></i>
        <span>Claro</span>
      </button>
      <button type="button" class="btn btn-outline-gold mobile-theme-btn" data-theme-set="dark">
        <i class="ph ph-moon" aria-hidden="true"></i>
        <span>Escuro</span>
      </button>
    </div>
  </div>

  <div class="offcanvas-body mobile-menu-body p-0 d-flex flex-column">
    <nav class="mobile-menu-nav" aria-label="Navegação">
      <div class="mobile-menu-section">
        <h2 class="mobile-menu-section-title">Editorias</h2>
        <div class="mobile-menu-primary">
          <a href="${catUrl('tech')}" class="mobile-menu-item">Tech</a>
          <a href="${catUrl('ia')}" class="mobile-menu-item">IA</a>
          ${expandToggle('collapseGames', 'Games')}
          <div class="collapse" id="collapseGames"><div class="mobile-menu-subnav">${collapseLinks(GAMES_LINKS)}</div></div>
          ${expandToggle('collapseGeek', 'Geek')}
          <div class="collapse" id="collapseGeek"><div class="mobile-menu-subnav">${collapseLinks(GEEK_LINKS)}</div></div>
          <a href="${catUrl('ciencia')}" class="mobile-menu-item">Ciência</a>
          <a href="${catUrl('cultura-digital')}" class="mobile-menu-item">Cultura Digital</a>
          <a href="${catUrl('musica')}" class="mobile-menu-item">Música</a>
        </div>
      </div>
      <div class="mobile-menu-section mobile-menu-meta">
        <h2 class="mobile-menu-section-title">Institucional</h2>
        <div class="mobile-menu-meta-links">${inst}</div>
      </div>
      ${supportMenuSectionHtml(resolveSupportUrl(settings))}
    </nav>
    <div class="mobile-socials-wrapper">
      ${socialConnectBlock(readSocialLinksSync(), {
          titleTag: 'h6',
          titleClass: 'mobile-menu-connect-title',
          iconsClass: 'mobile-menu-socials'
      })}
    </div>
  </div>
</div>`;
        const mobileSocials = document.querySelector('.mobile-socials-wrapper');
        if (mobileSocials && !mobileSocials.innerHTML.trim()) {
            mobileSocials.hidden = true;
        }
        bindMobileMenuMotion();
        bindMobileMenuNavigation();
        bindSearchInputClear();
        bindMobileThemeSwitch();
    }

    function bindMobileThemeSwitch() {
        const root = document.getElementById('mobileMenu');
        if (!root || root.dataset.themeSwitchBound === '1') return;
        root.dataset.themeSwitchBound = '1';

        const sync = () => {
            const current =
                (global.SiteTheme && typeof global.SiteTheme.get === 'function' && global.SiteTheme.get()) ||
                document.documentElement.getAttribute('data-theme') ||
                'dark';
            root.querySelectorAll('[data-theme-set]').forEach((btn) => {
                const on = btn.getAttribute('data-theme-set') === current;
                btn.classList.toggle('is-active', on);
                btn.setAttribute('aria-pressed', on ? 'true' : 'false');
            });
        };

        root.querySelectorAll('[data-theme-set]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const next = btn.getAttribute('data-theme-set');
                if (global.SiteTheme && typeof global.SiteTheme.set === 'function') {
                    global.SiteTheme.set(next);
                } else {
                    document.documentElement.setAttribute('data-theme', next);
                }
                sync();
                btn.blur();
            });
        });

        global.addEventListener('qualquer-tecla:themechange', sync);
        sync();
    }

    function footerCatLinks(items) {
        return items
            .map(
                ([slug, label]) =>
                    `<li><a class="qt-footer-link" href="${catUrl(slug)}">${escapeHtml(label)}</a></li>`
            )
            .join('');
    }

    function footerPageLinks(items) {
        return items
            .map(([file, label]) => {
                const isExternalTab = String(file).startsWith('admin/');
                const tabAttrs = isExternalTab
                    ? ' target="_blank" rel="noopener noreferrer"'
                    : '';
                return `<li><a class="qt-footer-link" href="${pageUrl(file)}"${tabAttrs}>${escapeHtml(label)}</a></li>`;
            })
            .join('');
    }

    function footerNavColumn(id, title, listHtml) {
        return `
<nav class="qt-footer-col" aria-labelledby="${id}">
  <h2 class="qt-footer-col-title" id="${id}">${escapeHtml(title)}</h2>
  <ul class="qt-footer-list">${listHtml}</ul>
</nav>`;
    }

    function bindFooterInteractions() {
        const root = document.getElementById('app-footer');
        if (!root || root.dataset.footerBound === '1') return;
        root.dataset.footerBound = '1';
        root.addEventListener('click', (e) => {
            const scrollTopBtn = e.target.closest('[data-scroll-top]');
            if (scrollTopBtn) {
                e.preventDefault();
                const reduceMotion =
                    typeof matchMedia === 'function' &&
                    matchMedia('(prefers-reduced-motion: reduce)').matches;
                const scrollApi = global.SiteScrollbar;
                if (scrollApi && typeof scrollApi.scrollTo === 'function') {
                    scrollApi.scrollTo({
                        top: 0,
                        behavior: reduceMotion ? 'auto' : 'smooth'
                    });
                } else if (reduceMotion) {
                    global.scrollTo(0, 0);
                } else {
                    global.scrollTo({ top: 0, behavior: 'smooth' });
                }
                if (typeof scrollTopBtn.blur === 'function') scrollTopBtn.blur();
                return;
            }

            const btn = e.target.closest('[data-consent-open]');
            if (!btn) return;
            e.preventDefault();
            if (global.SiteConsent && typeof global.SiteConsent.open === 'function') {
                global.SiteConsent.open();
            }
            if (typeof btn.blur === 'function') btn.blur();
        });
    }

    function renderFooter() {
        const root = document.getElementById('app-footer');
        if (!root) return;

        const settings = readSiteSettingsSync();
        const brandLabel = escapeAttr(brandDisplayName(settings.siteName));
        const lockupAttr = escapeAttr(brandLockupTextMassive(settings.siteName));
        const description = escapeHtml(
            String(settings.siteDescription || '').trim() || DEFAULT_SITE_SETTINGS.siteDescription
        );
        const email =
            String(settings.contactEmail || '').trim() || DEFAULT_SITE_SETTINGS.contactEmail;
        const emailAttr = escapeAttr(email);
        const year = new Date().getFullYear();
        const assetBase = base();
        const alt42Inverse = `${assetBase}assets/img/brand/alt42-wordmark-inverse.png?v=20260908alt42t`;
        const maisLinks = [...MAIS_LINKS, ...MAIS_LINKS_COMPACT_EXTRA];
        const socialButtons = renderSocialButtons(readSocialLinksSync());

        root.innerHTML = `
<footer class="qt-site-footer">
  <div class="qt-footer-deck">
    <div class="qt-footer-inner">
      <div class="qt-footer-brand">
        <a href="${pageUrl('index.html')}" class="logo qt-footer-brand-link" aria-label="${brandLabel}">${footerBrandLogoHtml(settings.siteName)}</a>
        <p class="qt-footer-tagline font-editorial" data-site-description>${description}</p>
      </div>
      <div class="qt-footer-indexes">
        ${footerNavColumn('qt-footer-games', 'Games', footerCatLinks(GAMES_LINKS))}
        ${footerNavColumn('qt-footer-geek', 'Geek', footerCatLinks(GEEK_LINKS))}
        ${footerNavColumn('qt-footer-mais', 'Mais', footerCatLinks(maisLinks))}
        ${footerNavColumn('qt-footer-site', 'Site', footerPageLinks([...INSTITUCIONAL, ['admin/index.html', 'Acesso Editorial']]))}
        <div class="qt-footer-col qt-footer-col--connect"${socialButtons ? '' : ' hidden'}>
          <h2 class="qt-footer-col-title" id="qt-footer-connect">Conecte-se</h2>
          <div class="qt-footer-socials-host" aria-labelledby="qt-footer-connect"${socialButtons ? '' : ' hidden'}>${socialButtons}</div>
        </div>
      </div>
    </div>
  </div>
  <div class="qt-footer-colophon">
    <div class="qt-footer-inner qt-footer-colophon-inner">
      <div class="qt-footer-publisher">
        <img class="qt-footer-alt42" src="${escapeAttr(alt42Inverse)}" alt="" width="148" height="53" decoding="async" aria-hidden="true">
        <p class="qt-footer-publisher-label">Publicado por ALT42</p>
      </div>
      <div class="qt-footer-meta">
        <span class="qt-footer-meta-item">© ${year} <span data-site-name>${escapeHtml(brandDisplayName(settings.siteName))}</span></span>
        <a class="qt-footer-meta-link" href="mailto:${emailAttr}" data-site-email>${escapeHtml(email)}</a>
        <button type="button" class="qt-footer-meta-btn" data-consent-open>Cookies</button>
        <a class="qt-footer-meta-link" href="${pageUrl('politica-privacidade.html')}">Privacidade</a>
        <a class="qt-footer-meta-link" href="${pageUrl('termos-de-uso.html')}">Termos</a>
        <button type="button" class="qt-footer-meta-btn" data-scroll-top>Subir para o Topo</button>
      </div>
    </div>
  </div>
</footer>
<div class="massive-brand-wrapper">
  <div class="massive-brand-text" data-text="${lockupAttr}" data-liquid="true" aria-label="${brandLabel}"></div>
</div>`;

        bindFooterInteractions();
    }

    function renderSearchOverlay() {
        const root = document.getElementById('app-search');
        if (!root) return;

        root.innerHTML = `
<div class="search-overlay" id="searchOverlay" role="dialog" aria-modal="true" aria-label="Busca" hidden>
  <div class="search-container">
    <div class="search-deco" aria-hidden="true">
      <i class="ph-fill ph-magnifying-glass"></i>
    </div>
    <div class="container">
      <div class="search-bar">
        <form action="${pageUrl('busca.html')}" method="get" class="search-bar-form" role="search">
          <label for="searchInput" class="visually-hidden">Buscar notícias</label>
          <div class="search-field">
            <input type="text" name="q" class="search-input" id="searchInput" placeholder="O que você procura?" autocomplete="off" enterkeyhint="search" inputmode="search">
            <button type="button" class="search-input-clear" id="searchInputClear" hidden aria-label="Limpar busca">
              <i class="ph ph-eraser" aria-hidden="true"></i>
            </button>
          </div>
        </form>
        <button type="button" class="search-close" id="search-close" onclick="toggleSearch(event)" aria-label="Fechar busca">
          <i class="ph ph-x" aria-hidden="true"></i>
        </button>
      </div>
    </div>
  </div>
</div>`;
        bindSearchInputClear();
    }


    function bindMobileMenuMotion() {
        const menu = document.getElementById('mobileMenu');
        const btn = document.querySelector('.main-header-menu-btn');
        if (!menu || menu.dataset.motionBound === '1') return;
        menu.dataset.motionBound = '1';

        const root = document.documentElement;

        const setOpen = (open) => {
            if (btn) {
                btn.classList.toggle('is-open', open);
                btn.setAttribute('aria-expanded', String(open));
                btn.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
            }
            root.classList.toggle('mobile-menu-open', open);
        };

        menu.addEventListener('show.bs.offcanvas', () => setOpen(true));
        menu.addEventListener('shown.bs.offcanvas', () => setOpen(true));
        menu.addEventListener('hide.bs.offcanvas', () => setOpen(false));
        menu.addEventListener('hidden.bs.offcanvas', () => setOpen(false));
    }

    /** Fecha o menu hambúrguer e aguarda a animação terminar completamente antes de executar o callback. */
    function closeMobileMenuThen(callback) {
        if (typeof callback !== 'function') return;
        const menu = document.getElementById('mobileMenu');
        if (!menu || !menu.classList.contains('show')) {
            callback();
            return;
        }

        let finished = false;
        const finish = () => {
            if (finished) return;
            finished = true;
            menu.removeEventListener('hidden.bs.offcanvas', finish);
            callback();
        };

        menu.addEventListener('hidden.bs.offcanvas', finish, { once: true });
        // Fallback garantido caso a transição seja abortada ou prefers-reduced-motion
        setTimeout(finish, 550);

        try {
            if (global.bootstrap && global.bootstrap.Offcanvas) {
                const inst =
                    global.bootstrap.Offcanvas.getInstance(menu) ||
                    global.bootstrap.Offcanvas.getOrCreateInstance(menu);
                inst.hide();
            } else {
                menu.classList.remove('show');
                setTimeout(finish, 420);
            }
        } catch (_) {
            finish();
        }
    }

    /** Intercepta cliques de navegação e buscas na gaveta do menu móvel para fechar suavemente antes de carregar a página. */
    function bindMobileMenuNavigation() {
        const menu = document.getElementById('mobileMenu');
        if (!menu || menu.dataset.navBound === '1') return;
        menu.dataset.navBound = '1';

        menu.addEventListener('click', (e) => {
            const link = e.target.closest('a[href]');
            if (!link || !menu.contains(link)) return;

            // Logotipo keycap possui tratamento próprio de toque e fechamento
            if (link.classList.contains('mobile-menu-logo')) return;

            // Permite abertura nativa com Ctrl/Cmd ou botão do meio
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || (e.button != null && e.button !== 0)) {
                return;
            }

            if (link.target === '_blank') return;

            const href = link.getAttribute('href');
            if (!href || href.startsWith('javascript:')) return;

            if (href.startsWith('#')) {
                if (href === '#' || href === '#!') return;
                e.preventDefault();
                closeMobileMenuThen(() => {
                    global.location.hash = href;
                });
                return;
            }

            e.preventDefault();
            closeMobileMenuThen(() => {
                try {
                    const targetUrl = new URL(href, global.location.href);
                    const dest =
                        targetUrl.href === global.location.href
                            ? global.location.href
                            : targetUrl.href;
                    if (global.SitePageTransition && typeof global.SitePageTransition.go === 'function') {
                        global.SitePageTransition.go(dest);
                    } else if (targetUrl.href === global.location.href) {
                        global.location.reload();
                    } else {
                        global.location.href = dest;
                    }
                } catch (_) {
                    if (global.SitePageTransition && typeof global.SitePageTransition.go === 'function') {
                        global.SitePageTransition.go(href);
                    } else {
                        global.location.href = href;
                    }
                }
            });
        });

        const searchForm = menu.querySelector('.mobile-search-form');
        if (searchForm) {
            searchForm.addEventListener('submit', (e) => {
                const input = searchForm.querySelector('input[name="q"]');
                const query = String(input ? input.value : '').trim();
                if (!query) return;

                e.preventDefault();
                const action = searchForm.getAttribute('action') || 'busca.html';
                const searchUrl = `${action}?q=${encodeURIComponent(query)}`;

                closeMobileMenuThen(() => {
                    if (global.SitePageTransition && typeof global.SitePageTransition.go === 'function') {
                        global.SitePageTransition.go(searchUrl);
                    } else {
                        global.location.href = searchUrl;
                    }
                });
            });
        }
    }

    function bindSearchInputClear() {
        bindClearControl('searchInput', 'searchInputClear');
        bindClearControl('mobileSearchInput', 'mobileSearchClear');
    }

    function bindClearControl(inputId, clearId) {
        const input = document.getElementById(inputId);
        const clearBtn = document.getElementById(clearId);
        if (!input || !clearBtn || clearBtn.dataset.bound === '1') return;
        clearBtn.dataset.bound = '1';

        const sync = () => {
            clearBtn.hidden = !String(input.value || '').length;
        };

        input.addEventListener('input', sync);
        clearBtn.addEventListener('click', (e) => {
            e.preventDefault();
            input.value = '';
            sync();
            input.focus();
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        sync();
    }

    function ensureFavicon() {
        if (document.querySelector('link[rel="icon"]')) return;
        const link = document.createElement('link');
        link.rel = 'icon';
        link.href = pageUrl('favicon.ico');
        link.sizes = 'any';
        document.head.appendChild(link);
    }

    function bindBlurOnPointerActivate() {
        if (document.documentElement.dataset.blurFocusBound === '1') return;
        document.documentElement.dataset.blurFocusBound = '1';
        document.addEventListener(
            'pointerup',
            (e) => {
                if (e.pointerType === 'keyboard') return;
                const el = e.target.closest(
                    [
                        'button',
                        '.btn',
                        '.main-header-icon',
                        '.main-header-link.dropdown-toggle',
                        '.modern-share-btn',
                        '.article-meta-action',
                        '.footer-social-btn',
                        '.qt-footer-meta-btn',
                        '.qt-footer-brand-link',
                        '.search-close',
                        '.mobile-menu-link',
                        '.mobile-menu-item',
                        '.mobile-menu-close',
                        '.mobile-theme-btn',
                        '.consent-btn-text',
                        '[data-consent-action]',
                        '[data-consent-open]'
                    ].join(',')
                );
                if (!el || el.disabled) return;
                requestAnimationFrame(() => {
                    if (document.activeElement === el) el.blur();
                });
            },
            true
        );
    }

    
    
    function mount() {
        ensureFavicon();
        renderHeader();
        renderMobileMenu();
        renderFooter();
        renderSearchOverlay();
        bindBlurOnPointerActivate();
        if (global.SiteTheme && typeof global.SiteTheme.bindToggles === 'function') {
            global.SiteTheme.bindToggles(document);
        }
        if (global.SiteConsent && typeof global.SiteConsent.mount === 'function') {
            global.SiteConsent.mount();
        }
        if (global.SitePwaInstall && typeof global.SitePwaInstall.mount === 'function') {
            global.SitePwaInstall.mount();
        }
        applySiteIdentityToDom(readSiteSettingsSync());
        applySocialLinksToDom(readSocialLinksSync());
        bindHeaderKeycapLogo();
        refreshSocialLinksFromApi();
        if (global.SitePageTransition && typeof global.SitePageTransition.bind === 'function') {
            global.SitePageTransition.bind();
        }
        if (global.SiteScrollbar && typeof global.SiteScrollbar.init === 'function') {
            global.SiteScrollbar.init();
        }
    }

    global.SiteLayout = {
        mount,
        catUrl,
        pageUrl,
        closeMobileMenuThen,
        applySocialLinksToDom,
        applySiteIdentityToDom,
        readSiteSettingsSync,
        brandDisplayName,
        brandLockupText,
        brandLockupTextMassive
    };
})(window);
