/**
 * Sidebar e chrome compartilhados do admin.
 */
(function (global) {
    const STORAGE_KEY = 'qualquer-tecla-admin-sidebar';
    const MOBILE_MQ = '(max-width: 991.98px)';
    const LINKS = [
        { href: 'dashboard.html', icon: 'ph-squares-four', label: 'Dashboard' },
        { href: 'noticias.html', icon: 'ph-article', label: 'Notícias' },
        { href: 'nova-noticia.html', icon: 'ph-pencil-simple-line', label: 'Nova Notícia' },
        { href: 'reacoes.html', icon: 'ph-smiley', label: 'Reações' },
        { href: 'categorias.html', icon: 'ph-folders', label: 'Categorias' },
        { href: 'autores.html', icon: 'ph-users', label: 'Autores' },
        { href: 'configuracoes.html', icon: 'ph-gear', label: 'Configurações', bottom: true }
    ];

    function currentFile() {
        const parts = window.location.pathname.split('/');
        return parts[parts.length - 1] || 'dashboard.html';
    }

    function isMobileViewport() {
        return window.matchMedia(MOBILE_MQ).matches;
    }

    function readCompactPreference() {
        try {
            return localStorage.getItem(STORAGE_KEY) === 'compact';
        } catch (e) {
            return false;
        }
    }

    function writeCompactPreference(compact) {
        try {
            localStorage.setItem(STORAGE_KEY, compact ? 'compact' : 'expanded');
        } catch (e) {
            /* ignore */
        }
    }

    function syncToggleButton(root, { open, compactMode }) {
        const toggle = root.querySelector('[data-sidebar-toggle]');
        if (!toggle) return;

        toggle.classList.toggle('is-open', open);
        toggle.setAttribute('aria-pressed', compactMode ? String(!open) : String(open));
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');

        if (compactMode) {
            toggle.setAttribute('aria-label', open ? 'Recolher menu' : 'Expandir menu');
            toggle.title = open ? 'Recolher menu' : 'Expandir menu';
        } else {
            toggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
            toggle.title = open ? 'Fechar menu' : 'Abrir menu';
        }
    }

    function applyCompactState(root, compact) {
        root.classList.toggle('admin-sidebar-compact', compact);
        root.setAttribute('data-compact', compact ? 'true' : 'false');
        syncToggleButton(root, { open: !compact, compactMode: true });
    }

    function applyMobileOpen(root, open) {
        if (open) syncMobileBarHeight(root);
        root.classList.toggle('admin-sidebar-mobile-open', open);
        root.setAttribute('data-mobile-open', open ? 'true' : 'false');
        document.documentElement.classList.toggle('admin-mobile-nav-open', open);
        syncToggleButton(root, { open, compactMode: false });
    }

    /** Alinha o painel fixed à altura real da barra (safe-area / tipografia). */
    function syncMobileBarHeight(root) {
        if (!root || !isMobileViewport()) return;
        const brand = root.querySelector('.admin-sidebar-brand');
        if (!brand) return;
        const h = Math.ceil(brand.getBoundingClientRect().height);
        if (h > 0) {
            root.style.setProperty('--admin-mobile-bar-height', h + 'px');
        }
    }

    function setCompact(root, compact) {
        writeCompactPreference(compact);
        applyCompactState(root, compact);
    }

    function isInteractiveTarget(target) {
        return Boolean(target.closest('a, button, input, select, textarea, label'));
    }

    function bindSidebarToggle(root) {
        const toggle = root.querySelector('[data-sidebar-toggle]');
        if (toggle) {
            toggle.addEventListener('click', (e) => {
                e.stopPropagation();
                if (isMobileViewport()) {
                    applyMobileOpen(root, !root.classList.contains('admin-sidebar-mobile-open'));
                    return;
                }
                setCompact(root, !root.classList.contains('admin-sidebar-compact'));
            });
        }

        root.addEventListener('click', (e) => {
            if (isMobileViewport()) return;
            if (!root.classList.contains('admin-sidebar-compact')) return;
            if (isInteractiveTarget(e.target)) return;
            setCompact(root, false);
        });

        root.addEventListener('keydown', (e) => {
            if (isMobileViewport()) return;
            if (!root.classList.contains('admin-sidebar-compact')) return;
            if (e.key !== 'Enter' && e.key !== ' ') return;
            if (isInteractiveTarget(e.target)) return;
            e.preventDefault();
            setCompact(root, false);
        });

        const shell = root.closest('.admin-shell');
        if (shell) {
            shell.addEventListener('click', (e) => {
                if (!isMobileViewport()) return;
                if (!root.classList.contains('admin-sidebar-mobile-open')) return;
                if (e.target !== shell) return;
                applyMobileOpen(root, false);
            });
        }

        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            if (!isMobileViewport()) return;
            if (!root.classList.contains('admin-sidebar-mobile-open')) return;
            applyMobileOpen(root, false);
        });

        const mq = window.matchMedia(MOBILE_MQ);
        const onViewportChange = () => {
            if (mq.matches) {
                root.classList.remove('admin-sidebar-compact');
                syncMobileBarHeight(root);
                applyMobileOpen(root, false);
            } else {
                root.classList.remove('admin-sidebar-mobile-open');
                document.documentElement.classList.remove('admin-mobile-nav-open');
                root.style.removeProperty('--admin-mobile-bar-height');
                applyCompactState(root, readCompactPreference());
            }
        };
        if (typeof mq.addEventListener === 'function') {
            mq.addEventListener('change', onViewportChange);
        }

        const onResize = () => {
            if (!isMobileViewport()) return;
            syncMobileBarHeight(root);
        };
        window.addEventListener('resize', onResize);
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', onResize);
        }
        syncMobileBarHeight(root);
    }

    function bindLogout() {
        const logout = document.getElementById('logoutBtn');
        if (!logout) return;
        logout.addEventListener('click', async (e) => {
            e.preventDefault();
            try {
                if (window.AdminAuth) await window.AdminAuth.logout();
            } catch (_) {
                /* segue para a tela de login mesmo se o signOut remoto falhar */
            }
            window.location.href =
                window.AdminAuth && window.AdminAuth.adminLoginUrl
                    ? window.AdminAuth.adminLoginUrl()
                    : 'index.html';
        });
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function toBrandTitleCase(name) {
        const raw = String(name || '').trim();
        if (!raw) return '';
        return raw
            .toLocaleLowerCase('pt-BR')
            .split(/\s+/)
            .filter(Boolean)
            .map((word) => word.charAt(0).toLocaleUpperCase('pt-BR') + word.slice(1))
            .join(' ');
    }

    function readSiteName() {
        if (global.MockData && typeof global.MockData.getSiteSettings === 'function') {
            const name = String(global.MockData.getSiteSettings().siteName || '').trim();
            if (name) return toBrandTitleCase(name);
        }
        try {
            const raw =
                localStorage.getItem('qualquer-tecla_site_settings') ||
                sessionStorage.getItem('qualquer-tecla_site_settings');
            if (raw) {
                const parsed = JSON.parse(raw);
                const name = String((parsed && parsed.siteName) || '').trim();
                if (name) return toBrandTitleCase(name);
            }
        } catch (_) {
            /* ignore */
        }
        return 'Qualquer Tecla';
    }

    function brandLockupParts(name) {
        const words = toBrandTitleCase(name || 'Qualquer Tecla')
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

    /** Wordmark Genos (QUALQUER + TECLA), alinhado ao footer / login. */
    function brandWordmarkInnerHtml(name) {
        const { lead, mark } = brandLockupParts(name);
        const leadUp = lead ? lead.toLocaleUpperCase('pt-BR') : '';
        const markUp = String(mark || 'TECLA').toLocaleUpperCase('pt-BR');
        const leadHtml = leadUp
            ? `<span class="brand-word brand-word--lead">${escapeHtml(leadUp)}</span>`
            : '';
        return (
            leadHtml +
            `<span class="brand-word brand-word--mark">${escapeHtml(markUp)}</span>`
        );
    }

    function brandWordmarkHtml(name) {
        return (
            `<span class="qt-footer-wordmark admin-sidebar-logo-full" data-sidebar-label aria-hidden="true">` +
            brandWordmarkInnerHtml(name) +
            `</span>`
        );
    }

    /** Lockup atual: keycap estática + wordmark Genos. */
    function sidebarBrandLogoHtml(name) {
        const base = siteBase();
        const v = '20260920canonical';
        const tex = `${base}assets/img/brand/qt-keycap-top.png?v=${v}`;
        const fallback = `${base}assets/img/brand/qt-keycap-fallback.png?v=${v}`;
        return (
            `<span class="main-header-logo-keycap qt-keycap-static" aria-hidden="true" ` +
            `data-keycap-texture="${escapeHtml(tex)}">` +
            `<img class="qt-keycap-fallback" src="${escapeHtml(fallback)}" alt="" width="64" height="64" decoding="async">` +
            `<canvas class="qt-keycap-canvas" aria-hidden="true"></canvas>` +
            `</span>` +
            brandWordmarkHtml(name)
        );
    }

    function applySiteBrand(root) {
        const name = readSiteName();
        const scope = root || document;
        const lockupHtml = brandWordmarkInnerHtml(name);

        scope.querySelectorAll('.admin-sidebar-logo-full').forEach((el) => {
            el.innerHTML = lockupHtml;
        });

        document.querySelectorAll('[data-site-brand-name]').forEach((el) => {
            el.textContent = name;
        });

        const title = document.title || '';
        if (/\|\s*.+\s*Admin\s*$/i.test(title)) {
            document.title = title.replace(/\|\s*.+\s*Admin\s*$/i, `| ${name} Admin`);
        } else if (/QUALQUER TECLA Admin/i.test(title)) {
            document.title = title.replace(/QUALQUER TECLA Admin/gi, `${name} Admin`);
        }
    }

    function siteBase() {
        return typeof window.SITE_BASE === 'string' ? window.SITE_BASE : '../';
    }

    function resolveAvatar(path) {
        if (window.MockData && typeof window.MockData.assetPath === 'function') {
            return window.MockData.assetPath(path || window.MockData.DEFAULT_AVATAR);
        }
        const fallback = 'assets/img/authors/avatar-default.svg';
        const raw = path || fallback;
        if (/^(https?:|data:|\/)/i.test(raw)) return raw;
        return siteBase() + String(raw).replace(/^\.\.\//, '');
    }

    function nameFromEmail(email) {
        const local = String(email || '').split('@')[0] || '';
        if (!local) return 'Editor';
        return local
            .replace(/[._-]+/g, ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase())
            .trim();
    }

    function resolveSidebarUser(session) {
        const email = (session && session.email) || '';
        const authors = (window.MockData && window.MockData.authors) || [];
        let author = null;

        if (email && authors.length) {
            const local = email
                .split('@')[0]
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-');
            author = authors.find(
                (a) =>
                    a.slug === local ||
                    local === a.slug ||
                    local.startsWith(String(a.slug || '').split('-')[0])
            );
        }
        if (!author && authors[0]) author = authors[0];

        return {
            id: author && author.id ? String(author.id) : '',
            name: (author && author.name) || nameFromEmail(email) || 'Editor',
            email,
            avatar: resolveAvatar(author && author.avatar),
            role: 'Autor'
        };
    }

    function renderLink(link, file) {
        const active = file === link.href ? ' active' : '';
        return `<a href="${link.href}" class="sidebar-link${active}" title="${link.label}">
  <i class="ph ${link.icon}" aria-hidden="true"></i>
  <span data-sidebar-label>${link.label}</span>
</a>`;
    }

    function renderUserFooter(user) {
        const name = escapeHtml(user.name);
        const email = escapeHtml(user.email || '');
        const avatar = escapeHtml(user.avatar);
        const role = escapeHtml(user.role || 'Autor');
        const editHref = user.id
            ? `autores.html?edit=${encodeURIComponent(user.id)}`
            : 'autores.html';
        return `
<div class="admin-sidebar-user">
  <a href="${editHref}" class="admin-sidebar-user-profile" title="Editar autor" aria-label="Editar perfil de ${name}">
    <img class="admin-sidebar-user-avatar" src="${avatar}" alt="" width="36" height="36" decoding="async">
    <div class="admin-sidebar-user-meta" data-sidebar-label>
      <span class="admin-sidebar-user-name">${name}</span>
      <span class="admin-sidebar-user-role">${email || role}</span>
    </div>
  </a>
  <button type="button" class="admin-sidebar-logout" id="logoutBtn" title="Sair" aria-label="Sair">
    <i class="ph ph-sign-out" aria-hidden="true"></i>
  </button>
</div>`;
    }

    function mountSidebar() {
        const root = document.getElementById('admin-sidebar');
        if (!root) return;

        const file = currentFile();
        const session = window.AdminAuth && window.AdminAuth.getSession();
        const compact = readCompactPreference();
        const mainLinks = LINKS.filter((l) => !l.bottom);
        const bottomLinks = LINKS.filter((l) => l.bottom);
        const user = resolveSidebarUser(session);

        root.className = 'admin-sidebar';
        const siteName = readSiteName();
        const logoHtml = sidebarBrandLogoHtml(siteName);

        root.innerHTML = `
<span class="admin-sidebar-mark" aria-hidden="true">Dashboard</span>
<div class="admin-sidebar-brand">
  <div class="admin-sidebar-logo" role="img" aria-label="${escapeHtml(siteName)}">
    ${logoHtml}
  </div>
  <button type="button" class="admin-sidebar-toggle" data-sidebar-toggle aria-pressed="false" aria-expanded="false" aria-controls="admin-sidebar-panel" aria-label="Abrir menu" title="Abrir menu">
    <i class="ph ph-list admin-sidebar-toggle-icon admin-sidebar-toggle-icon--menu" aria-hidden="true"></i>
    <i class="ph ph-x admin-sidebar-toggle-icon admin-sidebar-toggle-icon--close" aria-hidden="true"></i>
  </button>
</div>
<div class="admin-sidebar-panel" id="admin-sidebar-panel">
  <span class="admin-sidebar-mark admin-sidebar-mark--panel" aria-hidden="true">Dashboard</span>
  <nav class="admin-sidebar-nav" aria-label="Navegação do painel">
    ${mainLinks.map((l) => renderLink(l, file)).join('')}
  </nav>
  <div class="admin-sidebar-footer">
    ${bottomLinks.map((l) => renderLink(l, file)).join('')}
    ${renderUserFooter(user)}
  </div>
</div>`;

        const avatarImg = root.querySelector('.admin-sidebar-user-avatar');
        if (avatarImg) {
            avatarImg.addEventListener('error', () => {
                avatarImg.onerror = null;
                avatarImg.src = resolveAvatar(null);
            });
        }

        if (isMobileViewport()) {
            applyMobileOpen(root, false);
            syncMobileBarHeight(root);
        } else {
            applyCompactState(root, compact);
        }

        bindSidebarToggle(root);
        bindLogout();
        applySiteBrand(root);
        mountPrototypeBanner(session);
    }

    /** Aviso visível enquanto o auth for stub (sessionStorage / mock). */
    function mountPrototypeBanner(session) {
        const mode = session && session.mode;
        if (mode === 'supabase') return;
        if (document.getElementById('admin-prototype-banner')) return;
        const main = document.querySelector('.admin-content');
        if (!main) return;
        const banner = document.createElement('div');
        banner.id = 'admin-prototype-banner';
        banner.className = 'admin-prototype-banner';
        banner.setAttribute('role', 'status');
        banner.textContent =
            'Protótipo local apenas. Em produção (Netlify) /admin retorna 404 e a API exige auth server-side. Não trate este login como segurança.';
        main.insertBefore(banner, main.firstChild);
    }

    

    global.AdminLayout = { mountSidebar, applySiteBrand, readSiteName };
})(window);
