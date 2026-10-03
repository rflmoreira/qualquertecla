/**
 * Parser Markdown → HTML editorial + conversão básica HTML → Markdown.
 * Saída sempre passa por HtmlSafe.sanitizeHtml.
 */
(function (global) {
    const { escapeHtml, sanitizeHtml } = global.HtmlSafe || {
        escapeHtml: (s) => String(s ?? ''),
        sanitizeHtml: (s) => String(s ?? '')
    };

    function escapeMdText(text) {
        return escapeHtml(text);
    }

    function isSafeEmbedUrl(url) {
        if (!url) return false;
        if (global.HtmlSafe && typeof global.HtmlSafe.isSafeEmbedSrc === 'function') {
            return global.HtmlSafe.isSafeEmbedSrc(url);
        }
        if (global.HtmlSafe && typeof global.HtmlSafe.isSafeYoutubeEmbed === 'function') {
            return global.HtmlSafe.isSafeYoutubeEmbed(url);
        }
        return /^https:\/\/(www\.)?youtube(-nocookie)?\.com\/embed\//i.test(url);
    }

    /**
     * Resolve URL pública → iframe seguro de rede/plataforma.
     * Suporta: YouTube, X, Instagram, Facebook, TikTok, Vimeo, Spotify, Reddit.
     */
    function resolveEmbed(rawUrl) {
        if (!rawUrl) return null;
        let u;
        try {
            u = new URL(String(rawUrl).trim());
        } catch (_) {
            return null;
        }
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
        u.protocol = 'https:';
        const host = u.hostname.replace(/^www\./, '').toLowerCase();
        const path = u.pathname || '';

        /* Já é URL de embed permitida */
        if (isSafeEmbedUrl(u.href)) {
            if (host.includes('youtube')) {
                return { provider: 'youtube', src: u.href, className: 'video-embed', title: 'YouTube' };
            }
            if (host === 'platform.twitter.com') {
                return { provider: 'x', src: u.href, className: 'social-embed social-embed--x', title: 'Post do X' };
            }
            if (host === 'instagram.com') {
                return {
                    provider: 'instagram',
                    src: u.href,
                    className: 'social-embed social-embed--instagram',
                    title: 'Instagram'
                };
            }
            if (host === 'facebook.com') {
                return {
                    provider: 'facebook',
                    src: u.href,
                    className: 'social-embed social-embed--facebook',
                    title: 'Facebook'
                };
            }
            if (host === 'tiktok.com') {
                return {
                    provider: 'tiktok',
                    src: u.href,
                    className: 'social-embed social-embed--tiktok',
                    title: 'TikTok'
                };
            }
            if (host === 'player.vimeo.com') {
                return { provider: 'vimeo', src: u.href, className: 'video-embed', title: 'Vimeo' };
            }
            if (host === 'open.spotify.com') {
                return {
                    provider: 'spotify',
                    src: u.href,
                    className: 'social-embed social-embed--spotify',
                    title: 'Spotify'
                };
            }
            if (host === 'embed.reddit.com' || host === 'redditmedia.com') {
                return {
                    provider: 'reddit',
                    src: u.href,
                    className: 'social-embed social-embed--reddit',
                    title: 'Reddit'
                };
            }
        }

        /* YouTube */
        if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'youtu.be' || host === 'm.youtube.com') {
            let id = null;
            if (host === 'youtu.be') {
                id = path.replace(/^\//, '').split('/')[0] || null;
            } else if (path.startsWith('/embed/')) {
                id = path.replace('/embed/', '').split('/')[0] || null;
            } else if (path.startsWith('/shorts/')) {
                id = path.replace('/shorts/', '').split('/')[0] || null;
            } else if (path.startsWith('/live/')) {
                id = path.replace('/live/', '').split('/')[0] || null;
            } else {
                id = u.searchParams.get('v');
            }
            if (!id || !/^[\w-]{6,}$/.test(id)) return null;
            return {
                provider: 'youtube',
                src: `https://www.youtube.com/embed/${id}`,
                className: 'video-embed',
                title: 'YouTube'
            };
        }

        /* X / Twitter */
        if (
            host === 'x.com' ||
            host === 'twitter.com' ||
            host === 'mobile.twitter.com' ||
            host === 'mobile.x.com'
        ) {
            const m = path.match(/\/status(?:es)?\/(\d+)/i);
            if (!m) return null;
            return {
                provider: 'x',
                src: `https://platform.twitter.com/embed/Tweet.html?id=${m[1]}`,
                className: 'social-embed social-embed--x',
                title: 'Post do X'
            };
        }

        /* Instagram */
        if (host === 'instagram.com' || host === 'instagr.am') {
            const m = path.match(/\/(p|reel|tv)\/([A-Za-z0-9_-]+)/i);
            if (!m) return null;
            return {
                provider: 'instagram',
                src: `https://www.instagram.com/${m[1].toLowerCase()}/${m[2]}/embed/`,
                className: 'social-embed social-embed--instagram',
                title: 'Instagram'
            };
        }

        /* Facebook */
        if (
            host === 'facebook.com' ||
            host === 'fb.com' ||
            host === 'fb.watch' ||
            host === 'm.facebook.com'
        ) {
            const clean = u.href.split('#')[0];
            return {
                provider: 'facebook',
                src:
                    'https://www.facebook.com/plugins/post.php?href=' +
                    encodeURIComponent(clean) +
                    '&show_text=true&width=550',
                className: 'social-embed social-embed--facebook',
                title: 'Facebook'
            };
        }

        /* TikTok */
        if (host === 'tiktok.com' || host === 'www.tiktok.com' || host === 'vm.tiktok.com') {
            const m = path.match(/\/video\/(\d+)/i);
            if (!m) return null;
            return {
                provider: 'tiktok',
                src: `https://www.tiktok.com/embed/v2/${m[1]}`,
                className: 'social-embed social-embed--tiktok',
                title: 'TikTok'
            };
        }

        /* Vimeo */
        if (host === 'vimeo.com' || host === 'player.vimeo.com') {
            let id = null;
            if (host === 'player.vimeo.com') {
                id = (path.match(/\/video\/(\d+)/) || [])[1];
            } else {
                id = (path.match(/^\/(\d+)/) || [])[1];
            }
            if (!id) return null;
            return {
                provider: 'vimeo',
                src: `https://player.vimeo.com/video/${id}`,
                className: 'video-embed',
                title: 'Vimeo'
            };
        }

        /* Spotify */
        if (host === 'open.spotify.com') {
            const m = path.match(/^\/(track|album|playlist|episode|show)\/([A-Za-z0-9]+)/i);
            if (!m) return null;
            const kind = m[1].toLowerCase();
            const heightClass =
                kind === 'track' || kind === 'episode'
                    ? 'social-embed social-embed--spotify social-embed--spotify-track'
                    : 'social-embed social-embed--spotify social-embed--spotify-list';
            return {
                provider: 'spotify',
                src: `https://open.spotify.com/embed/${kind}/${m[2]}`,
                className: heightClass,
                title: 'Spotify'
            };
        }

        /* Reddit */
        if (host === 'reddit.com' || host === 'old.reddit.com' || host === 'np.reddit.com') {
            const m = path.match(/^\/r\/[^/]+\/comments\/[^/]+/i);
            if (!m) return null;
            return {
                provider: 'reddit',
                src: `https://embed.reddit.com${m[0]}?embed=true&theme=dark`,
                className: 'social-embed social-embed--reddit',
                title: 'Reddit'
            };
        }

        return null;
    }

    function buildEmbedHtml(resolved) {
        if (!resolved || !resolved.src) return '';
        const safeUrl = escapeHtml(resolved.src);
        const safeTitle = escapeHtml(resolved.title || 'Conteúdo incorporado');
        const cls = escapeHtml(resolved.className || 'social-embed');
        const allow =
            resolved.provider === 'youtube' || resolved.provider === 'vimeo'
                ? 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share'
                : 'clipboard-write; encrypted-media; picture-in-picture; web-share';
        return (
            `<div class="${cls}"><iframe src="${safeUrl}" title="${safeTitle}" ` +
            `allow="${allow}" allowfullscreen></iframe></div>`
        );
    }

    /** Envolve iframes soltos, normaliza embeds conhecidos e sanitiza. */
    function processHtmlBlock(html) {
        const doc = new DOMParser().parseFromString(String(html), 'text/html');
        doc.body.querySelectorAll('iframe').forEach((iframe) => {
            const rawSrc = iframe.getAttribute('src') || '';
            const resolved = resolveEmbed(rawSrc);
            if (resolved) {
                iframe.setAttribute('src', resolved.src);
                const parent = iframe.parentElement;
                if (parent && (parent.classList.contains('video-embed') || parent.classList.contains('social-embed'))) {
                    parent.className = resolved.className;
                } else if (!parent || (!parent.classList.contains('video-embed') && !parent.classList.contains('social-embed'))) {
                    const wrap = doc.createElement('div');
                    wrap.className = resolved.className;
                    iframe.parentNode.insertBefore(wrap, iframe);
                    wrap.appendChild(iframe);
                }
            } else {
                const parent = iframe.parentElement;
                if (parent && (parent.classList.contains('video-embed') || parent.classList.contains('social-embed'))) {
                    /* já envolvido */
                } else {
                    const wrap = doc.createElement('div');
                    wrap.className = 'video-embed';
                    iframe.parentNode.insertBefore(wrap, iframe);
                    wrap.appendChild(iframe);
                }
            }
            iframe.removeAttribute('loading');
            iframe.removeAttribute('referrerpolicy');
        });
        return sanitizeHtml(doc.body.innerHTML);
    }

    function collectHtmlBlock(lines, start) {
        const first = lines[start].trim();
        const tagMatch = first.match(/^<(\w+[\w-]*)/i);
        if (!tagMatch) return null;

        const tag = tagMatch[1].toLowerCase();
        const allowed = new Set(['iframe', 'div', 'figure']);
        if (!allowed.has(tag)) return null;

        let html = '';
        let i = start;
        const closePattern = new RegExp(`</${tag}\\s*>`, 'i');

        while (i < lines.length) {
            html += (i > start ? '\n' : '') + lines[i];
            if (closePattern.test(lines[i])) {
                i++;
                break;
            }
            i++;
            if (i - start > 30) break;
        }

        return { html: html.trim(), nextIndex: i };
    }

    function parseEmbedLine(line) {
        const trimmed = line.trim();
        const embedLink = trimmed.match(/^\[embed\]\(([^)\s]+)\)/i);
        if (embedLink) {
            const resolved = resolveEmbed(embedLink[1]);
            if (resolved) return buildEmbedHtml(resolved);
            if (isSafeEmbedUrl(embedLink[1])) {
                return buildEmbedHtml({
                    provider: 'generic',
                    src: embedLink[1],
                    className: 'social-embed',
                    title: 'Conteúdo incorporado'
                });
            }
            return null;
        }
        const bareUrl = trimmed.match(/^(https?:\/\/[^\s]+)$/);
        if (bareUrl) {
            const resolved = resolveEmbed(bareUrl[1]);
            if (resolved) return buildEmbedHtml(resolved);
        }
        return null;
    }

    function parseInline(text) {
        let out = escapeMdText(text);
        // Imagens ![alt](url)
        out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (_, alt, src, title) => {
            const t = title ? ` title="${escapeHtml(title)}"` : '';
            return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy"${t}>`;
        });
        // Links [text](url)
        out = out.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (_, label, href, title) => {
            const t = title ? ` title="${escapeHtml(title)}"` : '';
            return `<a href="${escapeHtml(href)}" rel="noopener noreferrer"${t}>${escapeHtml(label)}</a>`;
        });
        // Negrito ** ou __
        out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        out = out.replace(/__(.+?)__/g, '<strong>$1</strong>');
        // Itálico * ou _
        out = out.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
        out = out.replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, '<em>$1</em>');
        // Código inline
        out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
        return out;
    }

    function isTableRow(line) {
        return /^\|.+\|$/.test(line.trim());
    }

    function parseTableRow(line) {
        return line
            .trim()
            .replace(/^\|/, '')
            .replace(/\|$/, '')
            .split('|')
            .map((c) => c.trim());
    }

    function parseMarkdown(source) {
        if (!source) return '';
        const lines = String(source).replace(/\r\n/g, '\n').split('\n');
        const blocks = [];
        let i = 0;

        while (i < lines.length) {
            const line = lines[i];
            const trimmed = line.trim();

            if (!trimmed) {
                i++;
                continue;
            }

            // Bloco HTML bruto (iframe, div.video-embed)
            if (/^<(iframe|div|figure)\b/i.test(trimmed)) {
                const collected = collectHtmlBlock(lines, i);
                if (collected && collected.html) {
                    blocks.push(processHtmlBlock(collected.html));
                    i = collected.nextIndex;
                    continue;
                }
            }

            // Embed: [embed](url), ou URL solta de rede suportada
            const embedBlock = parseEmbedLine(trimmed);
            if (embedBlock) {
                blocks.push(embedBlock);
                i++;
                continue;
            }

            // Bloco de código ```
            if (trimmed.startsWith('```')) {
                const lang = trimmed.slice(3).trim();
                i++;
                const codeLines = [];
                while (i < lines.length && !lines[i].trim().startsWith('```')) {
                    codeLines.push(lines[i]);
                    i++;
                }
                i++;
                const cls = lang ? ` class="language-${escapeHtml(lang)}"` : '';
                blocks.push(`<pre><code${cls}>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
                continue;
            }

            // HR
            if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
                blocks.push('<hr>');
                i++;
                continue;
            }

            // Headings
            const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
            if (heading) {
                const level = Math.min(heading[1].length, 4);
                const tag = level === 1 ? 'h2' : level === 2 ? 'h2' : level === 3 ? 'h3' : 'h4';
                blocks.push(`<${tag}>${parseInline(heading[2])}</${tag}>`);
                i++;
                continue;
            }

            // Blockquote
            if (trimmed.startsWith('>')) {
                const quoteLines = [];
                while (i < lines.length && lines[i].trim().startsWith('>')) {
                    quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
                    i++;
                }
                blocks.push(`<blockquote>${parseInline(quoteLines.join(' '))}</blockquote>`);
                continue;
            }

            // Lista não ordenada
            if (/^[-*+]\s+/.test(trimmed)) {
                const items = [];
                while (i < lines.length && /^[-*+]\s+/.test(lines[i].trim())) {
                    items.push(`<li>${parseInline(lines[i].trim().replace(/^[-*+]\s+/, ''))}</li>`);
                    i++;
                }
                blocks.push(`<ul>${items.join('')}</ul>`);
                continue;
            }

            // Lista ordenada
            if (/^\d+\.\s+/.test(trimmed)) {
                const items = [];
                while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
                    items.push(`<li>${parseInline(lines[i].trim().replace(/^\d+\.\s+/, ''))}</li>`);
                    i++;
                }
                blocks.push(`<ol>${items.join('')}</ol>`);
                continue;
            }

            // Tabela (simples)
            if (isTableRow(trimmed) && i + 1 < lines.length && /^[\|\s:-]+$/.test(lines[i + 1].trim())) {
                const header = parseTableRow(trimmed);
                i += 2;
                const rows = [];
                while (i < lines.length && isTableRow(lines[i])) {
                    rows.push(parseTableRow(lines[i]));
                    i++;
                }
                let table = '<table><thead><tr>';
                header.forEach((h) => {
                    table += `<th>${parseInline(h)}</th>`;
                });
                table += '</tr></thead><tbody>';
                rows.forEach((row) => {
                    table += '<tr>';
                    row.forEach((cell) => {
                        table += `<td>${parseInline(cell)}</td>`;
                    });
                    table += '</tr>';
                });
                table += '</tbody></table>';
                blocks.push(table);
                continue;
            }

            // Parágrafo
            const paraLines = [];
            while (
                i < lines.length &&
                lines[i].trim() &&
                !lines[i].trim().startsWith('#') &&
                !lines[i].trim().startsWith('>') &&
                !/^[-*+]\s+/.test(lines[i].trim()) &&
                !/^\d+\.\s+/.test(lines[i].trim()) &&
                !lines[i].trim().startsWith('```') &&
                !/^<(iframe|div|figure)\b/i.test(lines[i].trim()) &&
                !/^\[embed\]\(/i.test(lines[i].trim())
            ) {
                paraLines.push(lines[i].trim());
                i++;
            }
            blocks.push(`<p>${parseInline(paraLines.join(' '))}</p>`);
        }

        return blocks.join('\n');
    }

    function renderMarkdown(source) {
        return sanitizeHtml(parseMarkdown(source));
    }

    /** Conversão básica HTML → Markdown para edição de conteúdo legado. */
    function htmlToMarkdown(html) {
        if (!html) return '';
        const doc = new DOMParser().parseFromString(String(html), 'text/html');
        const walk = (node) => {
            if (node.nodeType === Node.TEXT_NODE) {
                return node.textContent || '';
            }
            if (node.nodeType !== Node.ELEMENT_NODE) return '';
            const tag = node.tagName;
            const inner = Array.from(node.childNodes).map(walk).join('');

            switch (tag) {
                case 'H2': return `\n## ${inner.trim()}\n\n`;
                case 'H3': return `\n### ${inner.trim()}\n\n`;
                case 'H4': return `\n#### ${inner.trim()}\n\n`;
                case 'P': return `${inner.trim()}\n\n`;
                case 'STRONG':
                case 'B': return `**${inner}**`;
                case 'EM':
                case 'I': return `*${inner}*`;
                case 'BLOCKQUOTE': return `> ${inner.trim()}\n\n`;
                case 'UL': {
                    const items = Array.from(node.querySelectorAll(':scope > li'))
                        .map((li) => `- ${walk(li).trim()}`)
                        .join('\n');
                    return `${items}\n\n`;
                }
                case 'OL': {
                    let n = 1;
                    const items = Array.from(node.querySelectorAll(':scope > li'))
                        .map((li) => `${n++}. ${walk(li).trim()}`)
                        .join('\n');
                    return `${items}\n\n`;
                }
                case 'LI': return inner;
                case 'A': {
                    const href = node.getAttribute('href') || '';
                    return `[${inner}](${href})`;
                }
                case 'IMG': {
                    const src = node.getAttribute('src') || '';
                    const alt = node.getAttribute('alt') || '';
                    return `![${alt}](${src})`;
                }
                case 'CODE':
                    if (node.parentElement && node.parentElement.tagName === 'PRE') {
                        return inner;
                    }
                    return `\`${inner}\``;
                case 'PRE': return `\n\`\`\`\n${inner.trim()}\n\`\`\`\n\n`;
                case 'HR': return '\n---\n\n';
                case 'BR': return '\n';
                case 'DIV':
                    if (node.classList.contains('video-embed') || node.classList.contains('social-embed')) {
                        const iframe = node.querySelector('iframe');
                        const src = iframe ? iframe.getAttribute('src') || '' : '';
                        return src ? `\n[embed](${src})\n\n` : '';
                    }
                    return inner;
                case 'IFRAME': {
                    const src = node.getAttribute('src') || '';
                    return src ? `\n[embed](${src})\n\n` : '';
                }
                default: return inner;
            }
        };
        return walk(doc.body).replace(/\n{3,}/g, '\n\n').trim();
    }

    function isLikelyHtml(text) {
        return /^\s*</.test(String(text || ''));
    }

    function toEditorMarkdown(content, contentMarkdown) {
        if (String(contentMarkdown || '').trim()) return contentMarkdown;
        if (isLikelyHtml(content)) return htmlToMarkdown(content);
        return content || '';
    }

    /**
     * Extrai front matter YAML simples (--- ... ---) de um arquivo Markdown.
     * Suporta title, description, author, category, tags, date, image.
     */
    function parseFrontMatter(raw) {
        const text = String(raw || '').replace(/^\uFEFF/, '');
        const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
        if (!match) {
            return { meta: {}, body: text.trim() };
        }

        const meta = {};
        let currentKey = null;
        const lines = match[1].split('\n');

        lines.forEach((line) => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) return;

            const listItem = trimmed.match(/^-\s+(.+)$/);
            if (listItem && currentKey) {
                if (!Array.isArray(meta[currentKey])) {
                    meta[currentKey] = meta[currentKey] ? [meta[currentKey]] : [];
                }
                meta[currentKey].push(unquote(listItem[1]));
                return;
            }

            const kv = trimmed.match(/^([\w-]+)\s*:\s*(.*)$/);
            if (!kv) return;

            currentKey = kv[1].toLowerCase();
            const rawVal = kv[2].trim();

            if (!rawVal) {
                meta[currentKey] = [];
                return;
            }

            if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
                meta[currentKey] = rawVal
                    .slice(1, -1)
                    .split(',')
                    .map((s) => unquote(s.trim()))
                    .filter(Boolean);
            } else {
                meta[currentKey] = unquote(rawVal);
            }
        });

        return { meta, body: match[2].trim() };
    }

    function unquote(value) {
        const v = String(value || '').trim();
        if (
            (v.startsWith('"') && v.endsWith('"')) ||
            (v.startsWith("'") && v.endsWith("'"))
        ) {
            return v.slice(1, -1);
        }
        return v;
    }

    /** Valida se o texto parece Markdown utilizável. */
    function validateMarkdownFile(raw, filename) {
        if (!raw || !String(raw).trim()) {
            return { ok: false, error: 'O arquivo está vazio.' };
        }
        if (filename && !/\.md$/i.test(filename) && !/\.markdown$/i.test(filename)) {
            return { ok: false, error: 'Formato não suportado. Envie um arquivo .md ou .markdown.' };
        }
        const { meta, body } = parseFrontMatter(raw);
        const hasTitle = meta.title || meta.titulo;
        const hasBody = body.length >= 10;
        if (!hasTitle && !hasBody) {
            return {
                ok: false,
                error: 'O arquivo precisa ter conteúdo no corpo ou um campo title no front matter.'
            };
        }
        return { ok: true, meta, body };
    }

    global.MarkdownUtil = {
        parseMarkdown,
        renderMarkdown,
        htmlToMarkdown,
        toEditorMarkdown,
        isLikelyHtml,
        parseFrontMatter,
        validateMarkdownFile,
        resolveEmbed,
        buildEmbedHtml
    };
})(window);
