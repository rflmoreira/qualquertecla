/**
 * Main JS — UI pública, renderização segura e interações.
 */
(function () {
    const { escapeHtml, escapeAttr, sanitizeHtml, isSafeHref } = window.HtmlSafe || {
        escapeHtml: (s) => String(s ?? ''),
        escapeAttr: (s) => String(s ?? ''),
        sanitizeHtml: (s) => String(s ?? ''),
        isSafeHref: (href) => {
            const t = String(href || '').trim();
            if (!t || t.startsWith('//')) return false;
            return /^(https?:|mailto:|tel:|\/|#)/i.test(t);
        }
    };
    const formatDate = (window.Format && window.Format.formatDate) || ((d) => d);
    const formatArticleDateTime =
        (window.Format && window.Format.formatArticleDateTime) || ((d) => formatDate(d, true));

    function articleUrl(slug) {
        const base = window.SITE_BASE || '';
        return `${base}noticia.html?slug=${encodeURIComponent(slug)}`;
    }

    function categoryUrl(slug) {
        const base = window.SITE_BASE || '';
        return `${base}categoria.html?slug=${encodeURIComponent(slug)}`;
    }

    /** Texto do watermark de fundo — abreviações curtas (ex.: IA) ficam por extenso. */
    function categoryWatermarkLabel(name, slug) {
        const s = String(slug || '').trim().toLowerCase();
        const n = String(name || '').trim();
        if (s === 'ia' || /^ia$/i.test(n)) return 'Inteligência Artificial';
        return n;
    }

    function setCategoryWatermarkText(text) {
        const value = String(text || '');
        document.querySelectorAll('.category-header .category-title').forEach((el) => {
            el.textContent = value;
        });
    }

    /**
     * Trilha: Início > [Geek] > Editoria > Artigo
     * Inclui hub Geek quando a editoria tem parent.
     */
    function buildArticleBreadcrumbTrail(cat, articleTitle, articleCanonical) {
        const origin = 'https://qualquertecla.com.br';
        const base = window.SITE_BASE || '';
        const trail = [
            {
                name: 'Início',
                path: `${base}index.html`,
                url: `${origin}/`
            }
        ];

        let parentSlug = cat && cat.parent ? String(cat.parent) : '';
        if (!parentSlug && cat && cat.slug && window.SiteState && Array.isArray(window.SiteState.categories)) {
            const full = window.SiteState.categories.find((c) => c.slug === cat.slug);
            parentSlug = full && full.parent ? String(full.parent) : '';
        }

        if (parentSlug) {
            let parentName = parentSlug;
            if (window.SiteState && Array.isArray(window.SiteState.categories)) {
                const parent = window.SiteState.categories.find((c) => c.slug === parentSlug);
                if (parent && parent.name) parentName = parent.name;
            }
            trail.push({
                name: parentName,
                path: categoryUrl(parentSlug),
                url: `${origin}/categoria.html?slug=${encodeURIComponent(parentSlug)}`
            });
        }

        if (cat && cat.slug) {
            trail.push({
                name: cat.name || cat.slug,
                path: categoryUrl(cat.slug),
                url: `${origin}/categoria.html?slug=${encodeURIComponent(cat.slug)}`
            });
        }

        trail.push({
            name: articleTitle || 'Matéria',
            path: '',
            url: articleCanonical || ''
        });

        return trail;
    }

    function authorAvatarUrl(author) {
        const fallback = 'assets/img/authors/avatar-default.svg';
        if (!author) return fallback;
        const raw = author.avatar || author.avatar_url || '';
        if (!raw) return fallback;
        // A API já envia a URL do avatar resolvida (absoluta ou path relativo tratado)
        return raw;
    }

    function authorAvatarImgHtml(author, extraClass, size) {
        const name = (author && author.name) || 'Autor';
        const src = authorAvatarUrl(author);
        const fallback = 'assets/img/authors/avatar-default.svg';
        const dim = size || 44;
        const cls = extraClass ? `author-avatar-img ${extraClass}` : 'author-avatar-img';
        const img =
            `<img class="${cls}" src="${escapeAttr(src)}" alt="${escapeAttr(name)}" width="${dim}" height="${dim}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${escapeAttr(fallback)}'">`;
        if (/\-128w\.jpe?g$/i.test(src)) {
            const webp = src.replace(/\.jpe?g$/i, '.webp');
            return `<picture><source type="image/webp" srcset="${escapeAttr(webp)}">${img}</picture>`;
        }
        return img;
    }

    function authorBioText(author) {
        const raw = author && (author.bio || author.description);
        const trimmed = String(raw || '').trim();
        if (trimmed) return trimmed;
        return 'Colaborador do Qualquer Tecla.';
    }

    function articleAuthorSocialsHtml(author) {
        const links =
            author && Array.isArray(author.socialLinks)
                ? author.socialLinks
                : [];
        if (!links.length) return '';
        const buttons = links
            .map((item) => {
                const rawUrl = String(item.url || '').trim();
                if (!isSafeHref(rawUrl)) return '';
                const label = escapeAttr(item.label || 'Rede social');
                const url = escapeAttr(rawUrl);
                const icon = escapeAttr(item.icon || 'ph-link');
                return (
                    `<a href="${url}" class="modern-share-btn" aria-label="${label}" title="${label}" ` +
                    `rel="noopener noreferrer" target="_blank">` +
                    `<i class="ph ${icon}" aria-hidden="true"></i></a>`
                );
            })
            .filter(Boolean)
            .join('');
        if (!buttons) return '';
        return `<div class="article-author-socials">${buttons}</div>`;
    }

    function articleAuthorBoxHtml(author) {
        const authorObj = author || { name: 'Autor' };
        const name = authorObj.name || 'Autor';
        const bio = authorBioText(authorObj);
        const socials = articleAuthorSocialsHtml(authorObj);
        return `
<section class="article-author" aria-labelledby="article-author-heading">
  <p class="article-author-label" id="article-author-heading">Sobre o autor</p>
  <div class="article-author-inner">
    <div class="article-author-avatar">${authorAvatarImgHtml(authorObj, 'article-author-avatar-img', 64)}</div>
    <div class="article-author-body">
      <p class="article-author-byline"><span class="article-author-name">${escapeHtml(name)}</span></p>
      <p class="article-author-bio">${escapeHtml(bio)}</p>
      ${socials}
    </div>
  </div>
</section>`;
    }

    /**
     * Picture/srcset para imagens locais de capa (derivados -640w/-960w/-1600w).
     * URLs externas ou paths sem derivados caem em <img> simples.
     */
    function responsiveFeaturedHtml(src, alt, opts) {
        const o = opts || {};
        const className = o.className || '';
        const width = o.width || 640;
        const height = o.height || 360;
        const sizes = o.sizes || '(max-width: 768px) 100vw, 640px';
        const lazy = o.lazy !== false;
        const fetchPriority = o.fetchPriority || '';
        const raw = String(src || '').trim();
        const cls = className ? ` class="${escapeAttr(className)}"` : '';
        const loading = lazy ? ' loading="lazy"' : '';
        const fp = fetchPriority ? ` fetchpriority="${escapeAttr(fetchPriority)}"` : '';
        if (!raw) {
            return `<img${cls} src="" alt="${escapeAttr(alt)}" width="${width}" height="${height}" decoding="async"${loading}${fp}>`;
        }
        const m = raw.match(/^(assets\/img\/)([A-Za-z0-9_-]+)\.(jpe?g)$/i);
        const canOpt = !!(m && !/-\d+w$/i.test(m[2]));
        if (!canOpt) {
            return `<img${cls} src="${escapeAttr(raw)}" alt="${escapeAttr(alt)}" width="${width}" height="${height}" decoding="async"${loading}${fp}>`;
        }
        const base = m[1] + m[2];
        const webpSet = `${escapeAttr(base + '-640w.webp')} 640w, ${escapeAttr(base + '-960w.webp')} 960w, ${escapeAttr(base + '-1600w.webp')} 1600w`;
        const jpegSet = `${escapeAttr(base + '-640w.jpg')} 640w, ${escapeAttr(base + '-960w.jpg')} 960w, ${escapeAttr(base + '-1600w.jpg')} 1600w`;
        return (
            `<picture>` +
            `<source type="image/webp" srcset="${webpSet}" sizes="${escapeAttr(sizes)}">` +
            `<source type="image/jpeg" srcset="${jpegSet}" sizes="${escapeAttr(sizes)}">` +
            `<img${cls} src="${escapeAttr(base + '-1600w.jpg')}" alt="${escapeAttr(alt)}" width="${width}" height="${height}" decoding="async"${loading}${fp}>` +
            `</picture>`
        );
    }

    function newsCardHtml(item, colClass) {
        const cat = item.categories || {};
        return `
<div class="${colClass} latest-news-item">
  <a href="${escapeAttr(articleUrl(item.slug))}" class="text-decoration-none h-100 d-block latest-news-link">
    <article class="editorial-card">
      <div class="img-wrapper">
        ${responsiveFeaturedHtml(item.featured_image || '', item.title, {
            width: 640,
            height: 360,
            sizes: '(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 480px',
            lazy: true
        })}
      </div>
      <div class="editorial-card-body">
        <span class="category-badge">${escapeHtml(cat.name || '')}</span>
        <h3 class="editorial-card-title"><span class="title-ink">${escapeHtml(item.title)}</span></h3>
        <p class="editorial-card-excerpt">${escapeHtml(item.excerpt || '')}</p>
        <div class="editorial-card-meta">
          <span><i class="ph ph-calendar-blank" aria-hidden="true"></i> ${escapeHtml(formatDate(item.published_at))}</span>
          <span><i class="ph ph-clock" aria-hidden="true"></i> ${escapeHtml(String(item.reading_time || 5))} min</span>
        </div>
      </div>
    </article>
  </a>
</div>`;
    }

    function emptyStateHtml(options) {
        const opts = options && typeof options === 'object' ? options : { title: String(options || '') };
        const title = String(opts.title || '').trim() || 'Conteúdo indisponível';
        const detail = opts.text === null || opts.text === undefined
            ? 'O conteúdo pode ter sido removido ou o link está incorreto.'
            : String(opts.text).trim();
        const icon = String(opts.icon || 'ph-smiley-sad').replace(/^ph\s+/, '');
        const compact = Boolean(opts.compact);
        const showHomeCta = opts.showHomeCta !== false && !compact;
        const homeHref = (window.SITE_BASE || '') + 'index.html';
        const textHtml = detail
            ? `<p class="page-empty-text">${escapeHtml(detail)}</p>`
            : '';
        const actionsHtml = showHomeCta
            ? `<div class="page-empty-actions">
    <a href="${escapeAttr(homeHref)}" class="btn btn-outline-gold px-4 py-2">Voltar à Página Inicial</a>
  </div>`
            : '';
        return `
<div class="page-empty${compact ? ' page-empty--compact' : ''}">
  <i class="ph ${escapeAttr(icon)} page-empty-icon" aria-hidden="true"></i>
  <h1 class="page-empty-title">${escapeHtml(title)}</h1>
  ${textHtml}
  ${actionsHtml}
</div>`;
    }

    function showError(container, message) {
        if (!container) return;
        container.innerHTML = `<div class="col-12">${emptyStateHtml({
            title: message,
            text: '',
            icon: 'ph-smiley-sad',
            showHomeCta: false
        })}</div>`;
    }

    /** Empty state visual idêntico ao “Artigo não encontrado” (só o título / complemento mudam). */
    function notFoundStateHtml(title, text) {
        return emptyStateHtml({
            title,
            text: text === undefined
                ? 'O conteúdo pode ter sido removido ou o link está incorreto.'
                : text,
            icon: 'ph-smiley-sad',
            showHomeCta: true
        });
    }

    function heroRailItemHtml(item) {
        const cat = item.categories || {};
        return `
<a href="${escapeAttr(articleUrl(item.slug))}" class="hero-rail-item text-decoration-none">
  ${responsiveFeaturedHtml(item.featured_image || '', item.title, {
      className: 'hero-rail-thumb',
      width: 176,
      height: 110,
      sizes: '(max-width: 991.98px) 120px, 176px',
      lazy: true
  })}
  <div class="hero-rail-body">
    <span class="category-badge">${escapeHtml(cat.name || '')}</span>
    <h3 class="hero-rail-title font-editorial"><span class="title-ink">${escapeHtml(item.title)}</span></h3>
  </div>
</a>`;
    }

    async function renderHero() {
        const section = document.getElementById('hero-section');
        if (!section || !window.API) {
            if (section) section.removeAttribute('aria-busy');
            return;
        }
        const shellStartedAt = Date.now();

        try {
            const [heroNews, latestNews] = await Promise.all([
                window.API.getHeroNews(),
                window.API.getLatestNews(8)
            ]);

            if (!heroNews) {
                if (window.PublicSkeleton && typeof window.PublicSkeleton.waitTextShell === 'function') {
                    await window.PublicSkeleton.waitTextShell(shellStartedAt);
                }
                showError(section, 'Nenhum destaque disponível no momento.');
                section.removeAttribute('aria-busy');
                return;
            }

            const cat = heroNews.categories || {};
            const authorObj = heroNews.authors || { name: 'Autor' };
            const authorName = authorObj.name || 'Autor';
            const heroId = heroNews.id != null ? String(heroNews.id) : '';
            const heroSlug = String(heroNews.slug || '');
            const railItems = (Array.isArray(latestNews) ? latestNews : [])
                .filter((item) => {
                    if (!item) return false;
                    if (heroSlug && item.slug === heroSlug) return false;
                    if (heroId && item.id != null && String(item.id) === heroId) return false;
                    return true;
                })
                .slice(0, 3);

            featuredExcludeSlugs = new Set(
                [heroSlug, ...railItems.map((item) => String(item.slug || ''))].filter(Boolean)
            );

            const featuredCol = railItems.length ? 'col-lg-8' : 'col-12';
            const railHtml = railItems.length
                ? `
<div class="col-lg-4">
  <div class="hero-rail">
    ${railItems.map(heroRailItemHtml).join('')}
  </div>
</div>`
                : '';

            if (window.PublicSkeleton && typeof window.PublicSkeleton.waitTextShell === 'function') {
                await window.PublicSkeleton.waitTextShell(shellStartedAt);
            }

            section.innerHTML = `
<div class="${featuredCol}">
  <a href="${escapeAttr(articleUrl(heroNews.slug))}" class="hero-card-link text-decoration-none d-block h-100">
    <div class="card border-0 overflow-hidden hero-card">
      ${responsiveFeaturedHtml(heroNews.featured_image || '', heroNews.title, {
          className: 'card-img hero-card-img',
          width: 1200,
          height: 500,
          sizes: railItems.length
              ? '(max-width: 991.98px) 100vw, 66vw'
              : '100vw',
          lazy: false,
          fetchPriority: 'high'
      })}
      <div class="card-img-overlay d-flex flex-column justify-content-end hero-card-overlay">
        <div class="col-md-8">
          <span class="category-badge">${escapeHtml(cat.name || '')}</span>
          <h1 class="card-title font-editorial hero-card-title"><span class="title-ink">${escapeHtml(heroNews.title)}</span></h1>
          <p class="card-text d-none d-md-block hero-card-excerpt">${escapeHtml(heroNews.excerpt || '')}</p>
          <div class="editorial-card-meta">
            <span class="hero-author">
              ${authorAvatarImgHtml(authorObj, 'hero-author-avatar')}
              <span>${escapeHtml(authorName)}</span>
            </span>
            <span><i class="ph ph-calendar-blank" aria-hidden="true"></i> ${escapeHtml(formatDate(heroNews.published_at))}</span>
            <span><i class="ph ph-clock" aria-hidden="true"></i> ${escapeHtml(String(heroNews.reading_time || 5))} min</span>
          </div>
        </div>
      </div>
    </div>
  </a>
</div>
${railHtml}`;
            section.classList.add('g-4');
            section.removeAttribute('aria-busy');
            if (window.PublicSkeleton && typeof window.PublicSkeleton.enter === 'function') {
                window.PublicSkeleton.enter(section);
            }
        } catch (err) {
            console.error(err);
            showError(section, 'Não foi possível carregar o destaque.');
            section.removeAttribute('aria-busy');
        }
    }

    let latestOffset = 0;
    let latestAll = null;
    let latestLoading = false;
    let latestHasMore = true;
    /* Par, para fechar linha no grid 2-up (col-md-6) do bloco "Últimas". */
    const LATEST_PAGE = 4;
    /** Slugs já no hero/rail — “Últimas” não deve repetir o featured. */
    let featuredExcludeSlugs = new Set();

    function setLatestLoadMoreVisible(active) {
        const btn = document.getElementById('load-more-news');
        if (!btn) return;
        btn.hidden = !active;
        btn.disabled = !active;
    }

    async function renderLatestNews(append) {
        const container = document.getElementById('latest-news-container');
        if (!container || !window.API) {
            if (container) container.removeAttribute('aria-busy');
            return;
        }
        if (latestLoading) return;
        if (append && !latestHasMore) return;

        latestLoading = true;
        const shellStartedAt = !append ? Date.now() : 0;
        const btn = document.getElementById('load-more-news');
        if (append && btn) btn.disabled = true;

        try {
            if (!append) {
                latestOffset = 0;
                latestAll = null;
                latestHasMore = true;
            }

            if (!latestAll) {
                const raw = await window.API.getLatestNews(100);
                latestAll = (Array.isArray(raw) ? raw : []).filter((item) => {
                    if (!item) return false;
                    const slug = String(item.slug || '');
                    if (slug && featuredExcludeSlugs.has(slug)) return false;
                    return true;
                });
            }

            const slice = latestAll.slice(latestOffset, latestOffset + LATEST_PAGE);

            if (!append && latestAll.length === 0) {
                if (window.PublicSkeleton && typeof window.PublicSkeleton.waitTextShell === 'function') {
                    await window.PublicSkeleton.waitTextShell(shellStartedAt);
                }
                showError(container, 'Nenhuma notícia publicada ainda.');
                latestHasMore = false;
                setLatestLoadMoreVisible(false);
                container.removeAttribute('aria-busy');
                return;
            }

            if (!append) {
                if (window.PublicSkeleton && typeof window.PublicSkeleton.waitTextShell === 'function') {
                    await window.PublicSkeleton.waitTextShell(shellStartedAt);
                }
                container.innerHTML = '';
            }

            const cardsHtml = slice
                .map((item) => newsCardHtml(item, 'col-12 col-md-6'))
                .join('');
            container.insertAdjacentHTML('beforeend', cardsHtml);

            if (!append && window.PublicSkeleton && typeof window.PublicSkeleton.enter === 'function') {
                window.PublicSkeleton.enter(container);
            }

            latestOffset += slice.length;
            latestHasMore = latestOffset < latestAll.length;
            setLatestLoadMoreVisible(latestHasMore);
            container.removeAttribute('aria-busy');
        } catch (err) {
            console.error(err);
            if (!append) {
                showError(container, 'Erro ao carregar notícias.');
                setLatestLoadMoreVisible(false);
                container.removeAttribute('aria-busy');
            } else if (btn) {
                btn.disabled = false;
            }
        } finally {
            latestLoading = false;
        }
    }

async function renderMostRead() {
    const container = document.getElementById('most-read-container');
        if (!container || !window.API) {
            if (container) container.removeAttribute('aria-busy');
            return;
        }
        const shellStartedAt = Date.now();
    
        try {
            const news = await window.API.getMostReadNews(5);
            if (window.PublicSkeleton && typeof window.PublicSkeleton.waitTextShell === 'function') {
                await window.PublicSkeleton.waitTextShell(shellStartedAt);
            }
            if (!news.length) {
                container.innerHTML = emptyStateHtml({
                    title: 'Nenhuma matéria ranqueada ainda.',
                    text: '',
                    icon: 'ph-chart-bar',
                    compact: true,
                    showHomeCta: false
                });
                container.removeAttribute('aria-busy');
        return;
    }

            container.innerHTML = news
                .map((item, index) => {
                    const cat = item.categories || {};
                    return `
<a href="${escapeAttr(articleUrl(item.slug))}" class="text-decoration-none d-block most-read-link">
                <div class="d-flex gap-3 align-items-start">
    <span class="font-ui m-0 most-read-rank">${index + 1}</span>
                    <div>
      <span class="category-badge mb-1">${escapeHtml(cat.name || '')}</span>
      <h3 class="font-editorial h6 mb-0 most-read-title"><span class="title-ink">${escapeHtml(item.title)}</span></h3>
                    </div>
                </div>
</a>`;
                })
                .join('');
            if (window.PublicSkeleton && typeof window.PublicSkeleton.enter === 'function') {
                window.PublicSkeleton.enter(container);
            }
            container.removeAttribute('aria-busy');
        } catch (err) {
            console.error(err);
            container.innerHTML = emptyStateHtml({
                title: 'Não foi possível carregar as mais lidas.',
                text: '',
                icon: 'ph-warning-circle',
                compact: true,
                showHomeCta: false
            });
            container.removeAttribute('aria-busy');
        }
    }

    function newsletterBoxHtml() {
        return `
<h2 id="newsletter-heading" class="visually-hidden">Newsletter</h2>
<div class="newsletter-deco" aria-hidden="true">
  <i class="ph-fill ph-envelope"></i>
</div>
<p class="newsletter-box-text">Receba os destaques editoriais do Qualquer Tecla no seu e-mail.</p>
<form id="newsletter-form" novalidate aria-labelledby="newsletter-heading">
  <div class="input-group">
    <label for="newsletter-email" class="visually-hidden">E-mail</label>
    <input type="email" id="newsletter-email" class="form-control shadow-none" placeholder="Seu melhor e-mail" required autocomplete="email">
    <button class="btn btn-gold" type="submit">Assinar</button>
  </div>
  <p id="newsletter-feedback" class="small mt-2 mb-0" role="status"></p>
</form>`;
    }

    async function hydrateNewsletter() {
        const box = document.querySelector('#main-content .newsletter-box');
        if (!box) return;
        /* HTML estático sem dependência de API — sem waitTextShell artificial */
        box.innerHTML = newsletterBoxHtml();
        box.removeAttribute('aria-busy');
        if (window.PublicSkeleton && typeof window.PublicSkeleton.enter === 'function') {
            window.PublicSkeleton.enter(box);
        }
        initNewsletter();
    }

    function initNewsletter() {
        const form = document.getElementById('newsletter-form');
        if (!form || form.dataset.newsletterBound === '1') return;
        form.dataset.newsletterBound = '1';

        const emailInput = document.getElementById('newsletter-email') || form.querySelector('input[type="email"]');
        const feedback = document.getElementById('newsletter-feedback');
        const submitBtn = form.querySelector('button[type="submit"]');
        const copyEl = (() => {
            const box = form.closest('.newsletter-box');
            return box ? box.querySelector('.newsletter-box-text') : null;
        })();

        if (copyEl && window.SiteLayout && typeof window.SiteLayout.readSiteSettingsSync === 'function') {
            const settings = window.SiteLayout.readSiteSettingsSync();
            const brand =
                typeof window.SiteLayout.brandDisplayName === 'function'
                    ? window.SiteLayout.brandDisplayName(settings.siteName)
                    : String(settings.siteName || 'Qualquer Tecla');
            copyEl.textContent = `Receba os destaques editoriais do ${brand} no seu e-mail.`;
        }

        function setFeedback(type, message) {
            if (!feedback) return;
            feedback.hidden = !message;
            feedback.textContent = message || '';
            feedback.classList.remove('text-danger', 'text-success', 'text-secondary', 'is-newsletter-error', 'is-newsletter-success');
            if (type === 'error') {
                feedback.classList.add('text-danger', 'is-newsletter-error');
            } else if (type === 'success') {
                feedback.classList.add('text-success', 'is-newsletter-success');
            } else if (type === 'info') {
                feedback.classList.add('text-secondary');
            }
        }

        function setLoading(loading) {
            if (!submitBtn) return;
            submitBtn.disabled = !!loading;
            submitBtn.classList.toggle('is-loading', !!loading);
            submitBtn.setAttribute('aria-busy', loading ? 'true' : 'false');
            if (loading) {
                submitBtn.dataset.label = submitBtn.textContent;
                submitBtn.textContent = 'Enviando…';
            } else if (submitBtn.dataset.label) {
                submitBtn.textContent = submitBtn.dataset.label;
                delete submitBtn.dataset.label;
            }
        }

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const raw = emailInput ? emailInput.value : '';
            setFeedback('', '');

            const store = window.NewsletterStore;
            const api = window.API;
            const validate =
                (store && typeof store.isValidEmail === 'function' && store.isValidEmail.bind(store)) ||
                ((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim()));

            if (!validate(raw)) {
                setFeedback('error', 'Informe um e-mail válido.');
                if (emailInput) {
                    emailInput.setAttribute('aria-invalid', 'true');
                    emailInput.focus();
                }
                return;
            }

            if (emailInput) emailInput.setAttribute('aria-invalid', 'false');
            setLoading(true);

            try {
                const result =
                    api && typeof api.subscribeNewsletter === 'function'
                        ? await api.subscribeNewsletter(raw)
                        : await store.subscribe(raw);

                if (result.status === 'already') {
                    setFeedback('success', 'Este e-mail já está inscrito. Você continua recebendo os destaques.');
                } else {
                    setFeedback('success', 'Inscrição confirmada. Você receberá os destaques neste e-mail.');
                }
                form.reset();
                if (emailInput) emailInput.blur();
            } catch (err) {
                console.error('[Newsletter]', err);
                setFeedback('error', (err && err.message) || 'Não foi possível concluir a inscrição.');
                if (emailInput) emailInput.focus();
            } finally {
                setLoading(false);
            }
        });
    }

    window.toggleSearch = function toggleSearch(e) {
        if (e) e.preventDefault();
        const overlay = document.getElementById('searchOverlay');
        const openBtn = document.getElementById('searchOpenBtn');
        if (!overlay || overlay.dataset.animating === '1') return;

        const panel = overlay.querySelector('.search-container');
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const willOpen = !overlay.classList.contains('active');

        const getFocusable = () =>
            Array.from(
                overlay.querySelectorAll(
                    'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
                )
            ).filter((el) => {
                if (el.hidden || el.getAttribute('aria-hidden') === 'true') return false;
                if (el.hasAttribute('hidden')) return false;
                const style = window.getComputedStyle(el);
                return style.visibility !== 'hidden' && style.display !== 'none';
            });

        if (!overlay._backdropBound) {
            overlay.addEventListener('click', (ev) => {
                if (ev.target !== overlay) return;
                if (!overlay.classList.contains('active') || overlay.dataset.animating === '1') return;
                toggleSearch(ev);
            });
            overlay._backdropBound = true;
        }

        if (willOpen) {
            const opener =
                (e && e.currentTarget) ||
                openBtn ||
                (document.activeElement instanceof HTMLElement ? document.activeElement : null);
            overlay._searchOpener = opener;

            overlay.classList.remove('is-closing');
            overlay.hidden = false;
            overlay.setAttribute('aria-hidden', 'false');
            void (panel && panel.offsetWidth);
            overlay.classList.add('active');
            document.documentElement.classList.add('search-open');
            if (openBtn) openBtn.setAttribute('aria-expanded', 'true');

            setTimeout(
                () => {
                    const input = document.getElementById('searchInput');
                    if (input) input.focus();
                },
                reduce ? 0 : 280
            );

            const onKey = (ev) => {
                if (ev.key === 'Escape') {
                    toggleSearch();
                    return;
                }
                if (ev.key !== 'Tab') return;
                const focusables = getFocusable();
                if (!focusables.length) return;
                const first = focusables[0];
                const last = focusables[focusables.length - 1];
                if (ev.shiftKey) {
                    if (document.activeElement === first || !overlay.contains(document.activeElement)) {
                        ev.preventDefault();
                        last.focus();
                    }
                } else if (
                    document.activeElement === last ||
                    !overlay.contains(document.activeElement)
                ) {
                    ev.preventDefault();
                    first.focus();
                }
            };
            document.addEventListener('keydown', onKey);
            overlay._searchEscHandler = onKey;
            return;
        }

        document.documentElement.classList.remove('search-open');
        if (openBtn) openBtn.setAttribute('aria-expanded', 'false');
        if (overlay._searchEscHandler) {
            document.removeEventListener('keydown', overlay._searchEscHandler);
            overlay._searchEscHandler = null;
        }

        const opener = overlay._searchOpener;
        overlay._searchOpener = null;

        const finishClose = () => {
            overlay.classList.remove('active', 'is-closing');
            overlay.hidden = true;
            overlay.setAttribute('aria-hidden', 'true');
            overlay.dataset.animating = '0';
            if (panel) panel.removeEventListener('transitionend', onTransitionEnd);
            if (overlay._searchCloseTimer) {
                clearTimeout(overlay._searchCloseTimer);
                overlay._searchCloseTimer = null;
            }
            if (opener && typeof opener.focus === 'function') {
                try {
                    opener.focus();
                } catch (_) {
                    /* ignore */
                }
            }
        };

        const onTransitionEnd = (ev) => {
            if (!panel || ev.target !== panel || ev.propertyName !== 'transform') return;
            finishClose();
        };

        if (reduce || !panel) {
            finishClose();
            return;
        }

        overlay.dataset.animating = '1';
        overlay.classList.add('is-closing');
        overlay.classList.remove('active');
        void panel.offsetWidth;
        panel.addEventListener('transitionend', onTransitionEnd);
        overlay._searchCloseTimer = setTimeout(finishClose, 450);
    };

function initHeaderScroll() {
    const header = document.querySelector('.main-header');
    if (!header) return;

    let ticking = false;
    let isAnimating = false;
    let lastScrollY = Math.max(0, window.scrollY);

    const HIDE_MIN_THRESHOLD = 60;
    const SCROLL_DOWN_DELTA = 15;
    const SCROLL_UP_DELTA = 30; // Maior intenção necessária para revelar
    const ANIMATION_DURATION = 300; // Tempo de trava da transição CSS para evitar loop

    const sync = () => {
        const currentScrollY = Math.max(0, window.scrollY);
        const isCompact = header.classList.contains('compact');

        // Sempre expandir se estiver muito perto do topo
        if (currentScrollY <= HIDE_MIN_THRESHOLD) {
            if (isCompact && !isAnimating) toggleState(false);
            lastScrollY = currentScrollY;
            return;
        }

        // Bloqueia a leitura de deltas enquanto o layout está sofrendo resize da animação
        if (isAnimating) return;

        const delta = currentScrollY - lastScrollY;

        // Rolando para baixo de forma intencional
        if (delta > SCROLL_DOWN_DELTA && currentScrollY > HIDE_MIN_THRESHOLD) {
            if (!isCompact) toggleState(true);
            else lastScrollY = currentScrollY; // Atualiza base se já estiver compacto
        } 
        // Rolando para cima de forma intencional
        else if (delta < -SCROLL_UP_DELTA) {
            if (isCompact) toggleState(false);
            else lastScrollY = currentScrollY; // Atualiza base se já estiver expandido
        }
    };

    const toggleState = (shouldCompact) => {
        isAnimating = true;
        if (shouldCompact) {
            header.classList.add('compact');
            
            // Corrige o "Dropdown Fantasma": fecha qualquer menu aberto no subnav ao rolar para baixo
            const openDropdowns = header.querySelectorAll('.dropdown-toggle.show');
            openDropdowns.forEach(btn => {
                if (window.bootstrap && bootstrap.Dropdown) {
                    const inst = bootstrap.Dropdown.getInstance(btn);
                    if (inst) inst.hide();
                }
            });
        } else {
            header.classList.remove('compact');
        }
        
        // Aguarda a transição terminar. Zera lastScrollY para o valor ESTÁVEL pós-animação
        // impedindo que os pulos automáticos do navegador causem re-trigger (loop).
        setTimeout(() => {
            lastScrollY = Math.max(0, window.scrollY);
            isAnimating = false;
        }, ANIMATION_DURATION);
    };

    sync();

    window.addEventListener(
        'scroll',
        () => {
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(() => {
                sync();
                ticking = false;
            });
        },
        { passive: true }
    );
}

    /**
     * Mark the subnav link matching the current page with aria-current="page".
     * Matches by comparing the `slug` query param in categoria.html URLs.
     */
    function initActiveSubnavLink() {
        const currentUrl = new URL(window.location.href);
        const currentSlug = currentUrl.searchParams.get('slug');
        const currentPath = currentUrl.pathname.replace(/\/$/, '');

        function markIfMatch(link) {
            if (!link || !link.getAttribute('href')) return false;
            try {
                const linkUrl = new URL(link.href, window.location.origin);
                const linkSlug = linkUrl.searchParams.get('slug');
                const linkPath = linkUrl.pathname.replace(/\/$/, '');
                if (currentSlug && linkSlug && currentSlug === linkSlug) {
                    link.setAttribute('aria-current', 'page');
                    return true;
                }
                if (!currentSlug && !linkSlug && currentPath === linkPath) {
                    link.setAttribute('aria-current', 'page');
                    return true;
                }
            } catch (_) { /* ignore */ }
            return false;
        }

        document
            .querySelectorAll(
                '.main-header-subnav-list a.main-header-link:not(.dropdown-toggle), .main-header-subnav-list a.dropdown-item, a.mobile-menu-item, a.mobile-menu-sublink'
            )
            .forEach((link) => {
                if (!markIfMatch(link)) return;
                if (link.classList.contains('dropdown-item')) {
                    const toggle = link
                        .closest('.main-header-item--link, .dropdown')
                        ?.querySelector('.dropdown-toggle');
                    if (toggle) toggle.setAttribute('aria-current', 'true');
                }
                if (link.classList.contains('mobile-menu-sublink')) {
                    const collapse = link.closest('.collapse');
                    const parentToggle = collapse?.previousElementSibling;
                    if (parentToggle && parentToggle.matches('button, a')) {
                        parentToggle.setAttribute('aria-current', 'true');
                    }
                }
            });
    }

    const LIQUID_SESSION_KEY = 'qualquer-tecla_liquid_static';
    const LIQUID_SCRIPT_TIMEOUT_MS = 8000;
    const LIQUID_ASSET_VERSION = '20260912liquidPreload1';
    const LIQUID_DEBUG = false;
    const LIQUID_SESSION_REASONS = new Set([
        'three-load-failed',
        'script-timeout',
        'fx-load-failed',
        'webgl-unavailable',
        'shader-failed',
        'context-lost'
    ]);

    function liquidDebug(...args) {
        if (LIQUID_DEBUG) console.debug('[Liquid]', ...args);
    }

    function prefersReducedLiquidMotion() {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    function isTechnicalLiquidReason(reason) {
        return LIQUID_SESSION_REASONS.has(String(reason || ''));
    }

    function hasLiquidSessionFallback() {
        try {
            const stored = sessionStorage.getItem(LIQUID_SESSION_KEY);
            liquidDebug('session fallback:', stored);
            return stored && isTechnicalLiquidReason(stored) ? stored : '';
        } catch (_) {
            return '';
        }
    }

    function measureStaticWordmarkFontSize(container, text) {
        const width = container.clientWidth;
        const cssSize = parseFloat(window.getComputedStyle(container).fontSize) || 0;
        const height = Math.max(
            container.clientHeight,
            cssSize > 0 ? cssSize * 0.92 : 0,
            Math.min(window.innerWidth * 0.14, window.innerHeight * 0.28, 360)
        );
        if (width < 1 || height < 1) return null;

        const computed = window.getComputedStyle(container);
        const fontFamily =
            computed.fontFamily ||
            '"Genos", "Bricolage Grotesque", system-ui, sans-serif';
        const rawWeight = computed.fontWeight || '700';
        const fontWeight = rawWeight === 'bold' || Number(rawWeight) >= 700 ? '700' : rawWeight;
        const letterSpacing = computed.letterSpacing || 'normal';
        const wordSpacing = computed.wordSpacing || '0px';

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        const insetX = Math.max(2, width * 0.012);
        const insetY = height * 0.04;
        const usableW = Math.max(2, width - insetX * 2);
        const usableH = Math.max(2, height - insetY * 2);
        const widthFill = 0.97;

        const applyFont = (size) => {
            ctx.font = `${fontWeight} ${size}px ${fontFamily}`;
            if (typeof ctx.letterSpacing !== 'undefined') {
                ctx.letterSpacing = letterSpacing;
            }
            if (typeof ctx.wordSpacing !== 'undefined') {
                ctx.wordSpacing = wordSpacing;
            }
        };

        const measure = (size) => {
            applyFont(size);
            const m = ctx.measureText(text);
            const ascent = m.actualBoundingBoxAscent || size * 0.8;
            const descent = m.actualBoundingBoxDescent || size * 0.2;
            const strokeW = Math.max(1, size * 0.01);
            return {
                width: m.width + strokeW,
                height: ascent + descent + strokeW
            };
        };

        let fontSize = usableW * 0.12;
        let fit = measure(fontSize);
        if (fit.width > 0) {
            fontSize *= (usableW * widthFill) / fit.width;
            fit = measure(fontSize);
        }
        if (fit.height > usableH) {
            fontSize *= usableH / fit.height;
        }
        return fontSize;
    }

    function layoutStaticWordmark(container) {
        if (!container || !container.classList.contains('is-liquid-static')) return;

        const run = () => {
            const text = String(
                container.dataset.text ||
                    (window.SiteLayout && typeof window.SiteLayout.brandLockupTextMassive === 'function'
                        ? window.SiteLayout.brandLockupTextMassive()
                        : 'QUALQUER TECLA')
            );
            const fontSize = measureStaticWordmarkFontSize(container, text);
            if (fontSize && fontSize > 0) {
                container.style.setProperty('--static-wordmark-font-size', `${fontSize}px`);
            }
        };

        const fontsReady =
            document.fonts && typeof document.fonts.ready !== 'undefined'
                ? document.fonts.ready
                : Promise.resolve();

        fontsReady.then(() => {
            requestAnimationFrame(() => {
                run();
                requestAnimationFrame(run);
            });
        });
    }

    function bindStaticWordmarkResize(container) {
        if (!container || container.dataset.staticLayoutBound === '1') return;
        container.dataset.staticLayoutBound = '1';
        let resizeTimer;
        window.addEventListener('resize', () => {
            if (!container.classList.contains('is-liquid-static')) return;
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => layoutStaticWordmark(container), 150);
        });
    }

    function activateMassiveBrandStatic(container, reason, options) {
        if (!container || container.classList.contains('is-liquid-static')) return;

        const opts = options && typeof options === 'object' ? options : {};
        const persistSession = opts.persistSession !== false;
        const reasonStr = String(reason || '');
        liquidDebug('fallback:', reasonStr);

        container.classList.add('is-liquid-static');
        container.dataset.liquid = 'false';
        if (reasonStr) {
            container.dataset.liquidFallbackReason = reasonStr;
        }

        const inst = container.__liquidInstance;
        if (inst && typeof inst.destroy === 'function') {
            inst.destroy();
        } else if (inst && inst.rafId != null) {
            cancelAnimationFrame(inst.rafId);
        }
        container.__liquidInstance = null;

        container.querySelectorAll('canvas').forEach((el) => el.remove());
        delete container.dataset.liquidInit;
        delete container.dataset.liquidBooting;

        if (persistSession && isTechnicalLiquidReason(reasonStr)) {
            try {
                sessionStorage.setItem(LIQUID_SESSION_KEY, reasonStr);
            } catch (_) {
                /* ignore */
            }
        }

        layoutStaticWordmark(container);
        bindStaticWordmarkResize(container);
    }

    window.QualquerTeclaMassiveBrand = {
        activateStatic: activateMassiveBrandStatic,
        layoutStatic: layoutStaticWordmark
    };

    function bootLiquidEffect(container) {
        if (!container || container.classList.contains('is-liquid-static')) return;
        if (!window.LiquidDistortion || typeof window.LiquidDistortion.boot !== 'function') {
            activateMassiveBrandStatic(container, 'fx-load-failed');
            return;
        }
        window.LiquidDistortion.boot(container, activateMassiveBrandStatic);
    }

    const THREE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';

    function loadLiquidScripts(container) {
        if (!container || window.__liquidLoadStarted) return;
        window.__liquidLoadStarted = true;

        const base = window.SITE_BASE || '';
        let settled = false;

        const finishWithFallback = (reason) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeoutId);
            activateMassiveBrandStatic(container, reason);
        };

        const timeoutId = setTimeout(() => {
            finishWithFallback('script-timeout');
        }, LIQUID_SCRIPT_TIMEOUT_MS);

        const onFxReady = () => {
            if (settled) return;
            settled = true;
            clearTimeout(timeoutId);
            bootLiquidEffect(container);
        };

        const loadFx = () => {
            if (settled) return;
            const fx = document.createElement('script');
            fx.src = `${base}assets/js/liquid-distortion.js?v=${LIQUID_ASSET_VERSION}`;
            fx.onload = onFxReady;
            fx.onerror = () => finishWithFallback('fx-load-failed');
            document.body.appendChild(fx);
        };

        if (window.THREE) {
            loadFx();
            return;
        }

        const three = document.createElement('script');
        three.src = THREE_CDN;
        three.onload = loadFx;
        three.onerror = () => finishWithFallback('three-load-failed');
        document.body.appendChild(three);
    }

    function ensureHeadPreload(as, href, attrs) {
        if (!href || typeof document === 'undefined' || !document.head) return;
        const already = [...document.head.querySelectorAll('link[rel="preload"]')].some(
            (el) => el.getAttribute('as') === as && el.getAttribute('href') === href
        );
        if (already) return;
        const link = document.createElement('link');
        link.rel = 'preload';
        link.as = as;
        link.href = href;
        if (attrs && typeof attrs === 'object') {
            Object.keys(attrs).forEach((key) => {
                link.setAttribute(key, attrs[key]);
            });
        }
        document.head.appendChild(link);
    }

    /**
     * Antecipa Genos (textura/estático). Scripts WebGL: ver preloadLiquidScripts no boot.
     */
    function preloadMassiveBrandVisuals() {
        if (window.__massiveBrandPreloadStarted) return;
        window.__massiveBrandPreloadStarted = true;

        if (document.fonts && typeof document.fonts.load === 'function') {
            try {
                document.fonts.load('700 1em Genos').catch(() => {});
            } catch (_) {
                /* ignore */
            }
        }
    }

    function preloadLiquidScripts() {
        if (window.__liquidPreloadStarted) return;
        window.__liquidPreloadStarted = true;
        const base = window.SITE_BASE || '';
        ensureHeadPreload('script', THREE_CDN);
        ensureHeadPreload(
            'script',
            `${base}assets/js/liquid-distortion.js?v=${LIQUID_ASSET_VERSION}`
        );
    }

    /** Preload completo no boot; inicia WebGL só quando o brand se aproxima da viewport. */
    function initLiquidLazy() {
        const target = document.querySelector('.massive-brand-text[data-liquid="true"]');
        if (!target) return;

        preloadMassiveBrandVisuals();
        if (!prefersReducedLiquidMotion() && !hasLiquidSessionFallback()) {
            preloadLiquidScripts();
        }

        const start = () => {
            if (prefersReducedLiquidMotion()) {
                activateMassiveBrandStatic(target, 'reduced-motion', { persistSession: false });
                return;
            }
            const sessionReason = hasLiquidSessionFallback();
            if (sessionReason) {
                activateMassiveBrandStatic(target, sessionReason);
                return;
            }
            liquidDebug('attempting WebGL');
            preloadLiquidScripts();
            loadLiquidScripts(target);
        };

        if ('IntersectionObserver' in window) {
            const io = new IntersectionObserver(
                (entries) => {
                    if (entries.some((e) => e.isIntersecting)) {
                        start();
                        io.disconnect();
                    }
                },
                /* Antecipa o boot enquanto o usuário ainda está acima do footer */
                { rootMargin: '600px 0px' }
            );
            io.observe(target);
        } else {
            start();
        }
    }

    // Páginas
    async function initCategoryPage() {
        const feed = document.getElementById('category-feed');
        if (!feed || !window.API) {
            if (feed) feed.removeAttribute('aria-busy');
            const nameElEarly = document.getElementById('categoryName');
            if (nameElEarly) {
                if (nameElEarly.getAttribute('aria-busy') === 'true' || nameElEarly.querySelector('.qt-skel-line')) {
                    nameElEarly.textContent = 'Editoria';
                }
                nameElEarly.removeAttribute('aria-busy');
            }
            return;
        }
        const shellStartedAt = Date.now();

        const params = new URLSearchParams(window.location.search);
        const slugRaw = params.get('slug');
        const slug = String(slugRaw || '').trim();

        /** Destinos 301 editoriais para slugs removidos na Taxonomia v2. */
        const LEGACY_CATEGORY_REDIRECTS = {
            negocios: 'tech',
            politica: 'cultura-digital'
        };

        const setRobots = (content) => {
            let el = document.querySelector('meta[name="robots"]');
            if (!el) {
                el = document.createElement('meta');
                el.setAttribute('name', 'robots');
                document.head.appendChild(el);
            }
            el.setAttribute('content', content);
        };

        const setMetaProperty = (property, content) => {
            let el = document.querySelector(`meta[property="${property}"]`);
            if (!el) {
                el = document.createElement('meta');
                el.setAttribute('property', property);
                document.head.appendChild(el);
            }
            el.setAttribute('content', content);
        };

        const nameEl = document.getElementById('categoryName');
        const descEl = document.getElementById('categoryDescription');
        const subnavEl = document.getElementById('categorySubnav');
        const btn = document.getElementById('load-more-category');

        const clearRobotsNoindex = () => {
            const el = document.querySelector('meta[name="robots"]');
            if (!el) return;
            const content = String(el.getAttribute('content') || '').toLowerCase();
            if (content.includes('noindex')) {
                el.setAttribute('content', 'index,follow');
            }
        };

        const setCategoryHeading = (label, description, slug) => {
            const title = String(label || '').trim() || 'Editoria';
            if (nameEl) {
                nameEl.textContent = title;
                nameEl.removeAttribute('aria-busy');
            }
            const mark = categoryWatermarkLabel(title, slug);
            setCategoryWatermarkText(mark.toLocaleUpperCase('pt-BR'));
            if (descEl) {
                const text = String(description || '').trim();
                descEl.textContent = text;
                descEl.hidden = !text;
            }
        };

        const renderCategorySubnav = (hubSlug) => {
            if (!subnavEl) return;
            subnavEl.innerHTML = '';
            subnavEl.hidden = true;
            if (!hubSlug || !window.SiteState || !Array.isArray(window.SiteState.categories)) {
                return;
            }
            const children = window.SiteState.categories.filter(
                (c) => c && c.parent === hubSlug && c.slug
            );
            if (!children.length) return;

            const list = document.createElement('ul');
            list.className = 'category-subnav-list';
            children.forEach((c) => {
                const li = document.createElement('li');
                const a = document.createElement('a');
                a.href = categoryUrl(c.slug);
                a.textContent = c.name || c.slug;
                li.appendChild(a);
                list.appendChild(li);
            });
            subnavEl.appendChild(list);
            subnavEl.hidden = false;
        };

        const showCategoryNotFound = (message) => {
            setRobots('noindex,follow');
            if (subnavEl) {
                subnavEl.innerHTML = '';
                subnavEl.hidden = true;
            }
            setCategoryHeading(
                'Editoria não encontrada',
                'Esta editoria não faz parte da cobertura do Qualquer Tecla.'
            );
            document.title = 'Editoria não encontrada | Qualquer Tecla';
            const metaDesc = document.querySelector('meta[name="description"]');
            if (metaDesc) {
                metaDesc.setAttribute(
                    'content',
                    'Editoria não encontrada no portal Qualquer Tecla.'
                );
            }
            let canonical = document.querySelector('link[rel="canonical"]');
            if (canonical) {
                canonical.setAttribute('href', 'https://qualquertecla.com.br/');
            }
            feed.innerHTML = `<div class="col-12">${notFoundStateHtml(
                message ||
                    'Editoria não encontrada. Confira as editorias no menu ou volte ao início.'
            )}</div>`;
            feed.removeAttribute('aria-busy');
            if (btn) btn.hidden = true;
        };

        if (!slug) {
            showCategoryNotFound(
                'Nenhuma editoria especificada. Escolha uma categoria no menu.'
            );
            return;
        }

        if (Object.prototype.hasOwnProperty.call(LEGACY_CATEGORY_REDIRECTS, slug)) {
            const dest = LEGACY_CATEGORY_REDIRECTS[slug];
            const url = `${window.SITE_BASE || ''}categoria.html?slug=${encodeURIComponent(dest)}`;
            window.location.replace(url);
            return;
        }

        try {
            const cat = await window.API.getCategoryBySlug(slug);

            if (!cat) {
                showCategoryNotFound();
                return;
            }

            const displayName = cat.name;
            const desc = cat.description || 'Editoria do Qualquer Tecla.';

            setCategoryHeading(displayName, desc, slug);
            renderCategorySubnav(slug);
            document.title = `${displayName} | Qualquer Tecla`;
            const metaDesc = document.querySelector('meta[name="description"]');
            if (metaDesc) metaDesc.setAttribute('content', desc);
            const canonicalHref = `https://qualquertecla.com.br/categoria.html?slug=${encodeURIComponent(slug)}`;
            let canonical = document.querySelector('link[rel="canonical"]');
            if (!canonical) {
                canonical = document.createElement('link');
                canonical.setAttribute('rel', 'canonical');
                document.head.appendChild(canonical);
            }
            canonical.setAttribute('href', canonicalHref);
            setMetaProperty('og:title', `${displayName} | Qualquer Tecla`);
            setMetaProperty('og:description', desc);
            setMetaProperty('og:url', canonicalHref);

            const news = await window.API.getNewsByCategory(slug, 12);
            if (!news.length) {
                setRobots('noindex,follow');
                feed.innerHTML = `<div class="col-12">${notFoundStateHtml(
                    'Nenhuma notícia encontrada para esta editoria no momento.',
                    'Ainda não há conteúdos publicados nesta seção.'
                )}</div>`;
                feed.removeAttribute('aria-busy');
                if (btn) btn.hidden = true;
                return;
            }

            clearRobotsNoindex();
            if (window.PublicSkeleton && typeof window.PublicSkeleton.waitTextShell === 'function') {
                await window.PublicSkeleton.waitTextShell(shellStartedAt);
            }
            feed.innerHTML = news.map((item) => newsCardHtml(item, 'col-md-6 col-lg-4')).join('');
            feed.removeAttribute('aria-busy');
            if (window.PublicSkeleton && typeof window.PublicSkeleton.enter === 'function') {
                window.PublicSkeleton.enter(feed);
            }
            if (btn) btn.hidden = true;
        } catch (err) {
            console.error(err);
            setCategoryHeading(
                'Editoria',
                'Não foi possível carregar esta editoria no momento.'
            );
            showError(feed, 'Erro ao carregar a editoria.');
            feed.removeAttribute('aria-busy');
        }
    }

    async function initSearchPage() {
        const results = document.getElementById('search-results');
        const resText = document.getElementById('searchResultText');
        if (!results || !window.API) {
            if (results) results.removeAttribute('aria-busy');
            return;
        }

        function searchPromptHtml(opts = {}) {
            const prefill = escapeHtml(String(opts.prefill || ''));
            const hint =
                opts.hint ||
                'Digite um termo ou use a lupa no topo da página.';
            return `
<div class="col-12">
  <div class="page-search-prompt">
    <form class="page-search-form" action="busca.html" method="get" role="search">
      <label class="visually-hidden" for="pageSearchInput">Buscar notícias</label>
      <div class="input-group page-search-input-group">
        <input type="search" class="form-control" id="pageSearchInput" name="q" value="${prefill}" placeholder="Buscar no Qualquer Tecla…" autocomplete="off" required>
        <button type="submit" class="btn btn-gold">Buscar</button>
      </div>
    </form>
    <p class="page-search-hint text-secondary mt-3 mb-0">${escapeHtml(hint)}</p>
  </div>
</div>`;
        }

        async function runSearch(term) {
            const q = String(term || '').trim();
            if (!q) {
                results.innerHTML = searchPromptHtml();
                results.removeAttribute('aria-busy');
                if (resText) resText.textContent = 'Buscar notícias';
                document.getElementById('pageSearchInput')?.focus();
                return;
            }

            const shellStartedAt = Date.now();

            if (resText) {
                resText.textContent = '';
                resText.appendChild(document.createTextNode('Exibindo resultados para: '));
                const span = document.createElement('span');
                span.className = 'text-gold';
                span.textContent = `"${q}"`;
                resText.appendChild(span);
            }

            results.setAttribute('aria-busy', 'true');
            results.innerHTML =
                window.PublicSkeleton && typeof window.PublicSkeleton.feedHtml === 'function'
                    ? window.PublicSkeleton.feedHtml(6, 'col-md-6 col-lg-4')
                    : results.innerHTML;

            try {
                const news = await window.API.searchArticles(q, 20);
                if (window.PublicSkeleton && typeof window.PublicSkeleton.waitTextShell === 'function') {
                    await window.PublicSkeleton.waitTextShell(shellStartedAt);
                }
                if (!news.length) {
                    results.innerHTML = `${searchPromptHtml({
                        prefill: q,
                        hint: 'Nenhum resultado para este termo. Tente outra busca.'
                    })}`;
                    if (resText) {
                        resText.textContent = '';
                        resText.appendChild(document.createTextNode('Nenhum resultado para: '));
                        const span = document.createElement('span');
                        span.className = 'text-gold';
                        span.textContent = `"${q}"`;
                        resText.appendChild(span);
                    }
                    document.getElementById('pageSearchInput')?.focus();
                    results.removeAttribute('aria-busy');
                    return;
                }
                if (resText) {
                    resText.textContent = '';
                    resText.appendChild(
                        document.createTextNode(
                            `${news.length} resultado${news.length === 1 ? '' : 's'} para: `
                        )
                    );
                    const span = document.createElement('span');
                    span.className = 'text-gold';
                    span.textContent = `"${q}"`;
                    resText.appendChild(span);
                }
                results.innerHTML = news.map((item) => newsCardHtml(item, 'col-md-6 col-lg-4')).join('');
                results.removeAttribute('aria-busy');
                if (window.PublicSkeleton && typeof window.PublicSkeleton.enter === 'function') {
                    window.PublicSkeleton.enter(results);
                }
            } catch (err) {
                console.error(err);
                showError(results, 'Erro ao realizar a busca.');
                results.removeAttribute('aria-busy');
            }
        }

        const initial = new URLSearchParams(window.location.search).get('q') || '';
        runSearch(initial);
    }

    async function initArticlePage(overrideSlug) {
        // Bugfix: token global para evitar que navegações antigas 
        // ou mais lentas sobrescrevam a interface do artigo atual
        // durante skips muito rápidos (A->B->C).
        window.__maryArticlePageToken = (window.__maryArticlePageToken || 0) + 1;
        const currentToken = window.__maryArticlePageToken;

        const container = document.getElementById('article-container');
        if (!container || !window.API) {
            if (container) container.removeAttribute('aria-busy');
            return;
        }
        const shellStartedAt = Date.now();

        const setRobots = (content) => {
            let el = document.querySelector('meta[name="robots"]');
            if (!el) {
                el = document.createElement('meta');
                el.setAttribute('name', 'robots');
                document.head.appendChild(el);
            }
            el.setAttribute('content', content);
        };

        const slug = overrideSlug || new URLSearchParams(window.location.search).get('slug');
        if (!slug) {
            setRobots('noindex,follow');
            if (window.PublicSkeleton && typeof window.PublicSkeleton.waitTextShell === 'function') {
                await window.PublicSkeleton.waitTextShell(shellStartedAt);
            }
            if (currentToken !== window.__maryArticlePageToken) return;
            container.innerHTML = emptyStateHtml({
                title: 'Nenhuma notícia especificada',
                text: 'Abra uma matéria a partir da home, de uma editoria ou da busca.',
                icon: 'ph-article',
                showHomeCta: true
            });
            container.removeAttribute('aria-busy');
            return;
        }

        try {
            const article = await window.API.getArticleBySlug(slug);
            if (currentToken !== window.__maryArticlePageToken) return;

            if (!article) {
                setRobots('noindex,follow');
                if (window.PublicSkeleton && typeof window.PublicSkeleton.waitTextShell === 'function') {
                    await window.PublicSkeleton.waitTextShell(shellStartedAt);
                }
                container.innerHTML = notFoundStateHtml('Artigo não encontrado');
                container.removeAttribute('aria-busy');
                return;
            }

            const cat = article.categories || {};
            const authorObj = article.authors || { name: 'Autor' };
            const authorName = authorObj.name || 'Autor';
            const safeContent = sanitizeHtml(article.content || '');
            const searchBase = (window.SITE_BASE || '') + 'busca.html';
            const tags = (article.tags || [])
                .map((tag) => {
                    const label = String(tag || '').trim();
                    if (!label) return '';
                    const href = `${searchBase}?q=${encodeURIComponent(label)}`;
                    return `<a href="${escapeAttr(href)}" class="article-tag">${escapeHtml(label)}</a>`;
                })
                .filter(Boolean)
                .join('');

            const relatedList = await window.API.getRelatedArticles(article, 3);
            if (currentToken !== window.__maryArticlePageToken) return;
            const relatedHtml =
                relatedList && relatedList.length
                    ? `
<section class="article-related" aria-labelledby="related-heading">
  <h2 id="related-heading" class="font-editorial article-related-heading">Artigos relacionados</h2>
  <div class="row g-4 article-related-grid">
    ${relatedList.map((item) => newsCardHtml(item, 'col-12 col-md-4')).join('')}
  </div>
</section>`
                    : '';

            let sourceHtml = '';
            {
                const reportSubject = encodeURIComponent(
                    `Reportar este artigo: ${article.title || article.slug || 'sem título'}`
                );
                const reportBody = encodeURIComponent(
                    `Gostaria de reportar o seguinte artigo:\n\n${window.location.href}\n\nMotivo:\n`
                );
                const contactEmail =
                    (window.SiteLayout &&
                        typeof window.SiteLayout.readSiteSettingsSync === 'function' &&
                        window.SiteLayout.readSiteSettingsSync().contactEmail) ||
                    'redacao@qualquertecla.com.br';
                const reportHref = `mailto:${contactEmail}?subject=${reportSubject}&body=${reportBody}`;
                const reportLink = `
  <a href="${escapeAttr(reportHref)}" class="article-report-link">
    <i class="ph ph-flag" aria-hidden="true"></i>
    <span>Reportar este artigo</span>
  </a>`;

                let fonteLine = '';
                const sourceList = Array.isArray(article.sources)
                    ? article.sources.filter((s) => s && (s.name || s.url))
                    : [];
                const renderSourceItem = (s) => {
                    const label = escapeHtml(s.name || 'Fonte original');
                    if (s.url && /^https?:\/\//i.test(s.url)) {
                        return `<a href="${escapeAttr(s.url)}" class="article-source-link" target="_blank" rel="noopener noreferrer">${label}</a>`;
                    }
                    return `<span class="article-source-label">${label}</span>`;
                };
                if (sourceList.length) {
                    const prefix = sourceList.length > 1 ? 'Fontes' : 'Fonte';
                    const items = sourceList.map(renderSourceItem).join(' <span class="article-source-sep" aria-hidden="true">·</span> ');
                    fonteLine = `
  <p class="article-source-line">
    <i class="ph ph-link-simple text-gold me-1" aria-hidden="true"></i>
    ${prefix} ·
    ${items}
  </p>`;
                } else if (article.source_name || article.source_url) {
                    fonteLine = `
  <p class="article-source-line">
    <i class="ph ph-link-simple text-gold me-1" aria-hidden="true"></i>
    Fonte ·
    ${renderSourceItem({ name: article.source_name, url: article.source_url })}
  </p>`;
                }

                sourceHtml = `
<div class="article-source">
  <div class="article-source-row">
    ${fonteLine}
    ${reportLink}
  </div>
</div>`;
            }

            document.title = `${article.title} | Qualquer Tecla`;
            const editorial = categoryWatermarkLabel(cat.name, cat.slug);
            setCategoryWatermarkText(
                editorial ? editorial.toLocaleUpperCase('pt-BR') : ''
            );
            const metaDesc = document.querySelector('meta[name="description"]');
            if (metaDesc) metaDesc.setAttribute('content', article.excerpt || article.subtitle || '');

            // Open Graph dinâmico
            const setMeta = (attr, key, val) => {
                let el = document.querySelector(`meta[${attr}="${key}"]`);
                if (!el) {
                    el = document.createElement('meta');
                    el.setAttribute(attr, key);
                    document.head.appendChild(el);
                }
                el.setAttribute('content', val);
            };
            setMeta('property', 'og:title', article.title);
            setMeta('property', 'og:description', article.excerpt || article.subtitle || '');
            setMeta('property', 'og:type', 'article');
            const pageUrl = `https://qualquertecla.com.br/noticia.html?slug=${encodeURIComponent(article.slug || '')}`;
            setMeta('property', 'og:url', pageUrl);
            let canonical = document.querySelector('link[rel="canonical"]');
            if (!canonical) {
                canonical = document.createElement('link');
                canonical.setAttribute('rel', 'canonical');
                document.head.appendChild(canonical);
            }
            canonical.setAttribute('href', pageUrl);
            const ogImage = article.featured_image
                ? (/^https?:\/\//i.test(article.featured_image)
                      ? article.featured_image
                      : `https://qualquertecla.com.br/${article.featured_image.replace(/^\//, '')}`)
                : '';
            if (ogImage) setMeta('property', 'og:image', ogImage);
            if (article.published_at) {
                setMeta('property', 'article:published_time', article.published_at);
            }
            const modifiedAt = article.updated_at || article.published_at;
            if (modifiedAt) {
                setMeta('property', 'article:modified_time', modifiedAt);
            }
            if (authorName) {
                setMeta('property', 'article:author', authorName);
            }
            if (cat.name) {
                setMeta('property', 'article:section', cat.name);
            }
            setMeta('name', 'twitter:card', ogImage ? 'summary_large_image' : 'summary');
            setMeta('name', 'twitter:title', article.title);
            setMeta('name', 'twitter:description', article.excerpt || article.subtitle || '');
            if (ogImage) setMeta('name', 'twitter:image', ogImage);

            // JSON-LD NewsArticle (Googlebot executa JS).
            // LIMITAÇÃO: scrapers sociais (WhatsApp/Facebook/LinkedIn) leem o HTML inicial
            // estático de noticia.html — meta genérica até haver prerender/edge injection.
            let ld = document.getElementById('article-jsonld');
            if (!ld) {
                ld = document.createElement('script');
                ld.type = 'application/ld+json';
                ld.id = 'article-jsonld';
                document.head.appendChild(ld);
            }
            const absImage = ogImage || undefined;
            const crumbTrail = buildArticleBreadcrumbTrail(cat, article.title, pageUrl);
            const breadcrumbJsonLd = {
                '@type': 'BreadcrumbList',
                itemListElement: crumbTrail.map((item, idx) => {
                    const entry = {
                        '@type': 'ListItem',
                        position: idx + 1,
                        name: item.name
                    };
                    if (item.url) entry.item = item.url;
                    return entry;
                })
            };
            ld.textContent = JSON.stringify({
                '@context': 'https://schema.org',
                '@graph': [
                    {
                        '@type': 'NewsArticle',
                        headline: article.title,
                        description: article.excerpt || article.subtitle || '',
                        image: absImage ? [absImage] : undefined,
                        datePublished: article.published_at || undefined,
                        dateModified: article.updated_at || article.published_at || undefined,
                        author: {
                            '@type': 'Person',
                            name: authorName
                        },
                        publisher: {
                            '@type': 'Organization',
                            name: 'Qualquer Tecla',
                            url: 'https://qualquertecla.com.br/'
                        },
                        mainEntityOfPage: pageUrl,
                        articleSection: cat.name || undefined
                    },
                    breadcrumbJsonLd
                ]
            });

            const hasImage = Boolean(article.featured_image);
            const headerClass = hasImage
                ? 'article-header article-header--with-image'
                : 'article-header';
            const publishedLabel = formatArticleDateTime(article.published_at);
            const readingMins = String(article.reading_time || 5);

            const featuredHtml = hasImage
                ? `
<figure class="article-featured">
  ${responsiveFeaturedHtml(article.featured_image, article.title, {
      className: 'article-featured-img',
      width: 1280,
      height: 720,
      sizes: '(max-width: 992px) 100vw, 800px',
      lazy: false,
      fetchPriority: 'high'
  })}
  ${
      article.image_caption
          ? `<figcaption class="image-caption">${escapeHtml(article.image_caption)}</figcaption>`
          : ''
  }
</figure>`
                : '';

            const breadcrumbHtml = crumbTrail
                .map((item, idx) => {
                    const isLast = idx === crumbTrail.length - 1;
                    if (isLast || !item.path) {
                        return `<li class="breadcrumb-item active" aria-current="page">${escapeHtml(item.name)}</li>`;
                    }
                    const linkClass =
                        idx === 0
                            ? 'text-secondary text-decoration-none'
                            : 'text-gold fw-bold text-decoration-none';
                    const icon =
                        idx === 0
                            ? '<i class="ph ph-house" aria-hidden="true"></i> '
                            : '';
                    return `<li class="breadcrumb-item"><a href="${escapeAttr(item.path)}" class="${linkClass}">${icon}${escapeHtml(item.name)}</a></li>`;
                })
                .join('');

            const aiSummaryText = String(article.ai_summary || '').trim();

            if (window.PublicSkeleton && typeof window.PublicSkeleton.waitTextShell === 'function') {
                await window.PublicSkeleton.waitTextShell(shellStartedAt);
            }
            if (currentToken !== window.__maryArticlePageToken) return;

            container.innerHTML = `
<div class="row position-relative">
  <div class="col-lg-2 d-none d-lg-block"></div>
  <div class="col-lg-8">
    <header class="${headerClass}">
      <nav aria-label="breadcrumb">
        <ol class="breadcrumb article-breadcrumb">
          ${breadcrumbHtml}
        </ol>
      </nav>
      <h1 class="article-title font-editorial">${escapeHtml(article.title)}</h1>
      ${
          article.subtitle
              ? `<p class="article-subtitle">${escapeHtml(article.subtitle)}</p>`
              : ''
      }
      <p class="article-reading-time">
        <i class="ph ph-clock" aria-hidden="true"></i>
        <span>${escapeHtml(readingMins)} min de leitura</span>
      </p>
      <div class="article-meta-bar">
        <div class="author-info">
          <div class="author-avatar">${authorAvatarImgHtml(authorObj)}</div>
          <div class="author-meta-text">
            <div class="author-name">${escapeHtml(authorName)}</div>
            <time class="author-datetime" datetime="${escapeAttr(article.published_at || '')}" data-full="${escapeAttr(publishedLabel)}" title="${escapeAttr(publishedLabel)}">${escapeHtml(publishedLabel)}</time>
          </div>
        </div>
        <div class="article-meta-actions">
          <button type="button" class="article-meta-action article-meta-action--listen" id="articleListenBtn" aria-pressed="false" aria-label="Ouvir com Mary AI">
            <i class="ph ph-speaker-high" aria-hidden="true" data-listen-icon></i>
            <span data-listen-label>Ouvir com Mary AI</span>
          </button>
          <button type="button" class="article-meta-action" id="articleCommentBtn" aria-controls="commentsOffcanvas" data-bs-toggle="offcanvas" data-bs-target="#commentsOffcanvas">
            <i class="ph ph-chat-circle-text" aria-hidden="true"></i>
            <span>Comentar</span>
          </button>
          <button type="button" class="article-meta-action" id="articleShareBtn" aria-label="Enviar matéria">
            <i class="ph ph-export" aria-hidden="true"></i>
            <span>Enviar</span>
          </button>
        </div>
      </div>
      ${featuredHtml}
    </header>
    ${
        aiSummaryText
            ? `<details class="article-summary">
      <summary class="article-summary__label">Resumo</summary>
      <div class="article-summary__body">
        <p class="article-summary__text">${escapeHtml(aiSummaryText)}</p>
        <p class="article-summary__credit">Gerado por <a href="sobre-mary-ai.html">Mary AI</a></p>
      </div>
    </details>`
            : ''
    }
    <div class="article-content font-editorial">${safeContent}</div>
    <div class="article-outro">
      ${sourceHtml}
      ${articleAuthorBoxHtml(authorObj)}
      ${
          tags
              ? `<div class="article-tags"><div class="d-flex flex-wrap gap-2">${tags}</div></div>`
              : ''
      }
      ${relatedHtml}
      ${
          window.ArticleReactions
              ? window.ArticleReactions.markup(article.slug || article.id || '')
              : ''
      }
      <div class="article-comments-launch" id="comentarios">
        <button type="button" class="btn btn-outline-gold comments-launch-btn" data-bs-toggle="offcanvas" data-bs-target="#commentsOffcanvas" aria-controls="commentsOffcanvas">
          <span>
            <span class="disqus-comment-count" data-disqus-identifier="${escapeAttr(article.slug)}">0</span>
            Comentários
          </span>
        </button>
      </div>
    </div>
  </div>
  <div class="col-lg-2 d-none d-lg-block"></div>
</div>`;

            if (window.PublicSkeleton && typeof window.PublicSkeleton.enter === 'function') {
                window.PublicSkeleton.enter(container);
            }
            mountCommentsPanel(article);
            initAuthorDatetimeReveal();
            initReadingProgress();
            if (window.Mary && typeof window.Mary.mount === 'function' && aiSummaryText) {
                const resolveAudio = (u) => {
                    const raw = String(u || '').trim();
                    if (!raw) return '';
                    return window.MockData && typeof window.MockData.assetPath === 'function'
                        ? window.MockData.assetPath(raw)
                        : raw;
                };
                window.Mary.mount({
                    summary: aiSummaryText,
                    title: article.title || '',
                    slug: article.slug || '',
                    articleId: article.id || '',
                    audioSummaryUrl: resolveAudio(article.audio_summary_url),
                    audioStatus: String(article.audio_status || '').trim()
                });
            } else if (window.Mary && typeof window.Mary.unmount === 'function') {
                window.Mary.unmount();
            }
            initArticleMetaActions(article);
            container.removeAttribute('aria-busy');
            if (window.ArticleReactions) {
                window.ArticleReactions.initInContainer(
                    container,
                    article.slug || article.id || '',
                    { articleUuid: article.id || null }
                );
            }
        } catch (err) {
            console.error(err);
            showError(container, 'Erro ao carregar o artigo.');
            container.removeAttribute('aria-busy');
        }
    }


    function mountCommentsPanel(article) {
        const root = document.getElementById('comments-root');
        if (!root) return;

        window.__qualquerTeclaCommentsArticle = article;

        const guidelines = (window.SITE_BASE || '') + 'politica-editorial.html';
        const identifier = article.slug || article.id || window.location.pathname;

        root.innerHTML = `
<aside class="offcanvas offcanvas-end mobile-menu-offcanvas comments-offcanvas" tabindex="-1" id="commentsOffcanvas" aria-labelledby="commentsOffcanvasLabel">
  <div class="mobile-menu-watermark comments-watermark" aria-hidden="true">COMENTÁRIOS</div>

  <div class="comments-panel-top">
    <div class="comments-panel-header">
      <h2 class="comments-panel-title" id="commentsOffcanvasLabel">
        <i class="ph ph-chat-circle-text" aria-hidden="true"></i>
        <span>Comentários</span>
      </h2>
      <button type="button" class="mobile-menu-close" data-bs-dismiss="offcanvas" aria-label="Fechar comentários">
        <i class="ph ph-x" aria-hidden="true"></i>
      </button>
    </div>
  </div>

  <div class="offcanvas-body comments-panel-body p-0 d-flex flex-column">
    <div class="comments-panel-scroll" id="commentsPanelScroll">
      <p class="comments-intro">
        Participe da conversa com respeito. Leia as
        <a href="${escapeAttr(guidelines)}">diretrizes da comunidade</a>
        antes de comentar.
      </p>
      <div class="comments-status" role="status">
        <i class="ph ph-users" aria-hidden="true"></i>
        <span>Discussão aberta nesta matéria</span>
      </div>
      <div class="comments-toolbar">
        <div class="comments-count-pill">
          Todos
          <span class="count"><span class="disqus-comment-count" data-disqus-identifier="${escapeAttr(identifier)}">0</span></span>
        </div>
        <span class="comments-sort-hint">Ordenação via Disqus</span>
      </div>
      <div class="comments-disqus-shell">
        <div id="disqus_thread"></div>
        <div class="comments-fallback" id="disqusFallback" hidden>
          <i class="ph ph-chat-circle-dots" aria-hidden="true"></i>
          <p class="comments-fallback-title">Comentários em breve</p>
          <p class="comments-fallback-text">
            A discussão desta matéria ainda não está disponível. Volte em breve para participar.
          </p>
        </div>
      </div>
    </div>
    <div class="comments-panel-footer">
      <a href="#commentsPanelScroll" class="comments-top-link" id="commentsTopLink">
        <i class="ph ph-arrow-up" aria-hidden="true"></i>
        Topo dos comentários
      </a>
    </div>
  </div>
</aside>`;

        const topLink = document.getElementById('commentsTopLink');
        if (topLink) {
            topLink.addEventListener('click', (e) => {
                e.preventDefault();
                const host = document.getElementById('commentsPanelScroll');
                const scroller =
                    (window.SiteScrollbar &&
                        typeof window.SiteScrollbar.getScroller === 'function' &&
                        window.SiteScrollbar.getScroller(host)) ||
                    host;
                if (scroller) scroller.scrollTo({ top: 0, behavior: 'smooth' });
            });
        }

        if (window.SiteScrollbar && typeof window.SiteScrollbar.refresh === 'function') {
            window.SiteScrollbar.refresh();
        }

        const panel = document.getElementById('commentsOffcanvas');
        if (panel) {
            panel.addEventListener('shown.bs.offcanvas', () => {
                loadDisqus(article);
                // Evita o trigger ficar com :focus “preso” sob o painel
                document.querySelectorAll('.comments-launch-btn, #articleCommentBtn').forEach((el) => {
                    if (el && typeof el.blur === 'function') el.blur();
                });
                if (window.SiteScrollbar && typeof window.SiteScrollbar.refresh === 'function') {
                    window.SiteScrollbar.refresh();
                }
            });
            panel.addEventListener('hidden.bs.offcanvas', () => {
                // Bootstrap devolve o foco ao botão; solta para não parecer pressionado
                requestAnimationFrame(() => {
                    document.querySelectorAll('.comments-launch-btn, #articleCommentBtn').forEach((el) => {
                        if (el && typeof el.blur === 'function') el.blur();
                    });
                });
            });
        }

        if (!document.documentElement.dataset.consentDisqusBound) {
            document.documentElement.dataset.consentDisqusBound = '1';
            window.addEventListener('qualquer-tecla:consentchange', (ev) => {
                const marketing = ev && ev.detail && ev.detail.consent && ev.detail.consent.marketing;
                const openPanel = document.getElementById('commentsOffcanvas');
                const current = window.__qualquerTeclaCommentsArticle;
                if (!marketing || !current || !openPanel || !openPanel.classList.contains('show')) return;
                loadDisqus(current);
            });
        }

        if (window.location.hash === '#comentarios' && window.bootstrap) {
            const instance = window.bootstrap.Offcanvas.getOrCreateInstance(panel);
            instance.show();
        }
    }

    function showDisqusFallback(message) {
        const fallback = document.getElementById('disqusFallback');
        const thread = document.getElementById('disqus_thread');
        if (thread) {
            thread.innerHTML = '';
            thread.hidden = true;
        }
        if (!fallback) return;
        fallback.hidden = false;
        fallback.querySelectorAll('[data-consent-open-disqus]').forEach((el) => el.remove());
        if (message) {
            const text = fallback.querySelector('.comments-fallback-text');
            if (text) text.textContent = message;
        }
    }

    function watchDisqusFailure(thread) {
        const failRe = /n[aã]o foi poss[ií]vel carregar o disqus/i;
        const check = () => {
            if (!thread || thread.hidden) return;
            const text = (thread.textContent || '').trim();
            if (failRe.test(text)) {
                showDisqusFallback(
                    'Não foi possível carregar a discussão. Confira o shortname em config/disqus.js e o domínio no Disqus Admin.'
                );
                return true;
            }
            return false;
        };

        if (check()) return;
        const observer = new MutationObserver(() => {
            if (check()) observer.disconnect();
        });
        observer.observe(thread, { childList: true, subtree: true, characterData: true });
        window.setTimeout(() => {
            observer.disconnect();
            check();
        }, 8000);
    }

    function loadDisqus(article) {
        const shortname = window.DISQUS_SHORTNAME;
        const fallback = document.getElementById('disqusFallback');
        const thread = document.getElementById('disqus_thread');
        if (!thread) return;

        const consentOk =
            !window.SiteConsent ||
            (typeof window.SiteConsent.allows === 'function' &&
                window.SiteConsent.allows('marketing'));

        if (!consentOk) {
            showDisqusFallback(
                'Os comentários usam um serviço de terceiros. Ative os cookies de marketing nas preferências de privacidade para carregar a discussão.'
            );
            const prefsLink = document.createElement('button');
            prefsLink.type = 'button';
            prefsLink.className = 'btn btn-outline-gold btn-sm mt-3';
            prefsLink.textContent = 'Gerenciar cookies';
            prefsLink.addEventListener('click', () => {
                if (window.SiteConsent) window.SiteConsent.open();
            });
            if (fallback && !fallback.querySelector('[data-consent-open-disqus]')) {
                prefsLink.setAttribute('data-consent-open-disqus', '1');
                fallback.appendChild(prefsLink);
            }
            return;
        }

        if (!window.DISQUS_ENABLED || !shortname) {
            showDisqusFallback();
            return;
        }
        if (fallback) fallback.hidden = true;
        thread.hidden = false;

        const pageUrl = window.location.href.split('#')[0];
        const pageId = article.slug || article.id || pageUrl;

        window.disqus_config = function disqus_config() {
            this.page.url = pageUrl;
            this.page.identifier = pageId;
            this.page.title = article.title || document.title;
            this.language = 'pt_BR';
        };

        if (window.DISQUS) {
            try {
                window.DISQUS.reset({
                    reload: true,
                    config: window.disqus_config
                });
                watchDisqusFailure(thread);
            } catch (_) {
                showDisqusFallback();
            }
            return;
        }

        if (document.getElementById('disqus-embed-js')) {
            watchDisqusFailure(thread);
            return;
        }

        const s = document.createElement('script');
        s.id = 'disqus-embed-js';
        s.src = `https://${encodeURIComponent(shortname)}.disqus.com/embed.js`;
        s.setAttribute('data-timestamp', String(Date.now()));
        s.setAttribute('data-consent-category', 'marketing');
        s.async = true;
        s.onload = () => watchDisqusFailure(thread);
        s.onerror = () => {
            showDisqusFallback(
                'Não foi possível carregar a discussão. Verifique o shortname em config/disqus.js.'
            );
        };
        (document.head || document.body).appendChild(s);

        if (!document.getElementById('dsq-count-scr')) {
            const c = document.createElement('script');
            c.id = 'dsq-count-scr';
            c.src = `https://${encodeURIComponent(shortname)}.disqus.com/count.js`;
            c.setAttribute('data-consent-category', 'marketing');
            c.async = true;
            (document.head || document.body).appendChild(c);
        }
    }

    let authorDatetimeCleanup = null;

    function initAuthorDatetimeReveal() {
        if (typeof authorDatetimeCleanup === 'function') {
            authorDatetimeCleanup();
            authorDatetimeCleanup = null;
        }

        const el = document.querySelector('.article-meta-bar .author-datetime');
        if (!el) return;

        const full = String(el.getAttribute('data-full') || el.textContent || '').trim();
        if (full) {
            el.setAttribute('data-full', full);
            el.setAttribute('title', full);
        }

        let ignoreOutsideUntil = 0;
        let ro = null;

        const applyTruncationUi = (truncated) => {
            el.classList.toggle('is-truncated', truncated);
            if (truncated) {
                el.setAttribute('tabindex', '0');
                el.setAttribute('role', 'button');
                el.setAttribute('aria-expanded', el.classList.contains('is-expanded') ? 'true' : 'false');
                el.setAttribute('aria-label', `Data completa: ${full}`);
            } else {
                el.removeAttribute('tabindex');
                el.removeAttribute('role');
                el.removeAttribute('aria-expanded');
                el.classList.remove('is-expanded');
                if (full) el.setAttribute('aria-label', full);
            }
        };

        const syncTruncation = () => {
            // Medir só no estado recolhido — expandido muda a largura e causa loop/flicker.
            if (el.classList.contains('is-expanded')) return;
            const truncated = el.scrollWidth > el.clientWidth + 1;
            applyTruncationUi(truncated);
        };

        const setExpanded = (open) => {
            if (!el.classList.contains('is-truncated') && open) return;
            el.classList.toggle('is-expanded', !!open);
            if (el.classList.contains('is-truncated')) {
                el.setAttribute('aria-expanded', open ? 'true' : 'false');
            }
            if (!open) {
                // Remedir depois de recolhido (layout estável).
                requestAnimationFrame(syncTruncation);
            }
        };

        const onClick = (event) => {
            if (!el.classList.contains('is-truncated')) return;
            event.preventDefault();
            event.stopPropagation();
            ignoreOutsideUntil = Date.now() + 400;
            setExpanded(!el.classList.contains('is-expanded'));
        };

        const onKeydown = (event) => {
            if (!el.classList.contains('is-truncated')) return;
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            ignoreOutsideUntil = Date.now() + 400;
            setExpanded(!el.classList.contains('is-expanded'));
        };

        const onPointerDown = (event) => {
            if (!el.classList.contains('is-expanded')) return;
            if (Date.now() < ignoreOutsideUntil) return;
            if (el.contains(event.target)) return;
            setExpanded(false);
        };

        const onResize = () => {
            if (el.classList.contains('is-expanded')) return;
            syncTruncation();
        };

        syncTruncation();
        if (typeof ResizeObserver === 'function') {
            ro = new ResizeObserver(() => {
                if (el.classList.contains('is-expanded')) return;
                syncTruncation();
            });
            ro.observe(el);
            if (el.parentElement) ro.observe(el.parentElement);
        } else {
            window.addEventListener('resize', onResize, { passive: true });
        }

        el.addEventListener('click', onClick);
        el.addEventListener('keydown', onKeydown);
        document.addEventListener('pointerdown', onPointerDown, true);

        authorDatetimeCleanup = () => {
            el.removeEventListener('click', onClick);
            el.removeEventListener('keydown', onKeydown);
            document.removeEventListener('pointerdown', onPointerDown, true);
            if (ro) {
                try { ro.disconnect(); } catch (_) { /* ignore */ }
                ro = null;
            } else {
                window.removeEventListener('resize', onResize);
            }
        };
    }

    function initArticleMetaActions(article) {
        const listenBtn = document.getElementById('articleListenBtn');
        if (listenBtn && window.ArticleListen && typeof window.ArticleListen.bind === 'function') {
            const resolveAudio = (u) => {
                const raw = String(u || '').trim();
                if (!raw) return '';
                return window.MockData && typeof window.MockData.assetPath === 'function'
                    ? window.MockData.assetPath(raw)
                    : raw;
            };
            window.ArticleListen.bind(listenBtn, {
                ...article,
                audio_full_url: resolveAudio(article.audio_full_url),
                audio_summary_url: resolveAudio(article.audio_summary_url)
            });
        } else if (listenBtn) {
            listenBtn.hidden = true;
        }

        const shareBtn = document.getElementById('articleShareBtn');
        if (!shareBtn) return;

        shareBtn.addEventListener('click', async () => {
            const shareData = {
                title: article.title || 'Qualquer Tecla',
                text: article.excerpt || article.subtitle || '',
                url: window.location.href
            };
            try {
                if (navigator.share) {
                    await navigator.share(shareData);
                    shareBtn.blur();
                    return;
                }
            } catch (_) {
                /* usuário cancelou ou indisponível */
            }

            try {
                await navigator.clipboard.writeText(window.location.href);
                shareBtn.classList.add('is-copied');
                const label = shareBtn.querySelector('span');
                const prev = label ? label.textContent : '';
                if (label) label.textContent = 'Link copiado';
                setTimeout(() => {
                    shareBtn.classList.remove('is-copied');
                    if (label) label.textContent = prev || 'Enviar';
                    shareBtn.blur();
                }, 1800);
            } catch (_) {
                shareBtn.blur();
            }
        });
    }


    let readingProgressBound = false;

    function initReadingProgress() {
        const bar = document.getElementById('myBar');
        if (!bar) return;

        const readScrollMetrics = () => {
            const api = window.SiteScrollbar;
            if (api && typeof api.getScrollTop === 'function') {
                const winScroll = api.getScrollTop();
                const height = Math.max(0, api.getScrollHeight() - api.getClientHeight());
                return { winScroll, height };
            }
            const winScroll = document.documentElement.scrollTop || document.body.scrollTop;
            const height =
                document.documentElement.scrollHeight - document.documentElement.clientHeight;
            return { winScroll, height };
        };

        const update = () => {
            const { winScroll, height } = readScrollMetrics();
            const progress = height > 0 ? Math.min(1, Math.max(0, winScroll / height)) : 0;
            bar.style.transform = `scaleX(${progress})`;
        };

        if (!readingProgressBound) {
            readingProgressBound = true;
            let ticking = false;
            window.addEventListener(
                'scroll',
                () => {
                    if (ticking) return;
                    ticking = true;
                    requestAnimationFrame(() => {
                        ticking = false;
                        const currentBar = document.getElementById('myBar');
                        if (!currentBar) return;
                        const { winScroll, height } = readScrollMetrics();
                        const progress = height > 0 ? Math.min(1, Math.max(0, winScroll / height)) : 0;
                        currentBar.style.transform = `scaleX(${progress})`;
                    });
                },
                { passive: true }
            );
        }
        update();
    }

document.addEventListener('DOMContentLoaded', async () => {
    window.SiteState = window.SiteState || {};
    try {
        if (window.API && typeof window.API.getAllCategories === 'function') {
            window.SiteState.categories = await window.API.getAllCategories();
        } else {
            window.SiteState.categories = [];
        }
    } catch (e) {
        console.error('Failed to load categories', e);
        window.SiteState.categories = [];
    }

    if (window.SiteLayout) window.SiteLayout.mount();
    initHeaderScroll();
    initActiveSubnavLink();
    initLiquidLazy();
    hydrateNewsletter();
    
    if (document.getElementById('hero-section')) {
        renderHero()
            .then(() => renderLatestNews(false))
            .catch(() => renderLatestNews(false));
        renderMostRead();
        const loadMore = document.getElementById('load-more-news');
        if (loadMore) {
            loadMore.addEventListener('click', () => {
                renderLatestNews(true);
            });
        }
    }

    if (document.getElementById('category-feed')) initCategoryPage();
    if (document.getElementById('search-results')) initSearchPage();
    if (document.getElementById('article-container')) initArticlePage();
    window.updateArticleContent = initArticlePage;
});
})();

window.addEventListener('popstate', () => {
    if (document.getElementById('article-container') && typeof window.updateArticleContent === 'function') {
        window.updateArticleContent();
    } else {
        window.location.reload();
    }
});
