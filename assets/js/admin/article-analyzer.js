/**
 * Análise editorial automática — extrai metadados de Markdown + front matter.
 */
(function (global) {
    const STOP_WORDS = new Set([
        'o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas', 'de', 'da', 'do', 'das', 'dos',
        'e', 'em', 'no', 'na', 'nos', 'nas', 'que', 'com', 'por', 'para', 'como', 'ao',
        'à', 'aos', 'às', 'se', 'ou', 'mais', 'menos', 'sobre', 'apos', 'após', 'entre',
        'ser', 'são', 'sao', 'foi', 'era', 'tem', 'ter', 'seu', 'sua', 'seus', 'suas',
        'ele', 'ela', 'eles', 'elas', 'isso', 'este', 'esta', 'estes', 'estas', 'muito',
        'mais', 'menos', 'bem', 'ainda', 'ja', 'já', 'tambem', 'também', 'quando', 'onde',
        'the', 'and', 'for', 'with', 'from', 'this', 'that', 'are', 'was', 'were', 'has',
        'have', 'had', 'not', 'but', 'you', 'your', 'their', 'they', 'them', 'into', 'over'
    ]);

    const CATEGORY_ALIASES = {
        tech: 'tech',
        tecnologia: 'tech',
        ia: 'ia',
        ai: 'ia',
        'inteligencia artificial': 'ia',
        games: 'games',
        jogos: 'games',
        playstation: 'playstation',
        ps5: 'playstation',
        ps4: 'playstation',
        xbox: 'xbox',
        nintendo: 'nintendo',
        switch: 'nintendo',
        pc: 'pc',
        steam: 'pc',
        esports: 'esports',
        'e-sports': 'esports',
        'e sports': 'esports',
        lancamentos: 'lancamentos',
        'industria dos games': 'industria-games',
        'indústria dos games': 'industria-games',
        geek: 'geek',
        'cultura pop': 'geek',
        pop: 'geek',
        filmes: 'filmes-series',
        cinema: 'filmes-series',
        series: 'filmes-series',
        'filmes e series': 'filmes-series',
        'filmes & series': 'filmes-series',
        anime: 'anime-manga',
        manga: 'anime-manga',
        marvel: 'marvel-dc',
        dc: 'marvel-dc',
        cosplay: 'cosplay-eventos',
        eventos: 'cosplay-eventos',
        ciencia: 'ciencia',
        'cultura digital': 'cultura-digital',
        redes: 'cultura-digital',
        'redes sociais': 'cultura-digital',
        'plataforma digital': 'cultura-digital',
        musica: 'musica',
        music: 'musica',
        album: 'musica',
        álbum: 'musica',
        'show musical': 'musica',
        'festival de musica': 'musica',
        'festival de música': 'musica',
        videoclipe: 'musica',
        /* Front matter legado (Taxonomia v1) → destinos v2 explícitos */
        negocios: 'tech',
        negocio: 'tech',
        politica: 'cultura-digital'
        /* "mundo" propositalmente sem alias: não é editoria válida nem fallback silencioso */
    };

    const SHORT_SIGNALS = new Set(['ia', 'ai', 'dc', 'hq', 'app', 'dev', 'rpg', 'lol']);

    const CATEGORY_SIGNALS = {
        ia: [
            'inteligencia artificial', 'inteligência artificial', 'machine learning',
            'agentes de ia', 'agente de ia', 'modelo de linguagem', 'deep learning',
            'gpt', 'llm', 'chatgpt', 'openai', 'agente', 'agentes', 'neural',
            'prompt', 'warp', 'copilot', 'gemini', 'claude', ' ia ', ' de ia',
            'regulacao de ia', 'regulamentacao de ia', 'investimento em ia'
        ],
        games: [
            'game', 'games', 'jogo', 'jogos', 'gamer', 'console', 'gameplay',
            'videogame', 'videogames', 'trilha do jogo'
        ],
        playstation: [
            'playstation', 'ps5', 'ps4', 'ps plus', 'dualsense', 'sony interactive',
            'exclusivo playstation', 'exclusivo da sony'
        ],
        xbox: [
            'xbox', 'xbox series', 'game pass', 'xbox game pass', 'microsoft gaming',
            'exclusivo xbox'
        ],
        nintendo: [
            'nintendo', 'nintendo switch', 'switch 2', 'zelda', 'mario', 'pokemon',
            'exclusivo nintendo'
        ],
        pc: [
            'steam', 'epic games store', 'pc gamer', 'jogo de pc', 'games para pc',
            'hardware gamer', 'placa de video', 'placa de vídeo'
        ],
        esports: [
            'esports', 'e-sports', 'e sports', 'campeonato', 'torneio', 'torneios',
            'equipe competitiva', 'time competitivo', 'jogador profissional',
            'transferencia', 'transferência', 'cenario competitivo', 'cenário competitivo',
            'league of legends', 'valorant', 'counter-strike', 'counter strike', 'cs2',
            'free fire', 'ea sports fc', 'fifa esports', 'riot', 'blast', 'major'
        ],
        lancamentos: [
            'lancamento', 'lançamento', 'lancamentos', 'lançamentos', 'data de lancamento',
            'data de lançamento', 'trailer de jogo', 'gameplay trailer', 'previa', 'prévia',
            'release date'
        ],
        'industria-games': [
            'publisher', 'estudio de games', 'estúdio de games', 'industria dos games',
            'indústria dos games', 'mercado de games', 'rockstar', 'ubisoft', 'ea games',
            'activision', 'take-two', 'vendas de jogos', 'bilheteria de games'
        ],
        tech: [
            'apple', 'google', 'microsoft', 'smartphone', 'iphone', 'android', 'software',
            'hardware', 'startup', 'tecnologia', 'gadget', 'chip', 'processador',
            'windows', 'linux', 'macos', 'desenvolvedor', 'codigo', 'código', 'terminal',
            'aplicativo', 'app store', 'internet'
        ],
        'filmes-series': [
            'filme', 'filmes', 'cinema', 'serie', 'série', 'series', 'séries',
            'streaming de series', 'streaming de filmes', 'netflix', 'disney', 'bilheteria',
            'hollywood', 'longa', 'trailer', 'episodio', 'episódio', 'temporada'
        ],
        'anime-manga': ['anime', 'mangá', 'manga', 'crunchyroll', 'shonen', 'otaku', 'japon'],
        'marvel-dc': [
            'marvel', 'dc comics', 'homem-aranha', 'homem aranha', 'spider-man', 'batman',
            'superman', 'vingadores', 'avengers', 'universo cinematografico'
        ],
        quadrinhos: ['quadrinho', 'quadrinhos', 'hq', 'hqs', 'graphic novel', 'comics'],
        'star-wars': ['star wars', 'jedi', 'sith', 'darth vader', 'mandalorian'],
        'ficcao-cientifica': ['ficcao cientifica', 'ficção científica', 'sci-fi', 'scifi', 'distopia'],
        geek: ['geek', 'nerd', 'cultura pop', 'cultura nerd', 'fandom', 'franquia'],
        'cosplay-eventos': [
            'cosplay', 'cosplayer', 'cosplayers', 'ccxp', 'convenção', 'convencao',
            'convenções', 'convencoes', 'evento geek', 'comic con'
        ],
        ciencia: [
            'ciencia', 'ciência', 'nasa', 'espaco', 'espaço', 'exoplaneta', 'nature', 'pesquisa',
            'astronomia', 'fisica', 'física', 'biologia', 'laboratorio', 'laboratório'
        ],
        'cultura-digital': [
            'rede social', 'redes sociais', 'criador de conteudo', 'criadores de conteudo',
            'influencer', 'influenciador', 'tiktok', 'instagram', 'youtube', 'twitch',
            'plataforma digital', 'plataformas digitais', 'comportamento online',
            'cultura digital', 'algoritmo social', 'viral', 'conteudo digital',
            'regulacao de redes', 'legislacao sobre redes', 'moderacao de conteudo',
            'streaming ao vivo', 'creator economy'
        ],
        musica: [
            'musica', 'música', 'album', 'álbum', 'single', 'artista', 'banda',
            'show musical', 'turne', 'turnê', 'festival de musica', 'festival de música',
            'videoclipe', 'clipe', 'spotify', 'apple music', 'lancamento musical',
            'trilha sonora', 'soundtrack', 'cantor', 'cantora', 'gravadora', 'billboard', 'hit'
        ]
    };

    function normalize(text) {
        return String(text || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();
    }

    function stripMarkdown(md) {
        return String(md || '')
            .replace(/^---[\s\S]*?---\s*/m, '')
            .replace(/```[\s\S]*?```/g, ' ')
            .replace(/`[^`]+`/g, ' ')
            .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            .replace(/^#{1,6}\s+/gm, '')
            .replace(/[*_~>#|-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function firstMatch(md, regex) {
        const m = String(md || '').match(regex);
        return m ? m[1].trim() : '';
    }

    function extractTitle(md, meta) {
        const fromMeta = meta.title || meta.titulo || meta.seo_title || meta['seo-title'] || '';
        if (fromMeta) return String(fromMeta).trim();

        const h1 = firstMatch(md, /^#\s+(.+)$/m);
        if (h1) return h1.replace(/\*\*/g, '').trim();

        const lines = String(md || '')
            .replace(/^---[\s\S]*?---\s*/m, '')
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean);

        for (const line of lines) {
            if (/^#/.test(line)) continue;
            if (line.length > 12 && line.length < 140) return line.replace(/\*\*/g, '').trim();
        }
        return '';
    }

    function extractFirstParagraph(md, skipTitle) {
        const body = String(md || '').replace(/^---[\s\S]*?---\s*/m, '');
        const lines = body.split('\n');
        let started = false;
        let para = '';

        for (const raw of lines) {
            const line = raw.trim();
            if (!line) {
                if (started && para.length > 40) break;
                continue;
            }
            if (/^#{1,6}\s/.test(line)) {
                if (skipTitle && !started) continue;
                if (started && para.length > 40) break;
                continue;
            }
            if (/^[-*+]\s/.test(line) || /^\d+\.\s/.test(line)) continue;
            if (/^>\s/.test(line)) continue;
            if (/^!\[/.test(line) || /^<iframe/i.test(line)) continue;

            const clean = line
                .replace(/\*\*/g, '')
                .replace(/\*/g, '')
                .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
            para += (para ? ' ' : '') + clean;
            started = true;
            if (para.length > 280) break;
        }
        return para.trim();
    }

    function truncateAtSentence(text, max) {
        const t = String(text || '').trim();
        if (t.length <= max) return t;
        const slice = t.slice(0, max);
        const last = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('! '), slice.lastIndexOf('? '));
        if (last > max * 0.55) return slice.slice(0, last + 1).trim();
        const lastSpace = slice.lastIndexOf(' ');
        return (lastSpace > 0 ? slice.slice(0, lastSpace) : slice).trim() + '…';
    }

    function extractHeadings(md) {
        const out = [];
        const re = /^#{2,4}\s+(.+)$/gm;
        let m;
        while ((m = re.exec(String(md || '')))) {
            const t = m[1].replace(/\*\*/g, '').trim();
            if (!/^fontes?\s*:?\s*$/i.test(t)) out.push(t);
        }
        return out;
    }

    function extractBoldTerms(md) {
        const terms = [];
        const re = /\*\*([^*]{3,48})\*\*/g;
        let m;
        while ((m = re.exec(String(md || '')))) {
            const t = m[1].trim();
            if (!/^fontes?\s*:?\s*$/i.test(t)) terms.push(t);
        }
        return terms;
    }

    function extractFirstImage(md, meta) {
        const fromMeta = meta.image || meta.featured_image || meta.cover || meta.capa || '';
        if (fromMeta) return String(fromMeta).trim();

        const img = firstMatch(md, /!\[[^\]]*\]\(([^)\s]+)/);
        return img || '';
    }

    function cleanSourceUrl(url) {
        return String(url || '')
            .trim()
            .replace(/[.,;)\]]+$/g, '');
    }

    function metaText(value) {
        if (value == null) return '';
        if (Array.isArray(value)) {
            return value
                .map((v) => String(v == null ? '' : v).trim())
                .filter(Boolean)
                .join(', ');
        }
        return String(value).trim();
    }

    function parseSourceChunk(chunk) {
        const block = String(chunk || '').trim();
        if (!block) return { sourceName: '', sourceUrl: '' };

        const mdLink = block.match(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/i);
        if (mdLink) {
            return {
                sourceName: mdLink[1].trim(),
                sourceUrl: cleanSourceUrl(mdLink[2])
            };
        }

        const htmlLink = block.match(/<a[^>]+href=["'](https?:\/\/[^"']+)["'][^>]*>(.*?)<\/a>/i);
        if (htmlLink) {
            return {
                sourceName: String(htmlLink[2] || '')
                    .replace(/<[^>]+>/g, '')
                    .trim(),
                sourceUrl: cleanSourceUrl(htmlLink[1])
            };
        }

        const nameAndUrl = block.match(
            /^(?:Fontes?\s*[·•\-–—:]\s*)?(.+?)\s*[·•\-–—|]\s*(https?:\/\/\S+)/i
        );
        if (nameAndUrl) {
            return {
                sourceName: nameAndUrl[1].replace(/^Fontes?\s*[·•\-–—:]\s*/i, '').trim(),
                sourceUrl: cleanSourceUrl(nameAndUrl[2])
            };
        }

        const bareUrl = block.match(/(https?:\/\/[^\s<]+)/i);
        const sourceUrl = bareUrl ? cleanSourceUrl(bareUrl[1]) : '';
        let sourceName = block
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            .replace(/<a[^>]*>|<\/a>/gi, '')
            .replace(/https?:\/\/[^\s<]+/gi, '')
            .replace(/^[-–—*•]\s*/, '')
            .replace(/^\*{0,2}\s*Fontes?\s*\*{0,2}\s*[·•\-–—:]\s*/i, '')
            .replace(/\*{1,2}/g, '')
            .replace(/^Fontes?\s*[·•\-–—:]\s*/i, '')
            .trim();

        if (!sourceName && sourceUrl) {
            try {
                sourceName = new URL(sourceUrl).hostname.replace(/^www\./, '');
            } catch (_) {
                sourceName = '';
            }
        }

        return { sourceName, sourceUrl };
    }

    /** Extrai fonte do corpo (seção Fontes / linha final Fonte · …). */
    function extractSourceFromMarkdown(md) {
        const text = String(md || '').replace(/\r\n/g, '\n').trim();
        if (!text) return { sourceName: '', sourceUrl: '' };

        const headingSection = text.match(
            /(?:^|\n)#{1,4}\s*Fontes?\s*:?\s*(?:\n+|:\s*)([\s\S]*)$/i
        );
        if (headingSection && headingSection[1].trim()) {
            return parseSourceChunk(headingSection[1]);
        }

        const plainSection = text.match(
            /(?:^|\n)Fontes?\s*:?\s*\n+([^\n#][\s\S]*)$/i
        );
        if (plainSection && plainSection[1].trim()) {
            return parseSourceChunk(plainSection[1]);
        }

        const hrSection = text.match(/\n---\s*\n+([\s\S]*)$/);
        if (hrSection && /^Fontes?\b/i.test(hrSection[1].trim())) {
            return parseSourceChunk(hrSection[1].replace(/^Fontes?\s*:?\s*/i, ''));
        }

        const boldInline = text.match(
            /(?:^|\n)\*{0,2}Fontes?\*{0,2}\s*[·•\-–—:]\s*([^\n]+)$/i
        );
        if (boldInline) return parseSourceChunk(boldInline[0]);

        const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
        for (let i = lines.length - 1; i >= Math.max(0, lines.length - 8); i--) {
            const line = lines[i];
            if (/^#{1,4}\s*Fontes?\b/i.test(line)) {
                const sameLine = line.replace(/^#{1,4}\s*Fontes?\s*:?\s*/i, '').trim();
                if (sameLine) return parseSourceChunk(sameLine);
                return parseSourceChunk(lines.slice(i + 1).join('\n'));
            }
            if (/^\*{0,2}Fontes?\*{0,2}\s*[·•\-–—:]/i.test(line)) {
                return parseSourceChunk(line.replace(/^\*{1,2}|\*{1,2}$/g, ''));
            }
            if (/^Fontes?\s*$/i.test(line) && lines[i + 1]) {
                return parseSourceChunk(lines.slice(i + 1).join('\n'));
            }
        }

        return { sourceName: '', sourceUrl: '' };
    }

    function stripFontesFromMarkdown(md) {
        return String(md || '')
            .replace(/\r\n/g, '\n')
            .replace(/(?:^|\n)#{1,4}\s*Fontes?\s*:?\s*(?:\n+[\s\S]*)$/i, '')
            .replace(/(?:^|\n)Fontes?\s*:?\s*\n+[^\n#][\s\S]*$/i, '')
            .replace(/\n---\s*\n+Fontes?\b[\s\S]*$/i, '')
            .replace(/\n\*{0,2}Fontes?\*{0,2}\s*[·•\-–—:][^\n]*$/i, '')
            .trimEnd();
    }

    function wordFrequency(text, limit) {
        const words = normalize(text)
            .replace(/[^\w\s-]/g, ' ')
            .split(/\s+/)
            .filter((w) => w.length > 3 && !STOP_WORDS.has(w));

        const freq = {};
        words.forEach((w) => {
            freq[w] = (freq[w] || 0) + 1;
        });

        return Object.entries(freq)
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([w]) => w);
    }

    function escapeRegex(str) {
        return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /** Correspondência de termo com limite de palavra (evita "ia" dentro de "associacao"). */
    function countSignalMatches(hay, signal) {
        const term = normalize(signal).trim();
        if (!term || term.length < 2) return 0;

        const padded = ' ' + hay + ' ';

        if (term.includes(' ') || term.length > 4 || !SHORT_SIGNALS.has(term)) {
            if (padded.includes(' ' + term + ' ') || hay.includes(term)) {
                return term.includes(' ') ? 2 : 1;
            }
            return 0;
        }

        const re = new RegExp('(?:^|\\s)' + escapeRegex(term) + '(?:\\s|$|[.,;:!?])', 'g');
        const matches = hay.match(re);
        return matches ? matches.length : 0;
    }

    function resolveCategoryFromMeta(metaCategory, categories) {
        if (!metaCategory || !categories?.length) return '';

        const raw = String(metaCategory).trim();
        const v = normalize(raw);

        if (CATEGORY_ALIASES[v]) return CATEGORY_ALIASES[v];

        const bySlug = categories.find((c) => c.slug === v || c.slug.replace(/-/g, ' ') === v);
        if (bySlug) return bySlug.slug;

        const byName = categories.find((c) => normalize(c.name) === v);
        if (byName) return byName.slug;

        /* Evita "politica".includes("ia") e outros falsos positivos de substring curta. */
        const byPartial = categories.find((c) => {
            const sn = normalize(c.slug).replace(/-/g, ' ');
            const nm = normalize(c.name);
            const candidates = [sn, nm].filter(Boolean);
            return candidates.some((needle) => {
                if (needle.length <= 2) {
                    return v === needle;
                }
                if (v.length < 3 && needle.length > v.length) {
                    return false;
                }
                return (
                    v === needle ||
                    v.startsWith(needle + ' ') ||
                    v.endsWith(' ' + needle) ||
                    v.includes(' ' + needle + ' ') ||
                    needle.startsWith(v + ' ') ||
                    needle.endsWith(' ' + v) ||
                    needle.includes(' ' + v + ' ')
                );
            });
        });
        if (byPartial) return byPartial.slug;

        for (const [alias, slug] of Object.entries(CATEGORY_ALIASES)) {
            if (alias.length <= 2) {
                if (v === alias) return slug;
                continue;
            }
            /* Só match se o valor contém o alias completo — evita "show" ⊂ "show musical". */
            if (v === alias || v.includes(alias)) return slug;
        }

        return '';
    }

    function scoreCategory(cat, zones) {
        const signals = [
            ...(CATEGORY_SIGNALS[cat.slug] || []),
            cat.slug.replace(/-/g, ' '),
            normalize(cat.name)
        ];

        let score = 0;
        const weights = { title: 6, headings: 3, lead: 2, body: 1 };

        Object.entries(zones).forEach(([zone, text]) => {
            const hay = normalize(text);
            if (!hay) return;

            signals.forEach((sig) => {
                const hits = countSignalMatches(hay, sig);
                if (!hits) return;
                const base = String(sig).includes(' ') ? 4 : 2;
                score += hits * base * (weights[zone] || 1);
            });
        });

        if (cat.parent && score > 0) score *= 1.35;

        return score;
    }

    function detectCategory(zones, categories, metaCategory) {
        const fromMeta = resolveCategoryFromMeta(metaCategory, categories);
        if (fromMeta) return fromMeta;

        if (!categories?.length) return '';

        let bestSlug = '';
        let bestScore = 0;

        categories.forEach((cat) => {
            const score = scoreCategory(cat, zones);
            if (score > bestScore) {
                bestScore = score;
                bestSlug = cat.slug;
            }
        });

        if (bestScore > 0) return bestSlug;

        const titleHay = normalize(zones.title || '');
        if (titleHay.includes('cosplay')) return 'cosplay-eventos';
        if (/\b(ia|ai)\b/.test(titleHay) || titleHay.includes(' inteligencia artificial')) return 'ia';

        /* Sem sinal claro: não inventar editoria (evita fallback silencioso para categories[0]). */
        return categories.find((c) => c.slug === 'geek')?.slug || '';
    }

    function formatCategoryLabel(category, categories) {
        if (!category) return '';
        if (category.parent) {
            const parent = categories.find((c) => c.slug === category.parent);
            if (parent) return parent.name + ' · ' + category.name;
        }
        return category.name;
    }

    function buildTags(md, meta, categoryName, headings, boldTerms, freqWords) {
        const fromMeta = meta.tags || meta.tag || meta.keywords || meta['palavras-chave'] || [];
        const base = Array.isArray(fromMeta)
            ? fromMeta.slice()
            : String(fromMeta || '')
                  .split(',')
                  .map((t) => t.trim())
                  .filter(Boolean);

        const candidates = [
            ...base,
            categoryName,
            ...headings.slice(0, 4),
            ...boldTerms.slice(0, 6),
            ...freqWords.slice(0, 6)
        ];

        const seen = new Set();
        const tags = [];

        candidates.forEach((raw) => {
            let t = String(raw || '')
                .replace(/\*\*/g, '')
                .trim();
            if (t.length < 2 || t.length > 40) return;
            const key = normalize(t);
            if (seen.has(key) || STOP_WORDS.has(key)) return;
            seen.add(key);
            tags.push(t);
        });

        return tags.slice(0, 8);
    }

    function buildKeywords(tags, freqWords, title) {
        const titleWords = normalize(title)
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter((w) => w.length > 3 && !STOP_WORDS.has(w));

        const seen = new Set();
        const out = [];

        [...titleWords, ...freqWords, ...tags.map(normalize)].forEach((w) => {
            const k = normalize(w);
            if (!k || k.length < 3 || seen.has(k)) return;
            seen.add(k);
            out.push(w.length > 3 ? w : k);
        });

        return out.slice(0, 10);
    }

    function slugify(text) {
        return String(text || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '')
            .slice(0, 80);
    }

    function resolveAuthor(meta, authors) {
        const raw = meta.author || meta.autor || '';
        if (!raw || !authors?.length) return authors[0]?.id || '';

        const v = normalize(raw);
        const found = authors.find(
            (a) => a.id === raw || a.slug === v || normalize(a.name) === v || normalize(a.name).includes(v)
        );
        return found ? found.id : authors[0]?.id || '';
    }

    function parseDate(meta) {
        const raw = meta.date || meta.published_at || meta.publicado_em || '';
        if (raw) {
            const d = new Date(raw);
            if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
        }
        return new Date().toISOString().slice(0, 10);
    }

    function readingTimeMinutes(md) {
        const words = stripMarkdown(md).split(/\s+/).filter(Boolean).length;
        return Math.max(1, Math.ceil(words / 200));
    }

    function buildImageSearchQuery(title, subtitle, categoryName, keywords, tags, excerpt) {
        if (global.GoogleImagesSearch && typeof global.GoogleImagesSearch.buildSearchQuery === 'function') {
            return global.GoogleImagesSearch.buildSearchQuery({
                title,
                subtitle,
                categoryName,
                keywords,
                tags,
                excerpt
            });
        }
        return title || categoryName || 'notícia editorial';
    }

    /**
     * @param {object} input
     * @param {string} input.markdown
     * @param {object} [input.meta]
     * @param {Array} [input.categories]
     * @param {Array} [input.authors]
     */
    function analyze(input) {
        const md = String(input?.markdown || '');
        const meta = input?.meta || {};
        const categories = input?.categories || global.MockData?.categories || [];
        const authors = input?.authors || global.MockData?.authors || [];

        const plain = stripMarkdown(md);
        const title = extractTitle(md, meta);
        const firstPara = extractFirstParagraph(md, true);

        const subtitleFromMeta = meta.subtitle || meta.subtitulo || '';
        const subtitle = subtitleFromMeta || truncateAtSentence(firstPara, 160);

        const excerptFromMeta = meta.excerpt || meta.resumo || meta.description || meta.summary || '';
        const seoDescription =
            meta.seo_description ||
            meta['seo-description'] ||
            excerptFromMeta ||
            truncateAtSentence(firstPara || subtitle || plain, 155);

        const seoTitle = meta.seo_title || meta['seo-title'] || title;

        const metaCategory = meta.category || meta.editoria || meta.categoria || '';
        const headings = extractHeadings(md);
        const lead = truncateAtSentence(firstPara, 400);

        const categorySlug = detectCategory(
            {
                title,
                headings: headings.join(' '),
                lead,
                body: plain
            },
            categories,
            metaCategory
        );
        const category = categories.find((c) => c.slug === categorySlug);
        const categoryName = formatCategoryLabel(category, categories);
        const boldTerms = extractBoldTerms(md);
        const freqWords = wordFrequency(title + ' ' + plain, 12);

        const tags = buildTags(md, meta, categoryName, headings, boldTerms, freqWords);
        const keywords = buildKeywords(tags, freqWords, title);

        const slug = meta.slug || slugify(title);
        const authorId = resolveAuthor(meta, authors);
        const date = parseDate(meta);
        const readingTime = meta.reading_time || meta.readingtime || readingTimeMinutes(md);
        const featuredImage = extractFirstImage(md, meta);

        const sourceFromMetaName = metaText(
            meta.source || meta.source_name || meta.fonte || meta['source-name']
        );
        const sourceFromMetaUrl = metaText(
            meta.source_url || meta.link_original || meta['source-url']
        );
        const sourceFromBody = extractSourceFromMarkdown(md);
        const sourceName = sourceFromMetaName || sourceFromBody.sourceName || '';
        const sourceUrl = sourceFromMetaUrl || sourceFromBody.sourceUrl || '';

        return {
            title,
            subtitle,
            excerpt: seoDescription,
            seoTitle,
            seoDescription,
            categorySlug,
            categoryName,
            tags,
            keywords,
            slug,
            authorId,
            date,
            readingTime,
            featuredImage,
            sourceName,
            sourceUrl,
            imageSearchQuery: buildImageSearchQuery(
                title,
                subtitle,
                categoryName,
                keywords,
                tags,
                seoDescription
            ),
            wordCount: plain.split(/\s+/).filter(Boolean).length
        };
    }

    global.ArticleAnalyzer = {
        analyze,
        stripMarkdown,
        slugify,
        readingTimeMinutes,
        resolveCategoryFromMeta,
        formatCategoryLabel,
        extractSourceFromMarkdown,
        stripFontesFromMarkdown
    };
})(window);
