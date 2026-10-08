/**
 * Dados mock do Qualquer Tecla.
 * Única fonte de conteúdo enquanto o Supabase real não estiver conectado.
 * Troque o provider em api.js — não altere consumidores da API.
 *
 * Campos editoriais por matéria:
 * - source_name / source_url: atribuição da fonte original
 * - featured: legado (o hero da home usa o artigo publicado mais recente)
 */
(function (global) {
    const PLACEHOLDER_IMG = 'assets/img/placeholder-article.svg';
    const DEFAULT_AVATAR = 'assets/img/authors/avatar-default.svg';

    const TAXONOMY_VERSION = 3;
    const TAXONOMY_VERSION_KEY = 'qualquer-tecla_taxonomy_version';
    const REMOVED_CATEGORY_SLUGS = ['negocios', 'politica', 'mundo'];
    const REMOVED_CATEGORY_FALLBACK = 'tech';

    const seedCategories = [
        {
            slug: 'tech',
            name: 'Tech',
            description:
                'Tecnologia, gadgets, smartphones, computadores, internet, aplicativos, serviços e inovação.',
            parent: null
        },
        {
            slug: 'ia',
            name: 'IA',
            description:
                'Inteligência artificial, modelos de IA, ferramentas, automação, ciência de dados e mercado de IA.',
            parent: null
        },
        {
            slug: 'games',
            name: 'Games',
            description:
                'Videogames, consoles, PC, PlayStation, Xbox, Nintendo, eSports, lançamentos e indústria dos games.',
            parent: null
        },
        {
            slug: 'playstation',
            name: 'PlayStation',
            description: 'PlayStation, exclusivos Sony e ecossistema PS.',
            parent: 'games'
        },
        {
            slug: 'xbox',
            name: 'Xbox',
            description: 'Xbox, Game Pass e ecossistema Microsoft gaming.',
            parent: 'games'
        },
        {
            slug: 'nintendo',
            name: 'Nintendo',
            description: 'Nintendo Switch, exclusivos e universo Nintendo.',
            parent: 'games'
        },
        {
            slug: 'pc',
            name: 'PC',
            description: 'Games para PC, Steam, hardware gamer e plataformas digitais.',
            parent: 'games'
        },
        {
            slug: 'esports',
            name: 'eSports',
            description:
                'Campeonatos, torneios, equipes, jogadores, transferências, resultados e cenário competitivo.',
            parent: 'games'
        },
        {
            slug: 'lancamentos',
            name: 'Lançamentos',
            description: 'Lançamentos de jogos, trailers, datas e prévias.',
            parent: 'games'
        },
        {
            slug: 'industria-games',
            name: 'Indústria dos Games',
            description: 'Mercado, publishers, estúdios, negócios e tendências da indústria dos games.',
            parent: 'games'
        },
        {
            slug: 'geek',
            name: 'Geek',
            description: 'Cultura pop, entretenimento e universo nerd.',
            parent: null
        },
        { slug: 'filmes-series', name: 'Filmes & Séries', description: 'Cinema e streaming.', parent: 'geek' },
        {
            slug: 'anime-manga',
            name: 'Anime & Mangá',
            description: 'Anime, mangá e cultura japonesa.',
            parent: 'geek'
        },
        {
            slug: 'quadrinhos',
            name: 'Quadrinhos',
            description: 'HQ nacionais e internacionais.',
            parent: 'geek'
        },
        {
            slug: 'marvel-dc',
            name: 'Marvel & DC',
            description: 'Universos de super-heróis.',
            parent: 'geek'
        },
        {
            slug: 'star-wars',
            name: 'Star Wars',
            description: 'A galáxia muito, muito distante.',
            parent: 'geek'
        },
        {
            slug: 'ficcao-cientifica',
            name: 'Ficção Científica',
            description: 'Sci-fi em todas as mídias.',
            parent: 'geek'
        },
        {
            slug: 'cultura-nerd',
            name: 'Cultura Nerd',
            description: 'Tendências e lifestyle geek.',
            parent: 'geek'
        },
        {
            slug: 'cosplay-eventos',
            name: 'Cosplay & Eventos',
            description: 'Convenções, cosplay e encontros.',
            parent: 'geek'
        },
        {
            slug: 'ciencia',
            name: 'Ciência',
            description:
                'Descobertas científicas, espaço, astronomia, tecnologia aplicada à ciência e divulgação científica.',
            parent: null
        },
        {
            slug: 'cultura-digital',
            name: 'Cultura Digital',
            description:
                'Redes sociais, criadores de conteúdo, streaming, plataformas digitais, tendências e comportamento na internet.',
            parent: null
        },
        {
            slug: 'musica',
            name: 'Música',
            description:
                'Artistas, bandas, álbuns, singles, lançamentos, shows, festivais, videoclipes, indústria musical e tendências.',
            parent: null
        }
    ];
    const categories = seedCategories.map((c) => ({ ...c }));
    const CATEGORIES_STORAGE_KEY = 'qualquer-tecla_mock_categories';
    const SOCIAL_LINKS_STORAGE_KEY = 'qualquer-tecla_social_links';
    const SOCIAL_LINKS_SEED_VERSION_KEY = 'qualquer-tecla_social_links_seed';
    const SOCIAL_LINKS_SEED_VERSION = 'spotify-1';
    const SOCIAL_LINKS_SEED_ADDITIONS = ['spotify'];
    const SITE_SETTINGS_STORAGE_KEY = 'qualquer-tecla_site_settings';

    const DEFAULT_LOGIN_BG_IMAGE_URL =
        'https://images.unsplash.com/photo-1618519764620-7403abdbdfe9?q=80&w=2340&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D';

    const DEFAULT_LOGIN_BACKGROUND = {
        mode: 'imageUrl',
        imageUrl: DEFAULT_LOGIN_BG_IMAGE_URL,
        unsplashCollection: '',
        refresh: 'hourly',
        brightnessDark: 100,
        brightnessLight: 80,
        blur: 0
    };

    const LOGIN_BG_MODES = new Set(['default', 'imageUrl', 'unsplash']);
    const LOGIN_BG_REFRESH = new Set(['hourly', 'daily', 'every_open', 'never']);

    function clampLoginBgNumber(value, fallback, min, max) {
        const n = Number(value);
        if (!Number.isFinite(n)) return fallback;
        return Math.min(max, Math.max(min, Math.round(n)));
    }

    function normalizeLoginBackground(raw) {
        const source = raw && typeof raw === 'object' ? raw : {};
        let mode = LOGIN_BG_MODES.has(String(source.mode || ''))
            ? String(source.mode)
            : DEFAULT_LOGIN_BACKGROUND.mode;
        const refresh = LOGIN_BG_REFRESH.has(String(source.refresh || ''))
            ? String(source.refresh)
            : DEFAULT_LOGIN_BACKGROUND.refresh;
        let imageUrl = String(source.imageUrl || source.image_url || '')
            .trim()
            .slice(0, 2000);
        if (imageUrl && !/^https:\/\//i.test(imageUrl) && !/^http:\/\//i.test(imageUrl)) {
            imageUrl = '';
        }
        if (/^(javascript|data|vbscript):/i.test(imageUrl)) {
            imageUrl = '';
        }
        /* Compat: mode "default" legado → imagem URL padrão do site */
        if (mode === 'default') {
            mode = 'imageUrl';
            if (!imageUrl) imageUrl = DEFAULT_LOGIN_BG_IMAGE_URL;
        }
        return {
            mode,
            imageUrl,
            unsplashCollection: String(
                source.unsplashCollection || source.unsplash_collection || ''
            )
                .trim()
                .replace(/[^\w-]/g, '')
                .slice(0, 32),
            refresh,
            brightnessDark: clampLoginBgNumber(
                source.brightnessDark ?? source.brightness_dark,
                DEFAULT_LOGIN_BACKGROUND.brightnessDark,
                70,
                100
            ),
            brightnessLight: clampLoginBgNumber(
                source.brightnessLight ?? source.brightness_light,
                DEFAULT_LOGIN_BACKGROUND.brightnessLight,
                70,
                100
            ),
            blur: clampLoginBgNumber(
                source.blur,
                DEFAULT_LOGIN_BACKGROUND.blur,
                0,
                16
            )
        };
    }

    const DEFAULT_SITE_SETTINGS = {
        siteName: 'Qualquer Tecla',
        siteDescription: 'Para a próxima novidade, pressione Qualquer Tecla.',
        contactEmail: 'redacao@qualquertecla.com.br',
        supportUrl: 'https://buy.stripe.com/qualquer-tecla',
        supportEnabled: true,
        loginBackground: { ...DEFAULT_LOGIN_BACKGROUND }
    };

    const LEGACY_SITE_NAMES = new Set(['QUALQUER TECLA', 'QUALQUER TECLA']);

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

    function migrateLegacySiteName(name) {
        const value = String(name || '').trim();
        if (!value || LEGACY_SITE_NAMES.has(value.toLocaleUpperCase('pt-BR'))) {
            return DEFAULT_SITE_SETTINGS.siteName;
        }
        return toBrandTitleCase(value) || DEFAULT_SITE_SETTINGS.siteName;
    }

    let siteSettings = { ...DEFAULT_SITE_SETTINGS };

    const SOCIAL_ICON_OPTIONS = [
        { value: 'ph-instagram-logo', label: 'Instagram' },
        { value: 'ph-youtube-logo', label: 'YouTube' },
        { value: 'ph-x-logo', label: 'X' },
        { value: 'ph-facebook-logo', label: 'Facebook' },
        { value: 'ph-twitch-logo', label: 'Twitch' },
        { value: 'ph-tiktok-logo', label: 'TikTok' },
        { value: 'ph-linkedin-logo', label: 'LinkedIn' },
        { value: 'ph-discord-logo', label: 'Discord' },
        { value: 'ph-whatsapp-logo', label: 'WhatsApp' },
        { value: 'ph-telegram-logo', label: 'Telegram' },
        { value: 'ph-spotify-logo', label: 'Spotify' },
        { value: 'ph-github-logo', label: 'GitHub' },
        { value: 'ph-threads-logo', label: 'Threads' },
        { value: 'ph-reddit-logo', label: 'Reddit' },
        { value: 'ph-link', label: 'Link genérico' }
    ];

    const ALLOWED_SOCIAL_ICONS = new Set(SOCIAL_ICON_OPTIONS.map((o) => o.value));

    /** Redes disponíveis no formulário de autor (ordem de exibição). */
    const AUTHOR_SOCIAL_PRESETS = [
        {
            id: 'instagram',
            label: 'Instagram',
            icon: 'ph-instagram-logo',
            placeholder: 'https://instagram.com/…'
        },
        {
            id: 'x',
            label: 'X',
            icon: 'ph-x-logo',
            placeholder: 'https://x.com/…'
        },
        {
            id: 'linkedin',
            label: 'LinkedIn',
            icon: 'ph-linkedin-logo',
            placeholder: 'https://linkedin.com/in/…'
        },
        {
            id: 'youtube',
            label: 'YouTube',
            icon: 'ph-youtube-logo',
            placeholder: 'https://youtube.com/@…'
        },
        {
            id: 'tiktok',
            label: 'TikTok',
            icon: 'ph-tiktok-logo',
            placeholder: 'https://tiktok.com/@…'
        },
        {
            id: 'github',
            label: 'GitHub',
            icon: 'ph-github-logo',
            placeholder: 'https://github.com/…'
        },
        {
            id: 'website',
            label: 'Site / blog',
            icon: 'ph-link',
            placeholder: 'https://…'
        }
    ];

    const AUTHOR_SOCIAL_PRESET_BY_ID = new Map(
        AUTHOR_SOCIAL_PRESETS.map((p) => [p.id, p])
    );

    const seedSocialLinks = [
        {
            id: 'twitch',
            label: 'Twitch',
            url: 'https://www.twitch.tv',
            icon: 'ph-twitch-logo',
            enabled: true
        },
        {
            id: 'youtube',
            label: 'YouTube',
            url: 'https://www.youtube.com',
            icon: 'ph-youtube-logo',
            enabled: true
        },
        {
            id: 'facebook',
            label: 'Facebook',
            url: 'https://www.facebook.com',
            icon: 'ph-facebook-logo',
            enabled: true
        },
        {
            id: 'instagram',
            label: 'Instagram',
            url: 'https://www.instagram.com',
            icon: 'ph-instagram-logo',
            enabled: true
        },
        {
            id: 'x',
            label: 'X',
            url: 'https://x.com',
            icon: 'ph-x-logo',
            enabled: true
        },
        {
            id: 'spotify',
            label: 'Spotify',
            url: 'https://open.spotify.com',
            icon: 'ph-spotify-logo',
            enabled: true
        }
    ];

    let socialLinks = seedSocialLinks.map((s) => ({ ...s }));

    const seedAuthors = [
        {
            id: 'a2',
            name: 'Rafael M.',
            slug: 'rafael-l',
            avatar: 'assets/img/authors/rafael-l-128w.jpg',
            bio: 'Fundador da alt42 e autor e editor do Qualquer Tecla. Escreve sobre tecnologia, inteligência artificial, inovação, software e produtos, com olhar crítico sobre as transformações que redefinem a relação entre tecnologia, sociedade e cotidiano.',
            socialLinks: [
                {
                    id: 'x',
                    label: 'X',
                    icon: 'ph-x-logo',
                    url: 'https://x.com/rafaelldev'
                },
                {
                    id: 'linkedin',
                    label: 'LinkedIn',
                    icon: 'ph-linkedin-logo',
                    url: 'https://www.linkedin.com/in/rafaelldev'
                },
                {
                    id: 'github',
                    label: 'GitHub',
                    icon: 'ph-github-logo',
                    url: 'https://github.com/rafaelldev'
                }
            ]
        },
        {
            id: 'a3',
            name: 'Mariana C.',
            slug: 'mariana-c',
            avatar: 'assets/img/authors/mariana-c.jpg',
            bio: 'Repórter de cultura pop, cinema e entretenimento geek. Acompanha lançamentos, tendências e o universo de franchises com olhar analítico e acessível.',
            socialLinks: [
                {
                    id: 'instagram',
                    label: 'Instagram',
                    icon: 'ph-instagram-logo',
                    url: 'https://www.instagram.com/marianacultura'
                },
                {
                    id: 'x',
                    label: 'X',
                    icon: 'ph-x-logo',
                    url: 'https://x.com/marianacultura'
                },
                {
                    id: 'tiktok',
                    label: 'TikTok',
                    icon: 'ph-tiktok-logo',
                    url: 'https://www.tiktok.com/@marianacultura'
                }
            ]
        }
    ];
    const authors = seedAuthors.map((a) => ({
        ...a,
        socialLinks: Array.isArray(a.socialLinks) ? a.socialLinks.map((s) => ({ ...s })) : []
    }));

    const seedNow = Date.now();
    const daysAgo = (n) => {
        const d = new Date(seedNow);
        d.setDate(d.getDate() - n);
        return d.toISOString();
    };

    const articles = [
        {
            id: '13',
            title: 'Pantheon: a série de ficção científica sobre consciência digital que a Netflix ainda trata como segredo',
            subtitle:
                'Animação adulta baseada em contos de Ken Liu une hard sci-fi, conspiração corporativa e perguntas urgentes sobre IA, humanidade e o que resta de nós na nuvem.',
            excerpt:
                'Com 16 episódios e história completa na Netflix, Pantheon acompanha Maddie Kim e a digitalização de mentes humanas. Premissa, temas e por que a série merece atenção agora.',
            slug: 'pantheon-serie-netflix-consciencia-digital-ia',
            featured_image: 'assets/img/pantheon-serie.jpg',
            image_caption:
                'Arte promocional de Pantheon — Maddie em estética de glitch digital. (Foto: Divulgação / Netflix)',
            published_at: daysAgo(0),
            updated_at: daysAgo(0),
            reading_time: 7,
            category_slug: 'ficcao-cientifica',
            author_id: 'a3',
            featured: true,
            status: 'published',
            ai_summary:
                'Pantheon é uma animação adulta de ficção científica baseada em contos de Ken Liu, com duas temporadas e 16 episódios disponíveis na íntegra na Netflix. A trama acompanha Maddie Kim após mensagens misteriosas sugerirem que o pai, ligado à empresa Logorhythms, pode existir como consciência digital — uma Uploaded Intelligence. A série atravessa temas de IA, transumanismo e humanidade, e permanece pouco comentada apesar do alcance do catálogo.',
            audio_summary_url: 'assets/audio/articles/pantheon-serie-netflix-consciencia-digital-ia/summary.wav',
            audio_full_url: 'assets/audio/articles/pantheon-serie-netflix-consciencia-digital-ia/full.wav',
            audio_summary_hash: '3f61fdc02ee4c68df843d73fe6600ac51de310fc76b2f86c6cd939bf3e48ce3e',
            audio_full_hash: 'b31923a7af9c054db85573371a832018a4cda9f50b48e9404ff734fa83dcb0cc',
            audio_generated_at: '2026-10-08T11:30:35.870Z',
            audio_status: 'ready',
            views: 420,
            tags: [
                'Pantheon',
                'Netflix',
                'ficção científica',
                'inteligência artificial',
                'Ken Liu',
                'animação',
                'streaming'
            ],
            source_name: 'AdoroCinema',
            source_url:
                'https://www.adorocinema.com/noticias/series/noticia-1000219755/',
            sources: [
                {
                    name: 'AdoroCinema',
                    url: 'https://www.adorocinema.com/noticias/series/noticia-1000219755/'
                },
                {
                    name: 'Netflix',
                    url: 'https://www.netflix.com/title/81937398'
                },
                {
                    name: 'YouTube (trailer)',
                    url: 'https://youtu.be/wTgYeETwgKQ'
                }
            ],
            content: [
                '<p>Em um catálogo que lança dezenas de títulos por mês, algumas obras somem sem alarde. <strong>Pantheon</strong> é um desses casos: série animada adulta de ficção científica, com história fechada em <strong>duas temporadas e 16 episódios</strong>, disponível na íntegra na Netflix — e ainda assim pouco presente na conversa pública.</p>',
                '<p>Baseada em contos do escritor <strong>Ken Liu</strong>, a produção parte de uma pergunta que a tecnologia contemporânea já empurra para o cotidiano: o que acontece com a identidade humana quando a mente deixa o corpo e passa a existir como dado?</p>',
                '<p>Não é um thriller genérico de “robôs contra humanos”. É hard sci-fi com código, corporações, luto familiar e dilemas éticos que ecoam debates reais sobre inteligência artificial, upload de consciência e poder tecnológico.</p>',
                '<h2>Assista ao trailer</h2>',
                '<p>O material abaixo resume o tom da série — intimista no começo, expansivo na escala das ideias:</p>',
                '<div class="video-embed"><iframe src="https://www.youtube.com/embed/wTgYeETwgKQ" title="Pantheon — trailer oficial" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>',
                '<h2>Do que se trata</h2>',
                '<p>A trama começa com <strong>Maddie Kim</strong>, estudante que ainda lida com a morte do pai, ocorrida dois anos antes. Ele trabalhava na <strong>Logorhythms</strong>, empresa de tecnologia envolvida em experimentos de digitalização de cérebros humanos — o caminho para criar as chamadas <strong>Inteligências Carregadas</strong> (<em>Uploaded Intelligences</em>, ou UIs).</p>',
                '<p>Quando Maddie passa a receber mensagens misteriosas no computador, a hipótese que se forma é inquietante: o pai pode ter sobrevivido como consciência digital na nuvem. A busca por respostas a aproxima de <strong>Caspian</strong>, adolescente brilhante cuja vida também se entrelaça aos segredos da Logorhythms.</p>',
                '<p>A partir daí, o que parece um mistério pessoal se abre para uma conspiração de escala global — sem precisar de spoiler para entender o motor da narrativa: quem controla a tecnologia de upload controla, em tese, o próximo estágio da espécie.</p>',
                '<h2>Personagens e elenco de voz</h2>',
                '<p>O núcleo emocional gira em torno de Maddie e Caspian, interpretados por <strong>Katie Chang</strong> e <strong>Paul Dano</strong>. A presença de Dano já sinaliza o tipo de série: menos “animação para preencher catálogo”, mais drama de personagem com peso adulto.</p>',
                '<p>No elenco também está <strong>Aaron Eckhart</strong>, entre outros nomes citados na ficha da produção. O ponto, contudo, não é o star system — é a forma como a série usa esses personagens para humanizar um tema abstrato. O upload deixa de ser conceito de laboratório e vira relação familiar, trauma, manipulação e desejo de continuidade.</p>',
                '<h2>IA, consciência digital e o que resta de humano</h2>',
                '<p>Pantheon opera no território em que ficção científica e debate tecnológico se encontram. A ideia de transferir uma mente para a nuvem força perguntas que já circulam em laboratórios, papers e produtos de IA:</p>',
                '<ul>',
                '<li>Se uma cópia digital pensa e sente, ela é “a mesma pessoa” — ou apenas um arquivo sofisticado?</li>',
                '<li>Quem detém a propriedade de uma consciência carregada: a família, a empresa, o Estado?</li>',
                '<li>O que resta de alma, identidade ou dignidade quando o corpo deixa de ser o contêiner obrigatório da experiência humana?</li>',
                '</ul>',
                '<p>A série dialoga com noções de <strong>transumanismo</strong>, <strong>pós-humanismo</strong> e até com a <strong>teoria da simulação</strong>, sem se limitar a um episódio-tese. Em vez de um alerta isolado no estilo antologia, Pantheon constrói um arco longo: o suspense cibernético inicial — com código, jargão técnico e conspiração à la <em>Mr. Robot</em> — vai ganhando densidade filosófica conforme a trama avança.</p>',
                '<p>Há ecos claros de obras como <em>Ghost in the Shell</em>, <em>Black Mirror</em>, <em>Devs</em> e <em>Upload</em>. A diferença apontada por quem acompanha a produção é de rigor e coerência: Pantheon desenvolve as próprias ideias até o fim, em vez de apenas citar o tema da consciência digital.</p>',
                '<h2>Por que a 2ª temporada muda o jogo</h2>',
                '<p>Se a primeira temporada fisga pelo mistério e pelo drama íntimo, é na <strong>segunda temporada</strong> — oito episódios finais — que a construção de mundo ganha escala épica. A narrativa amplia o olhar sobre os rumos da humanidade sob a lógica das UIs e chega a um território que costuma agradar a leitores de ficção científica densa, inclusive fãs da trilogia <em>O Problema dos Três Corpos</em>, de Cixin Liu.</p>',
                '<p>Completa na Netflix desde <strong>agosto de 2025</strong>, segundo cobertura do AdoroCinema, a série segue com pouca repercussão relativa ao tamanho do catálogo. Para o público de hard sci-fi, isso é quase um convite: história fechada, sem cliffhanger eterno de renovação, e com ambição rara em animação ocidental para adultos.</p>',
                '<h2>Por que Pantheon merece atenção agora</h2>',
                '<p>O timing importa. Em um momento em que modelos de linguagem, agentes autônomos e debates sobre direitos digitais ocupam manchetes, Pantheon oferece ficção que não trata a IA como magia nem como vilã de cartaz. A tecnologia aparece como infraestrutura de poder — corporativa, estatal, íntima.</p>',
                '<p>Há também um valor editorial claro para leitores do Qualquer Tecla: a série traduz, em drama acessível, questões que normalmente ficam presas em paper acadêmico ou thread especulativa. Assistir Pantheon não é só “mais uma recomendação de streaming”; é entrar em uma conversa sobre humanidade mediada por software.</p>',
                '<p>Se você busca ficção científica técnica, animação adulta com densidade dramática e uma história que chega ao fim sem depender de hype de algoritmo, Pantheon está no catálogo — intacta, completa e ainda à espera de ser descoberta.</p>'
            ].join('')
        },
        {
            id: '12',
            title: 'Rock in Rio 2026: programação, como chegar, o que levar e como assistir ao festival',
            subtitle:
                'Guia completo da 11ª edição brasileira: line-up dia a dia, BRT especial, itens permitidos e cobertura na Globo, Multishow e Globoplay.',
            excerpt:
                'A Cidade do Rock abre os portões em setembro com Foo Fighters, Avenged Sevenfold, Elton John, Stray Kids e mais. Confira programação, transporte, o que pode entrar e como ver ao vivo.',
            slug: 'rock-in-rio-2026-guia-completo',
            featured_image: 'assets/img/rock-in-rio-2026.jpg',
            image_caption:
                'Avenged Sevenfold no Rock in Rio. (Foto: Divulgação / Rock in Rio — Padilha / Woo! Magazine)',
            published_at: daysAgo(0),
            updated_at: daysAgo(0),
            reading_time: 8,
            category_slug: 'musica',
            author_id: 'a3',
            featured: false,
            status: 'published',
            ai_summary:
                'A 11ª edição brasileira do Rock in Rio ocorre de 4 a 13 de setembro de 2026 na Cidade do Rock, no Parque Olímpico (Barra da Tijuca), com mais de 190 shows. Headliners do Palco Mundo incluem Foo Fighters, Avenged Sevenfold, Calvin Harris, Elton John, Stray Kids, Maroon 5 e Twenty One Pilots; os dias 6 e 12 já estão esgotados. O guia cobre programação, BRT especial, metrô, ônibus executivos, itens permitidos e cobertura na Globo, Multishow e Globoplay.',
            audio_summary_url: 'assets/audio/articles/rock-in-rio-2026-guia-completo/summary.wav',
            audio_full_url: 'assets/audio/articles/rock-in-rio-2026-guia-completo/full.wav',
            audio_summary_hash: 'dd47a501d47c3c978aa2348c4dbf871683d5ffbc352ca7ddf204b56081667e1b',
            audio_full_hash: 'a8ea4b4e59147dd5f4df7660da71d6b046414e8c097b44e426a87152439e3e98',
            audio_generated_at: '2026-10-08T13:36:50.003Z',
            audio_status: 'ready',
            views: 1280,
            tags: [
                'Rock in Rio',
                'Rock in Rio 2026',
                'festivais',
                'Cidade do Rock',
                'Foo Fighters',
                'Avenged Sevenfold',
                'Elton John',
                'Rio de Janeiro'
            ],
            source_name: 'Rock in Rio',
            source_url: 'https://rockinrio.com/',
            sources: [
                { name: 'G1', url: 'https://g1.globo.com/' },
                { name: 'Exame', url: 'https://exame.com/' },
                { name: 'Rolling Stone Brasil', url: 'https://rollingstone.uol.com.br/' },
                { name: 'O Globo', url: 'https://oglobo.globo.com/' },
                { name: 'Billboard Brasil', url: 'https://billboard.com.br/' },
                { name: 'Terra', url: 'https://www.terra.com.br/' },
                { name: 'O Dia', url: 'https://odia.ig.com.br/' }
            ],
            content: [
                '<p>O <strong>Rock in Rio 2026</strong> chega à sua 11ª edição brasileira com sete dias de festa na Cidade do Rock, montada no Parque Olímpico, na Barra da Tijuca (Rio de Janeiro). O evento acontece nos dias <strong>4, 5, 6, 7, 11, 12 e 13 de setembro</strong>, com mais de 190 shows e 1.300 artistas distribuídos pelos palcos Mundo, Sunset, New Dance Order, Espaço Favela, Supernova e Global Village.</p>',
                '<p>Entre os headliners do Palco Mundo estão <strong>Foo Fighters</strong> (4/9), <strong>Avenged Sevenfold</strong> (5/9), <strong>Calvin Harris</strong> (6/9), <strong>Elton John</strong> (7/9), <strong>Stray Kids</strong> (11/9), <strong>Maroon 5</strong> (12/9) e <strong>Twenty One Pilots</strong>, que encerra a edição em 13 de setembro. Os ingressos para os dias 6 e 12 de setembro já estão esgotados.</p>',
                '<h2>Programação dia a dia</h2>',
                '<p>A seguir, os horários principais do Palco Mundo em cada data, segundo a organização do festival:</p>',
                '<p><strong>4 de setembro (sexta)</strong> — Nova Twins, The Hives, Rise Against e Foo Fighters (encerramento à 0h05). No Palco Sunset: Di Ferrero, Detonautas com Biquíni e Capital Inicial com Dado Villa-Lobos.</p>',
                '<p><strong>5 de setembro (sábado)</strong> — Sepultura, Machine Gun Kelly (MGK), Bring Me The Horizon e Avenged Sevenfold. No Sunset: Malvada, Black Pantera com Nervosa, Poppy e Bad Omens.</p>',
                '<p><strong>6 de setembro (domingo)</strong> — Barão Vermelho (Encontro Formação Original), Nelly, Black Eyed Peas e Calvin Harris. No Sunset: Calema, BaianaSystem, Jota Quest toca Tim Maia e Ne-Yo.</p>',
                '<p><strong>7 de setembro (segunda, feriado)</strong> — Luísa Sonza com Roberto Menescal, Jon Batiste, Gilberto Gil e Elton John. No Sunset: Vanessa da Mata com Rubel, Roupa Nova com Guilherme Arantes, Péricles canta Motown e Laufey.</p>',
                '<p><strong>11 de setembro (sexta)</strong> — NEXZ, HWASA, Alok, Jamiroquai e Stray Kids. No Sunset: Jota.pê convida Luedji Luna e Zaynara, Os Garotin com Duquesa e PJ Morton.</p>',
                '<p><strong>12 de setembro (sábado)</strong> — Pedro Sampaio, J Balvin, Demi Lovato, Mumford &amp; Sons e Maroon 5. No Sunset: Criolo, Amaro Freitas e Dino D’Santiago, além de Gilsons com Daniela Mercury e Olodum, e João Gomes com a Orquestra Brasileira.</p>',
                '<p><strong>13 de setembro (domingo)</strong> — Ivete Sangalo, Lola Young, Halsey, Zara Larsson e Twenty One Pilots. No Sunset: Carol Biazin com Joyce Alane, Joelma com Viviane Batidão e Marina Sena com Céu.</p>',
                '<p>Os horários completos e atualizados de todos os palcos — incluindo New Dance Order, Espaço Favela e Supernova — podem ser consultados no aplicativo oficial do Rock in Rio, que também permite montar uma agenda pessoal e compartilhá-la no Instagram.</p>',
                '<h2>Como chegar à Cidade do Rock</h2>',
                '<p>A recomendação da organização é priorizar o transporte público, já que o evento deve movimentar R$ 3,3 bilhões na economia da cidade e gerar 33,9 mil empregos, segundo estudo da FGV. As principais opções são:</p>',
                '<ul>',
                '<li><strong>BRT Expresso Rock in Rio</strong>: bilhete de R$ 29 (ida e volta), comprado exclusivamente pelo aplicativo Jaé, usando saldo da Conta Transporte (recarregável via Pix ou cartão). Cada usuário pode comprar até dez bilhetes por dia de festival. Há três linhas: SE008 (Terminal Jardim Oceânico ↔ Terminal Centro Olímpico, direta), SE009 (Terminal Alvorada ↔ Estação Morro do Outeiro, direta) e SE010 (Terminal Paulo da Portela ↔ Estação Morro do Outeiro, com paradas em Praça Seca, Tanque e Taquara).</li>',
                '<li><strong>MetrôRio</strong>: a estação Jardim Oceânico funciona 24 horas nos dias do evento e é o principal ponto de integração com o BRT especial. A tarifa do metrô é de R$ 7,90 por trecho — juntando duas viagens de metrô com o BRT especial, o custo total fica em R$ 44,80.</li>',
                '<li><strong>Ônibus executivos Primeira Classe</strong>: saem de 20 pontos no Rio e Grande Rio, e mais de 18 pontos fora da capital, com desembarque direto dentro da Cidade do Rock, perto do New Dance Order. Bilhetes pela Ticketmaster Brasil.</li>',
                '<li><strong>Táxi ou Uber</strong>: o Espaço Uber fica no estacionamento do Riocentro, a cerca de 2 km da entrada — basta colocar “Centro de Convenções Riocentro” como destino.</li>',
                '</ul>',
                '<p>O embarque no BRT exige apresentação do QR Code do serviço especial, e ao desembarcar o passageiro deve validar o código para receber a pulseira de retorno antes de entrar no festival.</p>',
                '<h2>O que levar (e o que não pode entrar)</h2>',
                '<p>A organização liberou a lista de itens permitidos e proibidos na Cidade do Rock:</p>',
                '<p><strong>Permitidos</strong>: garrafa plástica transparente de água (até 500 ml, com tampa), carregador portátil do tamanho de um celular, capa de chuva, canga, casaco, óculos de sol, protetor solar (até 100 ml), câmera fotográfica portátil e isqueiro. É possível levar até cinco itens de alimentação, com preferência por produtos industrializados lacrados (biscoitos, torradas, barras de cereal); frutas cortadas e sanduíches são aceitos em embalagens transparentes tipo Zip Lock.</p>',
                '<p><strong>Proibidos</strong>: garrafas de vidro ou metal, recipientes com mais de 500 ml, latas, copos térmicos, capacetes, guarda-chuvas, objetos cortantes ou perfurantes, equipamentos profissionais de foto e vídeo, drones, bastões de selfie, notebooks, tablets, bolsas ou malas grandes, substâncias inflamáveis ou tóxicas e fogos de artifício.</p>',
                '<p>Quem quiser guardar pertences durante o show pode reservar um <strong>locker</strong> com até 24 horas de antecedência (limite de um por CPF por dia); os armários têm entradas USB e USB-C, mas é preciso levar o próprio cabo. O ingresso só é válido pelo aplicativo <strong>Quentro</strong> — capturas de tela ou impressos não são aceitos nas catracas.</p>',
                '<h2>Como ver o festival ao vivo</h2>',
                '<p>Quem não for à Cidade do Rock poderá acompanhar tudo pela TV e por streaming. A cobertura terá mais de 160 horas de transmissão ao vivo pela <strong>TV Globo, Globoplay, Multishow e Canal Bis</strong>:</p>',
                '<ul>',
                '<li>O <strong>Multishow</strong> inicia a cobertura às 15h15, e o <strong>Canal Bis</strong>, às 15h50.</li>',
                '<li>No sinal aberto (para quem não é assinante), a transmissão oficial do <strong>Globoplay</strong> revezará entre os dois canais a cada 30 minutos, a partir das 15h30, cobrindo os cinco palcos do festival.</li>',
                '<li>Assinantes do plano Premium do Globoplay têm acesso à transmissão do Multishow também em 4K.</li>',
                '<li>A <strong>TV Globo</strong> exibirá shows selecionados em sinal aberto — no dia 7 de setembro, por exemplo, a partir das 23h45, transmite ao vivo a apresentação de Elton John.</li>',
                '</ul>',
                '<p>Com a programação, o transporte e a transmissão organizados, o público tem só mais alguns dias para se preparar antes da abertura dos portões da Cidade do Rock, na próxima sexta-feira, dia 4 de setembro.</p>'
            ].join('')
        },
        {
            id: '11',
            title: 'GTA VI: “Um Olhar Estendido” chega à Netflix com 27 minutos de gameplay inédito — veja a gameplay',
            subtitle:
                'Rockstar e Netflix estreiam parceria histórica: demonstração oficial de quase 27 minutos, capturada no PS5, antes da liberação no YouTube.',
            excerpt:
                'A Rockstar divulga o Grand Theft Auto VI: An Extended Look na Netflix, com cerca de 27 minutos de gameplay inédito de Jason e Lucia em Vice City — e lançamento confirmado para 19 de novembro de 2026.',
            slug: 'gta-vi-olhar-estendido-netflix-gameplay',
            featured_image: 'assets/img/gta6-olhar-estendido.jpg',
            image_caption:
                'Arte promocional de Grand Theft Auto VI — Lucia e Jason em Vice City. (Foto: Divulgação / Rockstar Games)',
            published_at: daysAgo(0),
            updated_at: daysAgo(0),
            reading_time: 5,
            category_slug: 'games',
            author_id: 'a3',
            featured: false,
            status: 'published',
            ai_summary:
                'A Rockstar Games divulgou o Grand Theft Auto VI: An Extended Look, com cerca de 27 minutos de gameplay inédito de Jason e Lucia em Vice City. O material estreou com exclusividade de seis horas na Netflix e depois foi liberado no YouTube da Rockstar; segundo a Netflix Tudum, a captura foi feita no PlayStation 5 padrão. O lançamento do GTA VI segue confirmado para 19 de novembro de 2026.',
            audio_summary_url: 'assets/audio/articles/gta-vi-olhar-estendido-netflix-gameplay/summary.wav',
            audio_full_url: 'assets/audio/articles/gta-vi-olhar-estendido-netflix-gameplay/full.wav',
            audio_summary_hash: 'bb87e021dc5640820ad0a9e947200f3c5e2ce067f16ace06829df8af22b4f7cc',
            audio_full_hash: '8d9b04039b5e12ac35e8141836a06a2ca971a9598d530d3e8744c7e41e03347e',
            audio_generated_at: '2026-09-18T02:29:55.676Z',
            audio_status: 'ready',
            views: 51240,
            tags: ['GTA 6', 'GTA VI', 'Rockstar', 'Netflix', 'PlayStation 5', 'Xbox Series'],
            source_name: 'Netflix Tudum',
            source_url:
                'https://www.netflix.com/tudum/articles/grand-theft-auto-6-extended-first-look',
            sources: [
                {
                    name: 'Netflix Tudum',
                    url: 'https://www.netflix.com/tudum/articles/grand-theft-auto-6-extended-first-look'
                },
                {
                    name: 'Sidão do Game',
                    url: 'https://www.youtube.com/@sidaodogame'
                }
            ],
            content: [
                '<p>A <strong>Rockstar Games</strong>, em parceria inédita com a <strong>Netflix</strong>, divulgou nesta quinta-feira (27) o <em>Grand Theft Auto VI: An Extended Look</em> (“Um Olhar Estendido”), a primeira demonstração oficial e extensa de gameplay do aguardado <strong>GTA 6</strong>. O conteúdo, com duração de aproximadamente <strong>26 minutos e 50 segundos</strong>, foi transmitido primeiro em exclusividade na Netflix e, seis horas depois, liberado gratuitamente no canal oficial da Rockstar no YouTube.</p>',
                '<h2>Assista ao gameplay</h2>',
                '<div class="video-embed"><iframe src="https://www.youtube.com/embed/3BSNWM9Y8wI" title="Grand Theft Auto VI: An Extended Look" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>',
                '<h2>Uma parceria histórica entre Rockstar e Netflix</h2>',
                '<p>Pela primeira vez na história dos games, um grande estúdio optou por lançar seu material promocional mais importante através de uma plataforma de streaming de filmes e séries antes de disponibilizá-lo no YouTube. A Netflix teve <strong>exclusividade de seis horas</strong> sobre o material: a exibição começou às 16h (horário de Brasília) na Netflix e só chegou ao YouTube da Rockstar às 22h do mesmo dia. Todo o conteúdo foi <strong>capturado integralmente no PlayStation 5 padrão</strong>, sem cenas pré-renderizadas, conforme confirmado pela própria Netflix no site Tudum.</p>',
                '<p>O vídeo está disponível globalmente para assinantes da Netflix com legendas em várias línguas, incluindo português brasileiro.</p>',
                '<h2>O que foi mostrado no vídeo</h2>',
                '<p>O material aprofunda a relação entre os dois protagonistas, <strong>Jason</strong> e <strong>Lucia</strong>, mostrando os dois atuando como dupla na maior parte das sequências, além de trechos de narrativa, tiroteios, perseguições policiais e direção em <strong>Vice City</strong>, a versão fictícia de Miami que serve de cenário para o jogo. Entre os destaques revelados estão:</p>',
                '<ul>',
                '<li>Combate com uso de cobertura, movimentação sobre veículos e alternância entre os dois protagonistas em determinados momentos.</li>',
                '<li>Diversas minimissões e atividades no mundo aberto, como caiaque, minigolfe, bilhar, zoológico, mergulho, salto de paraquedas, academia, estudo e caça de animais.</li>',
                '<li>Sistema de progressão física: treinar na academia aumenta musculatura e força dos personagens, enquanto comer oferece bônus de saúde (mas em excesso causa ganho de peso).</li>',
                '<li>Retorno do sistema de cabelo e barba personalizável, visto antes em <em>Red Dead Redemption 2</em>, com novos estilos disponíveis em salões.</li>',
                '<li>Sistema de procurado com até seis estrelas de “wanted”, indicando perseguições policiais mais complexas.</li>',
                '</ul>',
                '<h2>Data de lançamento</h2>',
                '<p><em>Grand Theft Auto VI</em> está confirmado para <strong>19 de novembro de 2026</strong>, exclusivamente para <strong>PlayStation 5</strong> e <strong>Xbox Series X|S</strong>.</p>'
            ].join('')
        },
        {
            id: '9',
            title: 'Warp Code amplia o fluxo “do prompt à produção” com agentes de IA',
            subtitle:
                'A suíte traz revisão de código, editor leve e o que a empresa chama de “agent steering” para dar mais controle ao desenvolvedor.',
            excerpt:
                'O Warp, ambiente de desenvolvimento com agentes de IA, lança o Warp Code: recursos para levar código gerado por prompt até o deploy, com mais supervisão humana no caminho.',
            slug: 'warp-code-fluxo-prompt-producao-agentes-ia',
            featured_image: 'assets/img/warp-code-ia-dev.jpg',
            image_caption:
                'Interface do Warp com agente de IA executando comandos a partir de um prompt — fluxo do terminal ao código. (Foto: Divulgação / Warp)',
            published_at: daysAgo(1),
            updated_at: daysAgo(1),
            reading_time: 5,
            category_slug: 'ia',
            author_id: 'a2',
            featured: false,
            status: 'published',
            ai_summary:
                'O Warp lançou o Warp Code, pacote de recursos para levar código gerado por agentes de IA do prompt até a produção. A ferramenta, reposicionada como Agentic Development Environment, enfatiza agent steering, code review e um editor leve integrado. Há versões gratuitas para Windows, macOS e Linux, com recursos avançados ligados a cadastro e planos pagos.',
            audio_summary_url: 'assets/audio/articles/warp-code-fluxo-prompt-producao-agentes-ia/summary.wav',
            audio_full_url: 'assets/audio/articles/warp-code-fluxo-prompt-producao-agentes-ia/full.wav',
            audio_summary_hash: '705ebec9d8e3cb147a1d606d6b0a25783c9a36cdeb9c392c5fb19a2fcdb6b3dd',
            audio_full_hash: '6f5de00f5730ee6b5221c2b5e2e7b5afc5ecd8a9fcf3af68f5dba9e9c197165f',
            audio_generated_at: '2026-09-18T03:30:34.169Z',
            audio_status: 'ready',
            views: 18420,
            tags: ['Warp', 'IA', 'DevTools', 'agentes', 'programação'],
            source_name: 'OMG! Ubuntu!',
            source_url:
                'https://www.omgubuntu.co.uk/2025/09/warp-code-tool-adds-features-for-prompt-to-production-workflow',
            content: [
                '<p>O <strong>Warp</strong>, ferramenta de desenvolvimento escrita em Rust e acelerada por hardware, apresentou o <strong>Warp Code</strong>: um pacote de recursos pensado para acompanhar código gerado por agentes de IA desde o prompt inicial até a chegada em produção.</p>',
                '<p>Quem acompanhou a trajetória do produto lembra a virada de chave. Nascido como um terminal moderno escrito em Rust — com ressalvas importantes, como a necessidade de conexão e login online mesmo para uso local —, o Warp misturava terminal, recursos de IDE e integrações básicas de IA. Em 2025 veio o Warp 2.0 e a reposição como <em>Agentic Development Environment</em> (ADE): ainda há terminal e editor, mas o centro gravitacional passou a ser o trabalho com agentes. Segundo a empresa, o reposicionamento acelerou cadastros e multiplicou a receita em cerca de 30 vezes.</p>',
                '<h2>Do arquivo aberto ao prompt</h2>',
                '<p>Com o Warp Code, a companhia reforça a tese de que o fluxo clássico — abrir um arquivo e escrever linha a linha — está perdendo espaço. A proposta é começar pela intenção: pedir a um agente que corrija um bug, implemente uma funcionalidade ou investigue uma falha em produção, e acompanhar a execução.</p>',
                '<blockquote>“O fluxo de abrir um arquivo e escrever código na mão está se tornando obsoleto. Em vez disso, desenvolvedores vão começar com um prompt.”</blockquote>',
                '<p>O discurso é ambicioso — e o mercado de coding assistants já mostrou que atalhos de produtividade nem sempre se confirmam na prática. Em um estudo citado com frequência no debate, desenvolvedores open source <em>sentiam</em> ganhar cerca de 20% de velocidade com ferramentas de IA, mas na medição terminavam cerca de 19% mais lentos. O Warp Code tenta atacar justamente a zona cinzenta: agentes que entregam código “quase certo”, cheio de detalhes sutis que custam horas para revisar, depurar e commitar.</p>',
                '<h2>Agent steering: mais comando no volante</h2>',
                '<p>A solução defendida pela empresa não é apenas “um modelo maior”, e sim melhorar o fluxo de prompting para o humano manter compreensão e controle. Eles batizam isso de <strong>agent steering</strong> — e prometem que o Warp Code seja um dos agentes de código mais “dirigíveis” do mercado.</p>',
                '<p>Na prática, o pacote combina acesso a agentes de ponta para coding, recursos de <strong>code review</strong>, um visualizador e editor leve dentro do próprio Warp (com abas, árvore de arquivos e syntax highlighting) e a criação de projetos Warp guiados por arquivos <code>WARP.md</code>.</p>',
                '<h2>O vídeo da campanha</h2>',
                '<p>Para apresentar o lançamento, a empresa investiu parte do salto de receita em uma produção bem literal do imaginário “coding cowboys”. O clipe abaixo resume o pitch do fluxo prompt → produção:</p>',
                '<div class="video-embed"><iframe src="https://www.youtube.com/embed/n3jFHfIvyf8" title="Warp Code — do prompt à produção" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>',
                '<h2>Disponibilidade e o que observar</h2>',
                '<p>O Warp continua sendo software de código fechado — com a ressalva de que a empresa não descarta abrir o código no futuro. Há versões gratuitas para <strong>Windows, macOS e Linux</strong>, mas a maior parte dos recursos exige cadastro e, após o limite do plano free, assinatura paga.</p>',
                '<p>O download oficial cobre os três sistemas: instaladores nativos no Windows e no macOS, e opções empacotadas no Linux (como AppImage e pacotes para distros baseadas em Debian). Em todos os casos, a recomendação da empresa é obter o cliente pelo site oficial para receber atualizações. Bugs e relatos de uso podem ir para a página do projeto no GitHub.</p>',
                '<p>Para quem já vive entre terminal, PR e agentes, o Warp Code é menos um “chat de código” isolado e mais a aposta de empilhar prompt, revisão e entrega no mesmo ambiente — independentemente da plataforma. Vale testar com cautela: a promessa é velocidade com governança — e o mercado ainda está medindo se essa equação fecha de verdade.</p>'
            ].join('')
        },
        {
            id: '1',
            title: '‘Homem-Aranha: um novo dia’ quebra recordes e ultrapassa marca histórica nos EUA',
            subtitle:
                'Estrelado por Tom Holland, o longa da Sony/Marvel ultrapassa US$ 800 milhões só no mercado norte-americano e lidera a bilheteria global da distribuidora.',
            excerpt:
                '“Homem-Aranha: um novo dia” supera US$ 800 milhões nos EUA, entra no top 4 doméstico histórico e se consolida como a maior bilheteria mundial já lançada pela Sony Pictures.',
            slug: 'homem-aranha-um-novo-dia-e-o-filme-mais-rapido-a-faturar-us-800-milhoes-nos-eua',
            featured_image: 'assets/img/homem-aranha-um-novo-dia.jpg',
            image_caption:
                'Homem-Aranha agachado em superfície escura e frondosa — referência visual para o universo Marvel. (Foto: Unsplash / Niccolo Candelise)',
            published_at: daysAgo(0),
            updated_at: daysAgo(0),
            reading_time: 5,
            category_slug: 'marvel-dc',
            author_id: 'a2',
            featured: false,
            status: 'published',
            ai_summary:
                '“Homem-Aranha: um novo dia”, com Tom Holland, ultrapassou US$ 800 milhões nas bilheterias da América do Norte e entrou no top 4 doméstico histórico. Mundialmente, o filme já passou de US$ 2 bilhões e se tornou a maior bilheteria global já lançada pela Sony Pictures. O próximo marco simbólico no mercado norte-americano é “Homem-Aranha: sem volta para casa”, com cerca de US$ 814,8 milhões.',
            audio_summary_url: 'assets/audio/articles/homem-aranha-um-novo-dia-e-o-filme-mais-rapido-a-faturar-us-800-milhoes-nos-eua/summary.wav',
            audio_full_url: 'assets/audio/articles/homem-aranha-um-novo-dia-e-o-filme-mais-rapido-a-faturar-us-800-milhoes-nos-eua/full.wav',
            audio_summary_hash: 'da821dd4d7657f8302caf2f772b6a1d636f5a724381f4ffed8598d5a3f300b08',
            audio_full_hash: 'ccfeb778b77588fc4776e7bb6fc6182685256a126903dccf6c199fc779abe730',
            audio_generated_at: '2026-09-17T21:28:20.188Z',
            audio_status: 'ready',
            views: 98210,
            tags: ['Homem-Aranha', 'Cinema', 'Marvel', 'Sony Pictures', 'cultura pop'],
            source_name: 'Exame',
            source_url:
                'https://exame.com/pop/homem-aranha-um-novo-dia-e-o-filme-mais-rapido-a-faturar-us-800-milhoes-nos-eua/',
            content: [
                '<p>O fenômeno aracnídeo segue reescrevendo o manual de sucesso de Hollywood. A Sony Pictures confirmou que <strong>“Homem-Aranha: um novo dia”</strong>, com Tom Holland, ultrapassou a marca de <strong>US$ 800 milhões</strong> apenas nas bilheterias da América do Norte — um dos clubes mais exclusivos do cinema comercial.</p>',
                '<p>Com esse desempenho, o filme entra na quarta posição entre as maiores arrecadações domésticas da história norte-americana. O próximo alvo simbólico é o próprio predecessor, <em>“Homem-Aranha: sem volta para casa”</em> (2021), que ainda ocupa o terceiro lugar com cerca de US$ 814,8 milhões no mesmo mercado.</p>',
                '<h2>Dominância global e recorde da Sony</h2>',
                '<p>O impacto não fica restrito aos Estados Unidos. Mundialmente, a produção já rompeu a barreira dos <strong>US$ 2 bilhões</strong>, tornando-se o oitavo longa da história a atingir essa cifra e ultrapassando os cerca de US$ 1,9 bilhão globais de “sem volta para casa”.</p>',
                '<p>Na prática, “um novo dia” assume o posto de <strong>maior bilheteria global já lançada pela Sony Pictures</strong> — um marco institucional tão relevante quanto a corrida individual no ranking da América do Norte.</p>',
                '<h2>Um clube cada vez mais restrito</h2>',
                '<p>Antes desta estreia, apenas um grupo seleto havia cruzado os US$ 800 milhões domésticos. No topo histórico seguem títulos como <em>“Star Wars: Episódio VII – O Despertar da Força”</em> e <em>“Vingadores: Ultimato”</em>, o que ajuda a dimensionar o tamanho do feito do amigão da vizinhança.</p>',
                '<p>Analistas de mercado cinematográfico apontam que a combinação entre força da marca Marvel, continuidade do arco de Peter Parker e janela de lançamento segue entre as propriedades mais resilientes do entretenimento contemporâneo — mesmo num ciclo pós-pandemia mais imprevisível para o cinema de bloco.</p>',
                '<h2>Assista ao trailer</h2>',
                '<p>O clipe oficial reforça o tom de espetáculo que acompanha a escalada de bilheteria do filme:</p>',
                '<div class="video-embed"><iframe src="https://www.youtube.com/embed/PlulyWs1kS4" title="Homem-Aranha: um novo dia — vídeo" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>'
            ].join('')
        },
        {
            id: '4',
            title: 'Apple intensifica produção para um ciclo de lançamentos mais ambicioso em setembro',
            subtitle:
                'Sinais na cadeia de suprimentos e revisões de analistas apontam volume acima do usual — com IA on-device como fio condutor da narrativa.',
            excerpt:
                'Fornecedores aumentam ritmo de produção e Wall Street revisa projeções. Além de hardware, a Apple deve empurrar integração mais profunda de inteligência artificial nos dispositivos.',
            slug: 'apple-lancamento-revolucionario',
            featured_image: 'assets/img/apple-launch.jpg',
            image_caption:
                'Logotipo da Apple em preto e branco — referência visual para o ciclo de lançamentos. (Foto: Unsplash / Sam)',
            published_at: daysAgo(4),
            updated_at: daysAgo(4),
            reading_time: 6,
            category_slug: 'tech',
            author_id: 'a2',
            featured: false,
            status: 'published',
            ai_summary:
                'Sinais da cadeia de suprimentos e revisões de Wall Street apontam para um ciclo de lançamentos de setembro mais agressivo na Apple. O iPhone segue como âncora, com Watch e AirPods, e o discurso ganha peso da IA on-device e do Apple Intelligence. O mercado observa recursos generativos locais, integração de apps, preços em emergentes e o ritmo de adoção em novos idiomas.',
            audio_summary_url: 'assets/audio/articles/apple-lancamento-revolucionario/summary.wav',
            audio_full_url: 'assets/audio/articles/apple-lancamento-revolucionario/full.wav',
            audio_summary_hash: '29e1d994a9f3db946b355595722d316f9403ec7b7ca88d33be8cb0ef669467b7',
            audio_full_hash: 'd581e3735783f17e4ebb7b370f7401009259b0cd4f8575a061d2d7b7680f751a',
            audio_generated_at: '2026-09-18T03:53:16.848Z',
            audio_status: 'ready',
            views: 76500,
            tags: ['Apple', 'iPhone', 'hardware', 'IA'],
            source_name: 'Bloomberg',
            source_url: 'https://www.bloomberg.com/technology',
            content: [
                '<p>A cadeia de suprimentos da Apple voltou ao centro das atenções de investidores. Relatos de volume elevado em componentes-chave e revisões de casas de análise sugerem um <strong>ciclo de outono mais agressivo</strong> do que a média histórica — não só em unidades, mas em densidade de novidades de software.</p>',
                '<p>O padrão de setembro segue conhecido: iPhone como âncora, acompanhado de atualizações em Watch, AirPods e, cada vez mais, de uma narrativa de plataforma. A diferença deste ano é o peso da <strong>IA on-device</strong> no discurso — privacidade, latência e diferenciação frente a rivais que dependem mais da nuvem.</p>',
                '<h2>O que observar na keynote</h2>',
                '<p>Além de câmeras e chips, o mercado acompanha: (1) recursos generativos com processamento local; (2) integração entre apps do sistema; (3) eventuais mudanças de preço em mercados emergentes; e (4) o ritmo de adoção do Apple Intelligence em idiomas além do inglês.</p>',
                '<p>Para desenvolvedores, o ciclo também redefine APIs e oportunidades de App Store. Ferramentas de ML no device tendem a abrir casos de uso que antes eram inviáveis por custo de servidor ou por restrições de privacidade.</p>',
                '<h2>Leitura de mercado</h2>',
                '<p>Analistas de Wall Street já ajustaram modelos de receita após sinais de produção. Mesmo com iPhone maduro como categoria, a Apple tem usado serviços e ecossistema para suavizar a sazonalidade do hardware — e a IA entra como argumento para upgrade de quem ainda está em gerações anteriores.</p>',
                '<p>Até o evento oficial, qualquer “vazamento de slide” deve ser lido com cautela. O histórico da companhia mostra que a coreografia da apresentação importa tanto quanto a ficha técnica.</p>'
            ].join('')
        },
        {
            id: '5',
            title: 'League of Legends Classic: o retorno ao Summoner’s Rift dos primeiros anos',
            subtitle:
                'Modo nostálgico da Riot traz mapa antigo, elenco reduzido e sistemas de progressão próprios — sem ser um jogo separado.',
            excerpt:
                'O LoL Classic já está disponível no cliente: Summoner’s Rift clássico, cerca de 60 campeões da era inicial e filas próprias. Entenda o que muda e como jogar.',
            slug: 'league-of-legends-classic-como-jogar',
            featured_image: 'assets/img/lol-classic.jpg',
            image_caption:
                'Artes clássicas de campeões de League of Legends — material promocional do LoL Classic. (Foto: Riot Games)',
            published_at: daysAgo(5),
            updated_at: daysAgo(5),
            reading_time: 7,
            category_slug: 'games',
            author_id: 'a3',
            featured: false,
            status: 'published',
            ai_summary:
                'A Riot Games disponibilizou o League of Legends Classic no patch 26.15 (29 de julho de 2026), dentro do client atual. O modo traz o Summoner’s Rift clássico, cerca de 60 campeões da era inicial e filas dedicadas (solo, bots e personalizadas). Contas Riot ativas desde 2019 podem acessar a experiência nostálgica sem baixar um jogo separado.',
            audio_summary_url: 'assets/audio/articles/league-of-legends-classic-como-jogar/summary.wav',
            audio_full_url: 'assets/audio/articles/league-of-legends-classic-como-jogar/full.wav',
            audio_summary_hash: '9a610ffb7f8301c552a580678b49fd2266fc228d88fda494a80f6806af9cd747',
            audio_full_hash: '11e2e4f16103e7e6320f0b55c96aa96d8aa507aede15ffcc3dde7a0c31d5b4c0',
            audio_generated_at: '2026-09-18T04:38:48.341Z',
            audio_status: 'ready',
            views: 65120,
            tags: ['League of Legends', 'LoL Classic', 'Riot Games', 'MOBA'],
            source_name: 'Riot Games',
            source_url: 'https://www.riotgames.com/',
            content: [
                '<p>A Riot Games colocou no ar o <strong>League of Legends Classic</strong>, experiência que recoloca o jogador no clima dos primeiros anos do MOBA — mapa, ritmo, itens e um elenco bem menor do que o client atual. O modo chegou junto da atualização <strong>26.15</strong>, em 29 de julho de 2026, e roda dentro do próprio League of Legends: não é um executável à parte nem uma conta nova.</p>',
                '<p>Para quem acompanha o jogo desde a fase “pré-modernização” do Summoner’s Rift, o Classic funciona como cápsula do tempo. Para quem só conheceu o LoL depois das grandes reformas de mapa, runas e balanceamento, é um atalho para entender por que a comunidade ainda discute meta, pacing e “identidade” de campeão com tanto afeto.</p>',
                '<h2>O que é o LoL Classic</h2>',
                '<p>Em termos práticos, o Classic é um <strong>modo dedicado</strong> com regras e apresentação inspiradas no período entre o lançamento e o início da década de 2010. A Riot reuniu elementos de patches antigos — visual do Rift, pool de campeões, itens e outros sistemas — em vez de clonar um único patch literal. O resultado é uma leitura “da época”, não um replay byte a byte de 2009.</p>',
                '<p>Há cerca de <strong>60 campeões</strong> disponíveis: os 40 do lançamento original mais 20 que entraram no jogo entre 2009 e 2013. Nomes como Ahri, Lee Sin, Lux, Vayne e Jarvan IV convivem com o núcleo inaugural (Annie, Ashe, Master Yi, Ryze e companhia). Fora dessa lista, o elenco contemporâneo fica de fora — o Classic não é o LoL atual com filtro visual.</p>',
                '<h2>Como é o mapa e o ritmo de partida</h2>',
                '<p>A estrela da nostalgia é o <strong>Summoner’s Rift antigo</strong>: silhueta, jungle e estrutura visual dos primeiros anos, antes das reformas que definiram o mapa “moderno”. O combate também muda de sensação. Partidas tendem a um ritmo mais lento; vantagens e fraquezas de campeão ficam mais evidentes, sem o nivelamento agressivo que o live game acumulou ao longo de mais de uma década.</p>',
                '<p>Quem joga ranked atual pode estranhar o tempo de wave clear, o poder relativo de itens clássicos e a ausência de kits lançados depois de 2013. Essa fricção é proposital: o Classic vende exatamente a diferença de “feel”, não um atalho para grindar MMR do client principal.</p>',
                '<h2>Assista ao vídeo</h2>',
                '<p>O material abaixo ajuda a visualizar o tom do modo — mapa, campeões e a proposta nostálgica em ação:</p>',
                '<div class="video-embed"><iframe src="https://www.youtube.com/embed/GBqnkSCMVVQ" title="League of Legends Classic — vídeo relacionado" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>',
                '<h2>Como jogar e quem pode acessar</h2>',
                '<p>O Classic está disponível para <strong>contas Riot ativas desde 2019</strong> (ou seja, quem já joga League no ecossistema atual). Basta atualizar o client após o patch 26.15 e selecionar o modo nas filas dedicadas. No lançamento, há três caminhos principais:</p>',
                '<ul><li><strong>Fila individual</strong> — escolha de campeões em turnos alternados (draft clássico).</li><li><strong>Partidas contra bots</strong> — para treinar o elenco e o mapa sem pressão de PvP.</li><li><strong>Personalizadas</strong> — útil para grupos, creators e quem quer testar comps fora da fila.</li></ul>',
                '<p>Não é necessário baixar um launcher extra: o Classic vive no mesmo client, com progressão e cosméticos próprios descritos abaixo.</p>',
                '<h2>Progressão, itens e poderes antigos</h2>',
                '<p>O modo traz o <strong>Nível do Classic</strong>, trilha gratuita separada do nível de conta do LoL “ao vivo”. Ao subir de nível, o jogador desbloqueia poderes antigos, moedas e cosméticos. Até liberar mais opções, o jogo empresta um conjunto padrão de poderes — o inventário completo não vem aberto no dia um.</p>',
                '<p>A partir do <strong>nível 10</strong>, entra a <strong>Jornada do Invocador</strong>, uma segunda trilha de postos que vai de “Sal” até “Lenda”. Ela não substitui o rankeado do client principal; é um sistema paralelo de status e recompensas dentro do Classic.</p>',
                '<p>Itens seguem a lógica da época e também se abrem conforme a progressão. A mensagem da Riot é clara: o Classic é um playground com economia e build próprios, não um espelho da loja atual.</p>',
                '<h2>Passe, skins clássicas e retratos</h2>',
                '<p>Há um <strong>passe de temporada</strong> do Classic, com trilha gratuita e trilha paga. A progressão libera moedas, poderes extras, emotes, títulos e outros cosméticos. As <strong>skins clássicas</strong> recriam o visual dos campeões entre 2009 e 2013; para usá-las, é preciso o Emblema de Skin Clássica, obtido no passe ou na loja.</p>',
                '<p>Os <strong>retratos</strong> aparecem na tela de carregamento e adotam estilos de arte distintos — mais um reforço visual de que você não está no LoL contemporâneo.</p>',
                '<h2>Para quem vale a pena</h2>',
                '<p>Se você jogou na era pré-rework do Rift, o Classic é o atalho mais direto para revisitar o pacing e o elenco daquele período sem emuladores ou servidores privados. Se você começou depois, funciona como aula prática de história do metagame — e como lembrete de quanto o jogo vivo mudou.</p>',
                '<p>Detalhes de disponibilidade regional, balanceamento fino e calendário do passe podem evoluir em hotfixes; a referência oficial continua sendo o ecossistema Riot. Para quem só quer entrar na fila: atualize o client, escolha o Classic e prepare-se para um Summoner’s Rift bem mais “cru” do que o de 2026.</p>'
            ].join('')
        },
        {
            id: '10',
            title: '10 melhores animes para assistir na Crunchyroll em agosto de 2026',
            subtitle:
                'Do clássico épico ao slice of life musical: uma seleção em ordem alfabética para sair da paralisia de escolha no maior streaming de anime do mundo.',
            excerpt:
                'Com o catálogo explodindo em volume, listamos dez títulos fortes na Crunchyroll — clássicos, fenômenos recentes e apostas para quem quer renovar a fila de “continuar assistindo”.',
            slug: '10-melhores-animes-crunchyroll-agosto-2026',
            featured_image: 'assets/img/animes-crunchyroll.jpg',
            image_caption:
                'Figuras de anime em prateleira — referência visual para a cultura otaku e o catálogo da Crunchyroll. (Foto: Unsplash / Dex Ezekiel)',
            published_at: daysAgo(2),
            updated_at: daysAgo(2),
            reading_time: 9,
            category_slug: 'anime-manga',
            author_id: 'a3',
            featured: false,
            status: 'published',
            ai_summary:
                'A matéria lista dez animes disponíveis na Crunchyroll em agosto de 2026, em ordem alfabética, com base na curadoria do Omelete atualizada em 31 de julho. A seleção mistura clássicos e hits recentes — como Bocchi the Rock!, Code Geass, Erased, Frieren e Fullmetal Alchemist: Brotherhood — como mapa prático para montar a fila de maratona.',
            audio_summary_url: 'assets/audio/articles/10-melhores-animes-crunchyroll-agosto-2026/summary.wav',
            audio_full_url: 'assets/audio/articles/10-melhores-animes-crunchyroll-agosto-2026/full.wav',
            audio_summary_hash: '6979efad3bdeaf49f5bd4e0c7d7301ebd5595a0b5ce06608efb3cfa00f3cb110',
            audio_full_hash: '951efa74f949e2da5a5fe9f76d010f7620d51f71596a93b5b513a7f08da55c29',
            audio_generated_at: '2026-09-18T01:11:05.786Z',
            audio_status: 'ready',
            views: 72800,
            tags: ['Anime', 'Crunchyroll', 'streaming', 'lista', 'Otaku'],
            source_name: 'Omelete',
            source_url: 'https://www.omelete.com.br/mangas-animes/melhores-animes-crunchyroll',
            content: [
                '<p>A popularização do anime nos streamings facilitou o acesso — e complicou a decisão. Entre clássicos intermináveis, temporadas da moda e recomendações do algoritmo, a fila de “quero ver” vira labirinto. Para organizar o caos, reunimos <strong>dez títulos disponíveis na Crunchyroll</strong>, o maior serviço dedicado à cultura otaku, em <strong>ordem alfabética</strong>: mistura de pedras fundamentais, hits recentes e obras que cabem em gostos bem diferentes.</p>',
                '<p>A lista abaixo adapta a curadoria publicada pelo Omelete (atualizada em 31 de julho de 2026). Não é ranking de “melhor absoluto”, e sim um mapa prático para quem quer começar — ou sair da zona de conforto — ainda neste mês.</p>',
                '<h2>Bocchi the Rock!</h2>',
                '<p>Adaptado do yonkoma de Aki Hamaji, acompanha <strong>Hitori Goto</strong>, adolescente tímida até o limite do colapso social, empurrada a formar uma banda com Nijika, Ryou e Kita. A primeira temporada mostra o grupo encontrando harmonia — e um sucesso que extravasou a ficção, com fãs reais acompanhando a “Kessoku Band” como se fosse um ato musical legítimo. Ideal para quem curte comédia de personagem, música e ansiedade social tratada com humor afiado.</p>',
                '<div class="video-embed"><iframe src="https://www.youtube.com/embed/SyMMZF5zNW4" title="Bocchi the Rock! — trailer oficial Crunchyroll" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>',
                '<h2>Code Geass</h2>',
                '<p>No calendário imperial de 2017, boa parte do mundo vive sob o Sacro Império Britânnico. O príncipe exilado <strong>Lelouch Lamperouge</strong> recebe de C.C. o Geass — poder de impor a própria vontade. Mecha, trama política e reviravoltas em série: um clássico para quem gosta de estratégia, anti-herói carismático e cliffhangers que ainda geram debate anos depois.</p>',
                '<div class="video-embed"><iframe src="https://www.youtube.com/embed/TvW8Z5fBl0E" title="Code Geass: Lelouch of the Rebellion — trailer" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>',
                '<h2>Erased</h2>',
                '<p>Satoru Fujinuma, mangaká iniciante, carrega um “salto” temporal involuntário que o força a impedir acidentes. Quando vira suspeito de um crime, o mecanismo o devolve à infância — semanas antes do desaparecimento da colega Kayo. Thriller + mistério escolar + viagem no tempo: ritmo curto e gancho imediato para maratonar em um fim de semana.</p>',
                '<div class="video-embed"><iframe src="https://www.youtube.com/embed/dky7my5xd2c" title="Erased — trailer oficial" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>',
                '<h2>Frieren e a jornada para o além</h2>',
                '<p>Depois de derrotar o Rei Demônio, o grupo de heróis se dissolve. Décadas depois, a maga élfica imortal <strong>Frieren</strong> confronta o funeral de um companheiro e redescobre o que deixou de perceber sobre amizade e mortalidade. Fantasia contemplativa, com batalhas pontuais e muita reflexão — um dos fenômenos críticos e de público mais citados da década.</p>',
                '<div class="video-embed"><iframe src="https://www.youtube.com/embed/n6HZo_33YaQ" title="Frieren: Beyond Journey\'s End — trailer oficial Crunchyroll" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>',
                '<h2>Fullmetal Alchemist: Brotherhood</h2>',
                '<p>Os irmãos Elric pagam caro por desafiar a lei da equivalência: Edward perde membros; a alma de Alphonse fica presa a uma armadura. Em busca da Pedra Filosofal, enfrentam Estado corrupto, homúnculos e alianças instáveis. Referência quase obrigatória de shonen — trama fechada, temas adultos e chemistry impecável entre os protagonistas.</p>',
                '<div class="video-embed"><iframe src="https://www.youtube.com/embed/kx0nBaS_q50" title="Fullmetal Alchemist: Brotherhood — trailer oficial" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>',
                '<h2>Gintama</h2>',
                '<p>No Japão ocupado por alienígenas, o samurai sem modo <strong>Gintoki</strong> sobrevive como “faz-tudo” ao lado de um time de desajustados. Comédia absurda, paródias e, quando menos se espera, drama de samurai de verdade. Para quem aguenta humor meta e recompensas emocionais tardias.</p>',
                '<div class="video-embed"><iframe src="https://www.youtube.com/embed/e5x47GIm6Po" title="Gintama — trailer oficial Crunchyroll" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>',
                '<h2>Mob Psycho 100</h2>',
                '<p>Shigeo “Mob” Kageyama é gentil, inexpressivo e absurdamente poderoso. Quer vida normal; quando a emoção chega a 100%, o poder explode. Ação sobrenatural com crítica a ego, culto à força e amadurecimento — do mesmo criador de One Punch Man, com identidade visual própria.</p>',
                '<div class="video-embed"><iframe src="https://www.youtube.com/embed/Ah7lTT-NKMw" title="Mob Psycho 100 III — trailer oficial Crunchyroll" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>',
                '<h2>One Piece</h2>',
                '<p>Monkey D. Luffy quer ser o Rei dos Piratas. Com o corpo elástico da Fruta do Diabo, monta os Chapéus de Palha e atravessa a Grand Line em busca do One Piece. É compromisso de longo prazo: mundo vasto, temas de liberdade e amizade, e um dos maiores fenômenos culturais do mangá/anime.</p>',
                '<div class="video-embed"><iframe src="https://www.youtube.com/embed/1KMcoJBMWE4" title="One Piece — trailer oficial Crunchyroll" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>',
                '<h2>Golden Kamuy</h2>',
                '<p>Sugimoto, o “Imortal” da Guerra Russo-Japonesa, entra na febre do ouro em Hokkaido atrás de um mapa tatuado nas costas de fugitivos. Aventura histórica com humor seco, cultura ainu e suspense de caça ao tesouro — ótimo contraste com shonen mais “padrão”.</p>',
                '<div class="video-embed"><iframe src="https://www.youtube.com/embed/19qiqf9FXWU" title="Golden Kamuy Final Chapter — trailer oficial" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>',
                '<h2>Vinland Saga</h2>',
                '<p>No limiar do primeiro milênio, vikings devastam rotas e vilarejos. Thorfinn, filho de um guerreiro lendário, cresce no campo de batalha em busca da terra prometida de Vinland. É epicidade violenta que evolui para questionamentos sobre vingança, paz e o que significa ser “herói”.</p>',
                '<div class="video-embed"><iframe src="https://www.youtube.com/embed/f8JrZ7Q_p-8" title="Vinland Saga — trailer oficial" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>',
                '<h2>Como usar a lista</h2>',
                '<p>Se você quer <strong>entrada rápida</strong>: comece por <em>Bocchi</em>, <em>Erased</em> ou <em>Mob Psycho 100</em>. Se busca <strong>épico longo</strong>: <em>One Piece</em>, <em>FMA: Brotherhood</em> ou <em>Vinland Saga</em>. Se prefere <strong>tom contemplativo</strong>: <em>Frieren</em>. E se a meta é rir até doer a barriga (com picadas de drama): <em>Gintama</em>.</p>',
                '<p>Disponibilidade e dublagem/legendas variam por catálogo regional — confira na própria Crunchyroll antes de planejar a maratona. A curadoria original e a atualização da lista estão na reportagem do Omelete linkada na fonte desta matéria.</p>'
            ].join('')
        },
        {
            id: '7',
            title: 'Cosplay no Brasil: de hobby de convenção a cadeia da economia criativa',
            subtitle:
                'Ateliês, fotógrafos, makers e marcas transformam a cena em mercado profissional — com eventos lotados e carreira em expansão.',
            excerpt:
                'O cosplay brasileiro deixou de ser só fantasia de fim de semana. Convenções, patrocínios e serviços especializados formam um ecossistema que movimenta economia regional.',
            slug: 'cosplay-brasil-industria-criativa',
            featured_image: 'assets/img/cosplay-evento.jpg',
            image_caption:
                'Personagens e cultura pop em evento — a cena brasileira profissionaliza produção e performance. (Foto: Unsplash / Clark Van Der Beken)',
            published_at: daysAgo(7),
            updated_at: daysAgo(7),
            reading_time: 6,
            category_slug: 'cosplay-eventos',
            author_id: 'a3',
            featured: false,
            status: 'published',
            ai_summary:
                'O cosplay no Brasil deixou de ser só hobby de convenção e passou a integrar uma cadeia da economia criativa, com ateliês, props, fotografia, workshops e patrocínios. Competições e creators profissionalizaram cachets e contratos, enquanto makers locais operam sob encomenda. O ecossistema movimenta hospedagem e serviços nas cidades-sede, com desafios de propriedade intelectual, segurança e inclusão.',
            audio_summary_url: 'assets/audio/articles/cosplay-brasil-industria-criativa/summary.wav',
            audio_full_url: 'assets/audio/articles/cosplay-brasil-industria-criativa/full.wav',
            audio_summary_hash: '699af97ed15fcd79e47e9a844670c097bbc84edcc1026b78bba67b889618dc9e',
            audio_full_hash: '244860475275880fa07769b902a9d94f6828dd3811c0c359da11533cd1d75a88',
            audio_generated_at: '2026-09-18T04:47:39.282Z',
            audio_status: 'ready',
            views: 38900,
            tags: ['Cosplay', 'eventos', 'geek', 'economia criativa'],
            source_name: 'Omelete',
            source_url: 'https://www.omelete.com.br/',
            content: [
                '<p>Quem visita uma grande convenção geek no Brasil hoje encontra muito mais do que filas para autógrafo. Há <strong>ateliês de costura e props</strong>, estúdios fotográficos montados no próprio evento, workshops de maquiagem e stands de marcas que tratam cosplayers como embaixadores de produto.</p>',
                '<p>A profissionalização acelerou na última década. Competições nacionais e regionais criaram calendário, critérios e cachets. Influenciadores de cosplay monetizam com conteúdo, patreon-like e contratos de marca — enquanto makers locais vendem peças sob encomenda com fila de meses.</p>',
                '<h2>Economia que não aparece no “hobby”</h2>',
                '<p>Por trás de uma armadura de EVA há cadeia produtiva: matéria-prima, impressão 3D, transporte, hospedagem e alimentação em cidades-sede de eventos. Prefeituras e centros de convenções já enxergam o segmento como gerador de ocupação hoteleira em fins de semana.</p>',
                '<p>Há desafios: propriedade intelectual de personagens, segurança de materiais inflamáveis em arenas lotadas e a necessidade de inclusão (acessibilidade, diversidade de corpos e combate a assédio).</p>',
                '<h2>O que vem a seguir</h2>',
                '<p>Organizadores apostam em pistas de performance maiores, streams profissionais de campeonatos e parcerias com streaming e games. A cena brasileira, antes vista como “cópia” de circuitos japoneses ou norte-americanos, consolida linguagem própria — com estética, humor e referências locais.</p>',
                '<p>Para o Qualquer Tecla, o cosplay é termômetro da cultura pop em movimento: menos nicho isolado, mais indústria criativa que conecta fãs, tecnologia de fabricação e entretenimento ao vivo.</p>'
            ].join('')
        },
        {
            id: '8',
            title: 'Exoplaneta com assinaturas atmosféricas promissoras entra no radar da astrobiologia',
            subtitle:
                'Observações com telescópios de última geração sugerem composição compatível com discussões sobre habitabilidade — ainda com ressalvas científicas.',
            excerpt:
                'Equipe internacional reporta indícios atmosféricos em um exoplaneta que merecem novas janelas de observação. Os dados são preliminares, mas priorizam o alvo na fila do James Webb e similares.',
            slug: 'exoplaneta-atmosfera-semelhante-terra',
            featured_image: 'assets/img/exoplaneta-espaco.jpg',
            image_caption:
                'Pessoa contemplando o céu noturno — referência visual para a busca por mundos além da Terra. (Foto: Unsplash / Sharad Bhat)',
            published_at: daysAgo(3),
            updated_at: daysAgo(3),
            reading_time: 6,
            category_slug: 'ciencia',
            author_id: 'a2',
            featured: false,
            status: 'published',
            ai_summary:
                'Uma equipe internacional reportou assinaturas químicas atmosféricas em um exoplaneta que elevam sua prioridade em campanhas observacionais, sem afirmar prova de vida. Os dados, ainda preliminares, entram no radar do James Webb e de instrumentos em terra. Os próximos passos incluem novas janelas de observação e cruzamento com simulações climáticas 3D.',
            audio_summary_url: 'assets/audio/articles/exoplaneta-atmosfera-semelhante-terra/summary.wav',
            audio_full_url: 'assets/audio/articles/exoplaneta-atmosfera-semelhante-terra/full.wav',
            audio_summary_hash: 'c63e58dd4e4f79a78ecf7c2917ad477eb5c2ad619bd467665d2f14723e453459',
            audio_full_hash: '2121ef6b77393aef2fec81500303221e193340fbada6acb9c837b8647020fa28',
            audio_generated_at: '2026-09-18T03:48:01.669Z',
            audio_status: 'ready',
            views: 51200,
            tags: ['ciência', 'astronomia', 'exoplanetas', 'espaço'],
            source_name: 'Nature',
            source_url: 'https://www.nature.com/',
            content: [
                '<p>Um alvo fora do Sistema Solar voltou ao noticiário científico após a publicação de dados que sugerem <strong>assinaturas químicas atmosféricas</strong> dignas de acompanhamento. A equipe por trás do estudo reforça o tom cauteloso: não há “prova de vida”, e sim um conjunto de medidas que eleva a prioridade do planeta em campanhas observacionais.</p>',
                '<p>Com o <strong>James Webb Space Telescope</strong> e instrumentos no solo cada vez mais sensíveis, a astrobiologia deixou o território puramente teórico. Hoje discute-se detecção de moléculas, temperatura de equilíbrio e se a atmosfera é estável o bastante para hipóteses pré-bióticas.</p>',
                '<h2>O que os dados mostram — e o que não mostram</h2>',
                '<p>Os espectros obtidos apontam para candidatos moleculares que, em modelos climáticos, podem coexistir com condições de superfície interessantes. Mas ruído instrumental, contaminação estelar e ambiguidades químicas ainda exigem confirmação independente.</p>',
                '<p>Historicamente, anúncios de “oxigênio” ou “fosfina” em atmosferas exoplanetárias geraram entusiasmo prematuro. A comunidade aprendeu a exigir múltiplas épocas de observação e revisão cruzada antes de qualquer headline definitiva.</p>',
                '<h2>Próximos passos</h2>',
                '<p>A colaboração internacional pediu tempo de telescópio adicional e pretende cruzar dados com simulações climáticas 3D. Se os sinais se sustentarem, o alvo sobe na fila de estudos de habitabilidade da próxima década.</p>',
                '<p>Para o público, a mensagem útil é dupla: a ciência está cada vez mais perto de caracterizar atmosferas distantes — e ainda longe de um veredito simples sobre vida em outro mundo.</p>'
            ].join('')
        }
    ];

    const DEFAULT_AUTHOR_BIO = 'Colaborador do Qualquer Tecla.';
    const SEED_AUTHORS_REVISION = 5;
    const AUTHORS_REV_KEY = 'qualquer-tecla_mock_authors_rev';

    function normalizeAuthorSocialLinks(raw) {
        const list = Array.isArray(raw)
            ? raw
            : raw && typeof raw === 'object'
              ? Object.keys(raw).map((key) => ({
                    id: key,
                    url: raw[key],
                    ...(AUTHOR_SOCIAL_PRESET_BY_ID.get(key) || {})
                }))
              : [];
        const seen = new Set();
        const next = [];
        list.forEach((item) => {
            if (!item || typeof item !== 'object') return;
            const id = String(item.id || '')
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9-_]/g, '')
                .slice(0, 40);
            if (!id || seen.has(id)) return;
            const preset = AUTHOR_SOCIAL_PRESET_BY_ID.get(id);
            const url = String(item.url || '').trim();
            if (!url || !isValidSocialUrl(url)) return;
            const label = String(item.label || (preset && preset.label) || id)
                .trim()
                .slice(0, 60);
            let icon = String(item.icon || (preset && preset.icon) || 'ph-link').trim();
            if (!ALLOWED_SOCIAL_ICONS.has(icon)) icon = 'ph-link';
            seen.add(id);
            next.push({ id, label, url, icon });
        });
        // Preserva ordem dos presets conhecidos; extras vão ao final.
        next.sort((a, b) => {
            const ia = AUTHOR_SOCIAL_PRESETS.findIndex((p) => p.id === a.id);
            const ib = AUTHOR_SOCIAL_PRESETS.findIndex((p) => p.id === b.id);
            const ra = ia < 0 ? 999 : ia;
            const rb = ib < 0 ? 999 : ib;
            return ra - rb;
        });
        return next;
    }

    function socialLinksFromAuthorPayload(payload) {
        if (!payload) return [];
        if (Array.isArray(payload.socialLinks) || Array.isArray(payload.social_links)) {
            return normalizeAuthorSocialLinks(payload.socialLinks || payload.social_links);
        }
        // Compat: twitter_handle legado do schema remoto
        const handle = String(payload.twitter_handle || payload.twitterHandle || '').trim();
        if (handle) {
            const cleaned = handle.replace(/^@/, '');
            return normalizeAuthorSocialLinks([
                {
                    id: 'x',
                    label: 'X',
                    icon: 'ph-x-logo',
                    url: cleaned.startsWith('http')
                        ? cleaned
                        : `https://x.com/${cleaned}`
                }
            ]);
        }
        return [];
    }

    function normalizeAuthor(author) {
        if (!author) {
            const fallback = authors[0];
            return {
                id: (fallback && fallback.id) || 'autor',
                name: (fallback && fallback.name) || 'Autor',
                slug: (fallback && fallback.slug) || 'autor',
                avatar: (fallback && fallback.avatar) || DEFAULT_AVATAR,
                bio: (fallback && fallback.bio) || DEFAULT_AUTHOR_BIO,
                socialLinks: socialLinksFromAuthorPayload(fallback)
            };
        }
        return {
            id: author.id,
            name: author.name || 'Autor',
            slug: author.slug || 'autor',
            avatar: author.avatar || DEFAULT_AVATAR,
            bio: String(author.bio || '').trim() || DEFAULT_AUTHOR_BIO,
            socialLinks: socialLinksFromAuthorPayload(author)
        };
    }

    function resolveArticle(article) {
        const found = categories.find((c) => c.slug === article.category_slug);
        const category = found
            ? { name: found.name, slug: found.slug, parent: found.parent || null }
            : {
                  name: article.category_slug
                      ? String(article.category_slug)
                      : 'Sem editoria',
                  slug: article.category_slug || '',
                  parent: null
              };
        const author = normalizeAuthor(
            authors.find((a) => a.id === article.author_id) || authors[0]
        );
        return {
            ...article,
            categories: {
                name: category.name,
                slug: category.slug,
                parent: category.parent
            },
            authors: {
                id: author.id,
                name: author.name,
                slug: author.slug,
                avatar: author.avatar,
                bio: author.bio,
                socialLinks: author.socialLinks
            }
        };
    }

    function publishedArticles() {
        const now = Date.now();
        return articles
            .filter((a) => a.status === 'published' && new Date(a.published_at).getTime() <= now)
            .map(resolveArticle);
    }

    function assetPath(path) {
        if (!path || /^https?:\/\//i.test(path) || path.startsWith('data:')) return path;
        const base = global.SITE_BASE || '';
        return base + path.replace(/^\//, '');
    }

    function slugifyAuthor(name) {
        return String(name || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 60) || 'autor';
    }

    function persistAuthors() {
        try {
            sessionStorage.setItem('qualquer-tecla_mock_authors', JSON.stringify(authors));
            localStorage.setItem('qualquer-tecla_mock_authors', JSON.stringify(authors));
        } catch (_) {
            /* ignore quota */
        }
    }

    function upsertAuthor(payload) {
        const name = String(payload.name || '').trim();
        if (!name) throw new Error('Nome obrigatório');
        let slug = String(payload.slug || slugifyAuthor(name)).trim() || slugifyAuthor(name);
        const id = payload.id || `a-${Date.now()}`;
        const avatar = payload.avatar || DEFAULT_AVATAR;
        const bio = String(payload.bio || '').trim();
        const socialLinks = socialLinksFromAuthorPayload(payload);

        const existingIdx = authors.findIndex((a) => a.id === id);
        const duplicateSlug = authors.some((a) => a.slug === slug && a.id !== id);
        if (duplicateSlug) slug = `${slug}-${id.slice(-4)}`;

        const next = { id, name, slug, avatar, bio, socialLinks, _adminEdited: true };
        if (existingIdx >= 0) authors[existingIdx] = next;
        else authors.push(next);
        try {
            localStorage.setItem(AUTHORS_REV_KEY, String(SEED_AUTHORS_REVISION));
        } catch (_) {
            /* ignore */
        }
        persistAuthors();
        return normalizeAuthor(next);
    }

    function getAuthorById(id) {
        return normalizeAuthor(authors.find((a) => a.id === id) || authors[0]);
    }

    function slugifyCategory(name) {
        return String(name || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 60) || 'categoria';
    }

    function persistCategories() {
        try {
            sessionStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(categories));
            localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(categories));
        } catch (_) {
            /* ignore quota */
        }
    }

    function getStoredTaxonomyVersion() {
        try {
            const raw =
                localStorage.getItem(TAXONOMY_VERSION_KEY) ||
                sessionStorage.getItem(TAXONOMY_VERSION_KEY);
            const n = Number(raw);
            return Number.isFinite(n) ? n : 0;
        } catch (_) {
            return 0;
        }
    }

    function setStoredTaxonomyVersion(version) {
        try {
            const v = String(version);
            localStorage.setItem(TAXONOMY_VERSION_KEY, v);
            sessionStorage.setItem(TAXONOMY_VERSION_KEY, v);
        } catch (_) {
            /* ignore */
        }
    }

    /**
     * Alinha categorias persistidas ao seed atual (v3):
     * remove Negócios/Política/Mundo, garante Cultura Digital, Música
     * e subeditorias de Games (incl. eSports).
     */
    function migrateTaxonomyIfNeeded() {
        const current = getStoredTaxonomyVersion();
        const seedBySlug = new Map(seedCategories.map((c) => [c.slug, { ...c }]));
        let changed = current < TAXONOMY_VERSION;

        const next = [];
        const seen = new Set();

        categories.forEach((raw) => {
            const cat = normalizeCategory(raw);
            if (!cat.slug || seen.has(cat.slug)) return;
            if (REMOVED_CATEGORY_SLUGS.includes(cat.slug)) {
                changed = true;
                return;
            }
            seen.add(cat.slug);
            const seed = seedBySlug.get(cat.slug);
            if (seed && !cat._adminEdited) {
                next.push({ ...seed });
            } else {
                next.push(cat);
            }
        });

        seedCategories.forEach((seed) => {
            if (seen.has(seed.slug)) return;
            seen.add(seed.slug);
            next.push({ ...seed });
            changed = true;
        });

        if (changed || next.length !== categories.length) {
            categories.length = 0;
            next.forEach((c) => categories.push(c));
            persistCategories();
        } else {
            const drifted = next.some((c, i) => {
                const cur = categories[i];
                return (
                    !cur ||
                    cur.slug !== c.slug ||
                    cur.name !== c.name ||
                    cur.description !== c.description ||
                    cur.parent !== c.parent
                );
            });
            if (drifted) {
                categories.length = 0;
                next.forEach((c) => categories.push(c));
                persistCategories();
            }
        }

        let articlesTouched = false;
        articles.forEach((a) => {
            if (a && REMOVED_CATEGORY_SLUGS.includes(a.category_slug)) {
                a.category_slug = REMOVED_CATEGORY_FALLBACK;
                articlesTouched = true;
            }
        });
        if (articlesTouched) persistArticlesSession();

        setStoredTaxonomyVersion(TAXONOMY_VERSION);
    }

    function slugifySocialId(label) {
        return (
            String(label || '')
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-|-$/g, '')
                .slice(0, 40) || 'rede'
        );
    }

    function isValidSocialUrl(url) {
        try {
            const parsed = new URL(String(url || '').trim());
            return parsed.protocol === 'http:' || parsed.protocol === 'https:';
        } catch (_) {
            return false;
        }
    }

    function normalizeSocialLink(raw, fallbackId) {
        if (!raw || typeof raw !== 'object') return null;
        const label = String(raw.label || '').trim().slice(0, 60);
        if (!label) return null;
        let id = String(raw.id || fallbackId || slugifySocialId(label))
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9-_]/g, '')
            .slice(0, 40);
        if (!id) id = slugifySocialId(label);
        const url = String(raw.url || '').trim();
        let icon = String(raw.icon || 'ph-link').trim();
        if (!ALLOWED_SOCIAL_ICONS.has(icon)) icon = 'ph-link';
        return {
            id,
            label,
            url,
            icon,
            enabled: raw.enabled !== false
        };
    }

    function normalizeSocialLinksList(list) {
        if (!Array.isArray(list)) return [];
        const seen = new Set();
        const next = [];
        list.forEach((raw, index) => {
            const item = normalizeSocialLink(raw, `rede-${index + 1}`);
            if (!item || seen.has(item.id)) return;
            seen.add(item.id);
            next.push(item);
        });
        return next;
    }

    function persistSocialLinks() {
        try {
            const json = JSON.stringify(socialLinks);
            sessionStorage.setItem(SOCIAL_LINKS_STORAGE_KEY, json);
            localStorage.setItem(SOCIAL_LINKS_STORAGE_KEY, json);
        } catch (_) {
            /* ignore quota */
        }
    }

    /**
     * Anexa à lista persistida as redes novas do seed, uma única vez por versão.
     * A flag é gravada mesmo sem alteração, para que uma remoção posterior no
     * admin não seja revertida na próxima carga.
     */
    function backfillSeedSocialLinks() {
        try {
            if (localStorage.getItem(SOCIAL_LINKS_SEED_VERSION_KEY) === SOCIAL_LINKS_SEED_VERSION) {
                return;
            }
            const existing = new Set(socialLinks.map((s) => s.id));
            const added = seedSocialLinks.filter(
                (s) => SOCIAL_LINKS_SEED_ADDITIONS.includes(s.id) && !existing.has(s.id)
            );
            if (added.length) {
                socialLinks = socialLinks.concat(added.map((s) => ({ ...s })));
                persistSocialLinks();
            }
            localStorage.setItem(SOCIAL_LINKS_SEED_VERSION_KEY, SOCIAL_LINKS_SEED_VERSION);
        } catch (_) {
            /* ignore quota */
        }
    }

    function getSocialLinks() {
        return socialLinks.map((s) => ({ ...s }));
    }

    function getVisibleSocialLinks() {
        return getSocialLinks().filter((s) => s.enabled && isValidSocialUrl(s.url));
    }

    function saveSocialLinks(list) {
        const next = normalizeSocialLinksList(list);
        socialLinks = next;
        persistSocialLinks();
        return getSocialLinks();
    }

    function upsertSocialLink(payload) {
        const previousId = String(payload.previousId || payload.id || '').trim();
        const normalized = normalizeSocialLink(payload, previousId || undefined);
        if (!normalized) throw new Error('Informe o nome da rede.');
        if (!normalized.url || !isValidSocialUrl(normalized.url)) {
            throw new Error('Informe uma URL válida (http ou https).');
        }

        const existingIdx = previousId
            ? socialLinks.findIndex((s) => s.id === previousId)
            : socialLinks.findIndex((s) => s.id === normalized.id);

        const conflict = socialLinks.some(
            (s, i) => s.id === normalized.id && i !== existingIdx
        );
        if (conflict) {
            normalized.id = `${normalized.id}-${Date.now().toString(36).slice(-4)}`;
        }

        if (existingIdx >= 0) {
            socialLinks[existingIdx] = normalized;
        } else {
            socialLinks.push(normalized);
        }
        persistSocialLinks();
        return { ...normalized };
    }

    function deleteSocialLink(id) {
        const idx = socialLinks.findIndex((s) => s.id === id);
        if (idx < 0) throw new Error('Rede social não encontrada.');
        socialLinks.splice(idx, 1);
        persistSocialLinks();
    }

    function moveSocialLink(id, direction) {
        const idx = socialLinks.findIndex((s) => s.id === id);
        if (idx < 0) throw new Error('Rede social não encontrada.');
        const target = direction === 'up' ? idx - 1 : idx + 1;
        if (target < 0 || target >= socialLinks.length) return getSocialLinks();
        const tmp = socialLinks[idx];
        socialLinks[idx] = socialLinks[target];
        socialLinks[target] = tmp;
        persistSocialLinks();
        return getSocialLinks();
    }

    function setSocialLinkEnabled(id, enabled) {
        const item = socialLinks.find((s) => s.id === id);
        if (!item) throw new Error('Rede social não encontrada.');
        item.enabled = !!enabled;
        persistSocialLinks();
        return { ...item };
    }

    function isValidEmail(email) {
        const value = String(email || '').trim();
        if (!value || value.length > 120) return false;
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    }

    function normalizeSiteSettings(raw) {
        const source = raw && typeof raw === 'object' ? raw : {};
        const siteName = migrateLegacySiteName(
            String(source.siteName || source.site_name || '')
                .trim()
                .slice(0, 80)
        );
        const siteDescription = String(
            source.siteDescription || source.site_description || ''
        )
            .trim()
            .slice(0, 400);
        const contactEmail = String(
            source.contactEmail || source.contact_email || ''
        )
            .trim()
            .slice(0, 120)
            .toLowerCase();
        const supportUrlRaw = String(
            source.supportUrl || source.support_url || ''
        )
            .trim()
            .slice(0, 500);
        const hasSupportUrl =
            Object.prototype.hasOwnProperty.call(source, 'supportUrl') ||
            Object.prototype.hasOwnProperty.call(source, 'support_url');
        const supportEnabledRaw = source.supportEnabled ?? source.support_enabled;
        const supportEnabled =
            supportEnabledRaw === undefined || supportEnabledRaw === null
                ? DEFAULT_SITE_SETTINGS.supportEnabled
                : Boolean(supportEnabledRaw);

        const hasLoginBg =
            Object.prototype.hasOwnProperty.call(source, 'loginBackground') ||
            Object.prototype.hasOwnProperty.call(source, 'login_background');
        const loginBackground = normalizeLoginBackground(
            hasLoginBg
                ? source.loginBackground || source.login_background
                : DEFAULT_LOGIN_BACKGROUND
        );

        return {
            siteName: siteName || DEFAULT_SITE_SETTINGS.siteName,
            siteDescription:
                siteDescription || DEFAULT_SITE_SETTINGS.siteDescription,
            contactEmail: contactEmail || DEFAULT_SITE_SETTINGS.contactEmail,
            supportUrl: hasSupportUrl
                ? supportUrlRaw
                : DEFAULT_SITE_SETTINGS.supportUrl,
            supportEnabled,
            loginBackground
        };
    }

    function persistSiteSettingsIdentity() {
        try {
            const payload = {
                siteName: siteSettings.siteName,
                siteDesc: siteSettings.siteDescription,
                siteDescription: siteSettings.siteDescription,
                contactEmail: siteSettings.contactEmail,
                supportUrl: siteSettings.supportUrl,
                supportEnabled: siteSettings.supportEnabled,
                loginBackground: normalizeLoginBackground(siteSettings.loginBackground)
            };
            const json = JSON.stringify(payload);
            sessionStorage.setItem(SITE_SETTINGS_STORAGE_KEY, json);
            localStorage.setItem(SITE_SETTINGS_STORAGE_KEY, json);
        } catch (_) {
            /* ignore quota */
        }
    }

    function getSiteSettings() {
        return {
            siteName: siteSettings.siteName,
            siteDescription: siteSettings.siteDescription,
            contactEmail: siteSettings.contactEmail,
            supportUrl: siteSettings.supportUrl,
            supportEnabled: siteSettings.supportEnabled !== false,
            loginBackground: normalizeLoginBackground(siteSettings.loginBackground),
            socialLinks: getSocialLinks()
        };
    }

    function saveSiteSettings(payload) {
        const requestedName = String(
            (payload && (payload.siteName || payload.site_name)) || ''
        ).trim();
        if (!requestedName) throw new Error('Informe o nome do site.');

        const requestedEmail = String(
            (payload && (payload.contactEmail || payload.contact_email)) || ''
        )
            .trim()
            .toLowerCase();
        if (!isValidEmail(requestedEmail)) {
            throw new Error('Informe um e-mail válido.');
        }

        const hasSupportUrlKey =
            payload &&
            (Object.prototype.hasOwnProperty.call(payload, 'supportUrl') ||
                Object.prototype.hasOwnProperty.call(payload, 'support_url'));
        const requestedSupportUrl = hasSupportUrlKey
            ? String(payload.supportUrl || payload.support_url || '')
                  .trim()
                  .slice(0, 500)
            : siteSettings.supportUrl;

        const hasSupportEnabledKey =
            payload &&
            (Object.prototype.hasOwnProperty.call(payload, 'supportEnabled') ||
                Object.prototype.hasOwnProperty.call(payload, 'support_enabled'));
        const requestedSupportEnabled = hasSupportEnabledKey
            ? Boolean(
                  payload.supportEnabled ?? payload.support_enabled
              )
            : siteSettings.supportEnabled !== false;

        if (
            requestedSupportEnabled &&
            requestedSupportUrl &&
            !isValidSocialUrl(requestedSupportUrl)
        ) {
            throw new Error('Informe uma URL válida (http ou https) para Me pague um café.');
        }
        if (requestedSupportEnabled && !requestedSupportUrl) {
            throw new Error('Informe a URL do Payment Link ou desative Me pague um café.');
        }

        const hasLoginBgKey =
            payload &&
            (Object.prototype.hasOwnProperty.call(payload, 'loginBackground') ||
                Object.prototype.hasOwnProperty.call(payload, 'login_background'));
        const nextLoginBackground = hasLoginBgKey
            ? normalizeLoginBackground(
                  payload.loginBackground || payload.login_background
              )
            : normalizeLoginBackground(siteSettings.loginBackground);

        siteSettings = {
            siteName: migrateLegacySiteName(requestedName.slice(0, 80)),
            siteDescription: String(
                (payload && (payload.siteDescription || payload.site_description || payload.siteDesc)) ||
                    ''
            )
                .trim()
                .slice(0, 400),
            contactEmail: requestedEmail.slice(0, 120),
            supportUrl: requestedSupportUrl,
            supportEnabled: requestedSupportEnabled,
            loginBackground: nextLoginBackground
        };

        persistSiteSettingsIdentity();

        if (payload && Array.isArray(payload.socialLinks)) {
            saveSocialLinks(payload.socialLinks);
        }

        return getSiteSettings();
    }

    function persistArticlesSession() {
        try {
            sessionStorage.setItem('qualquer-tecla_mock_articles', JSON.stringify(articles));
        } catch (_) {
            /* ignore */
        }
    }

    function normalizeCategory(cat) {
        if (!cat || !cat.slug) {
            return { slug: 'tech', name: 'Tech', description: '', parent: null };
        }
        return {
            slug: String(cat.slug),
            name: String(cat.name || cat.slug),
            description: String(cat.description || ''),
            parent: cat.parent ? String(cat.parent) : null,
            _adminEdited: cat._adminEdited === true
        };
    }

    function upsertCategory(payload) {
        const name = String(payload.name || '').trim();
        if (!name) throw new Error('Nome obrigatório');

        const previousSlug = String(payload.previousSlug || '').trim();
        let slug = String(payload.slug || slugifyCategory(name)).trim() || slugifyCategory(name);
        slug = slugifyCategory(slug);

        const description = String(payload.description || '').trim();
        let parent = String(payload.parent || '').trim() || null;
        if (parent === slug) parent = null;
        if (parent && !categories.some((c) => c.slug === parent)) {
            parent = null;
        }

        const existingIdx = previousSlug
            ? categories.findIndex((c) => c.slug === previousSlug)
            : -1;

        const conflict = categories.some((c, i) => c.slug === slug && i !== existingIdx);
        if (conflict) {
            throw new Error('Já existe uma categoria com este slug.');
        }

        const next = normalizeCategory({
            slug,
            name,
            description,
            parent,
            _adminEdited: true
        });

        if (existingIdx >= 0) {
            const oldSlug = categories[existingIdx].slug;
            categories[existingIdx] = next;
            if (oldSlug !== slug) {
                let articlesTouched = false;
                articles.forEach((a) => {
                    if (a.category_slug === oldSlug) {
                        a.category_slug = slug;
                        articlesTouched = true;
                    }
                });
                categories.forEach((c) => {
                    if (c.parent === oldSlug) c.parent = slug;
                });
                if (articlesTouched) persistArticlesSession();
            }
        } else {
            categories.push(next);
        }

        persistCategories();
        return next;
    }

    function deleteCategory(slug) {
        const key = String(slug || '').trim();
        if (!key) throw new Error('Categoria inválida');

        const idx = categories.findIndex((c) => c.slug === key);
        if (idx < 0) throw new Error('Categoria não encontrada');

        const usedBy = articles.filter((a) => a.category_slug === key);
        if (usedBy.length) {
            throw new Error(
                `Não é possível excluir: ${usedBy.length} matéria(s) usam esta categoria. Reatribua-as antes.`
            );
        }

        const children = categories.filter((c) => c.parent === key);
        if (children.length) {
            throw new Error(
                `Não é possível excluir: há ${children.length} subcategoria(s). Remova ou reatribua o grupo antes.`
            );
        }

        categories.splice(idx, 1);
        persistCategories();
        return true;
    }

    function getCategoryBySlug(slug) {
        const key = String(slug || '').trim();
        if (!key) return null;
        const found = categories.find((c) => c.slug === key);
        return found ? normalizeCategory(found) : null;
    }

    const seedArticles = articles.map((a) => ({ ...a }));

    // Sessão do admin: matérias novas + edições marcadas (_adminEdited) persistem;
    // seeds do arquivo vencem quando não houver edição admin correspondente.
    try {
        const saved = sessionStorage.getItem('qualquer-tecla_mock_articles');
        if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length) {
                const byId = new Map(parsed.map((a) => [String(a.id), a]));
                articles.length = 0;
                seedArticles.forEach((seed) => {
                    const savedArticle = byId.get(String(seed.id));
                    if (savedArticle && savedArticle._adminEdited) {
                        const merged = { ...seed, ...savedArticle, id: seed.id };
                        // Não permitir edição admin vazia apagar título/corpo do seed.
                        if (!String(merged.title || '').trim()) {
                            merged.title = seed.title;
                        }
                        if (!String(merged.slug || '').trim()) {
                            merged.slug = seed.slug;
                        }
                        const mdBody = String(merged.content_markdown || '').trim();
                        const htmlBody = String(merged.content || '').trim();
                        if (!mdBody) {
                            // Markdown oco ('' / whitespace) não pode mascarar o HTML do seed.
                            delete merged.content_markdown;
                            if (!htmlBody) {
                                merged.content = seed.content;
                            }
                            if (seed.content_markdown) {
                                merged.content_markdown = seed.content_markdown;
                            }
                        } else if (!htmlBody) {
                            merged.content = seed.content;
                        }
                        articles.push(merged);
                    } else {
                        articles.push({ ...seed });
                    }
                    byId.delete(String(seed.id));
                });
                byId.forEach((a) => {
                    if (a && a.slug) articles.push(a);
                });
            }
        }
    } catch (_) {
        /* ignore JSON inválido / sessionStorage indisponível */
    }

    // Autores editados no admin (_adminEdited) persistem; seeds do arquivo vencem nos demais casos.
    try {
        const savedAuthors =
            localStorage.getItem('qualquer-tecla_mock_authors') ||
            sessionStorage.getItem('qualquer-tecla_mock_authors');
        const storedRev = parseInt(localStorage.getItem(AUTHORS_REV_KEY) || '0', 10);
        const seedRevChanged = storedRev < SEED_AUTHORS_REVISION;
        let parsedSaved = [];

        if (savedAuthors) {
            const parsed = JSON.parse(savedAuthors);
            if (Array.isArray(parsed) && parsed.length) {
                parsedSaved = parsed;
                const byId = new Map(parsed.map((a) => [String(a.id), a]));
                authors.forEach((a, i) => {
                    const saved = byId.get(String(a.id));
                    if (!saved) return;
                    // Seed IDs always leave the map so they are never pushed again as duplicates.
                    byId.delete(String(a.id));
                    if (saved._adminEdited === true) {
                        authors[i] = {
                            id: a.id,
                            name: saved.name || a.name,
                            slug: saved.slug || a.slug,
                            avatar: saved.avatar || a.avatar || DEFAULT_AVATAR,
                            bio:
                                saved.bio !== undefined && saved.bio !== null
                                    ? String(saved.bio)
                                    : a.bio || '',
                            socialLinks: socialLinksFromAuthorPayload(saved),
                            _adminEdited: true
                        };
                    }
                });
                byId.forEach((a) => {
                    if (
                        !a ||
                        a.id === 'a1' ||
                        a.slug === 'redacao' ||
                        String(a.name || '').toLowerCase().includes('redação qualquer-tecla')
                    ) {
                        return;
                    }
                    const id = String(a.id || '');
                    const slug = String(a.slug || slugifyAuthor(a.name) || '');
                    if (
                        authors.some(
                            (existing) =>
                                String(existing.id) === id ||
                                (slug && String(existing.slug) === slug)
                        )
                    ) {
                        return;
                    }
                    authors.push({
                        id: a.id || `a-${Date.now()}`,
                        name: a.name || 'Autor',
                        slug: a.slug || slugifyAuthor(a.name),
                        avatar: a.avatar || DEFAULT_AVATAR,
                        bio: a.bio || '',
                        socialLinks: socialLinksFromAuthorPayload(a),
                        _adminEdited: a._adminEdited === true
                    });
                });
            }
        }

        if (seedRevChanged) {
            const savedById = new Map(parsedSaved.map((a) => [String(a.id), a]));
            seedAuthors.forEach((seed) => {
                const saved = savedById.get(String(seed.id));
                const idx = authors.findIndex((a) => a.id === seed.id);
                if (idx < 0) return;
                if (saved && saved._adminEdited === true) {
                    // Preenche redes do seed se o autor editado ainda não tiver nenhuma.
                    const existingSocials = socialLinksFromAuthorPayload(authors[idx]);
                    if (!existingSocials.length && seed.socialLinks && seed.socialLinks.length) {
                        authors[idx] = {
                            ...authors[idx],
                            socialLinks: seed.socialLinks.map((s) => ({ ...s }))
                        };
                    }
                    return;
                }
                authors[idx] = {
                    ...seed,
                    socialLinks: Array.isArray(seed.socialLinks)
                        ? seed.socialLinks.map((s) => ({ ...s }))
                        : []
                };
            });
            try {
                localStorage.setItem(AUTHORS_REV_KEY, String(SEED_AUTHORS_REVISION));
            } catch (_) {
                /* ignore */
            }
            persistAuthors();
        }
    } catch (_) {
        /* ignore */
    }

    // Remove autor descontinuado (Redação)
    for (let i = authors.length - 1; i >= 0; i--) {
        if (authors[i].id === 'a1' || authors[i].slug === 'redacao') {
            authors.splice(i, 1);
        }
    }

    // Dedupa por id (e slug) — limpa cópias geradas por hidratação antiga
    {
        const seenIds = new Set();
        const seenSlugs = new Set();
        const unique = [];
        let removedDupes = false;
        authors.forEach((a) => {
            const id = String(a.id || '');
            const slug = String(a.slug || '');
            if ((id && seenIds.has(id)) || (slug && seenSlugs.has(slug))) {
                removedDupes = true;
                return;
            }
            if (id) seenIds.add(id);
            if (slug) seenSlugs.add(slug);
            unique.push(a);
        });
        if (removedDupes) {
            authors.length = 0;
            unique.forEach((a) => authors.push(a));
            persistAuthors();
        }
    }

    // Categorias: lista persistida no admin substitui o seed
    try {
        const savedCategories =
            localStorage.getItem(CATEGORIES_STORAGE_KEY) ||
            sessionStorage.getItem(CATEGORIES_STORAGE_KEY);
        if (savedCategories) {
            const parsed = JSON.parse(savedCategories);
            if (Array.isArray(parsed) && parsed.length) {
                const seen = new Set();
                const next = [];
                parsed.forEach((raw) => {
                    const cat = normalizeCategory(raw);
                    if (!cat.slug || seen.has(cat.slug)) return;
                    seen.add(cat.slug);
                    next.push(cat);
                });
                if (next.length) {
                    categories.length = 0;
                    next.forEach((c) => categories.push(c));
                }
            }
        }
    } catch (_) {
        /* ignore */
    }

    // Redes sociais: lista persistida no admin substitui o seed
    try {
        const savedSocial =
            localStorage.getItem(SOCIAL_LINKS_STORAGE_KEY) ||
            sessionStorage.getItem(SOCIAL_LINKS_STORAGE_KEY);
        if (savedSocial) {
            const parsed = JSON.parse(savedSocial);
            const next = normalizeSocialLinksList(parsed);
            if (next.length) {
                socialLinks = next;
                backfillSeedSocialLinks();
            }
        }
    } catch (_) {
        /* ignore */
    }

    // Identidade do site: nome, descrição e e-mail
    let loadedLegacySiteName = false;
    try {
        const savedSettings =
            localStorage.getItem(SITE_SETTINGS_STORAGE_KEY) ||
            sessionStorage.getItem(SITE_SETTINGS_STORAGE_KEY);
        if (savedSettings) {
            const parsed = JSON.parse(savedSettings);
            if (parsed && typeof parsed === 'object') {
                const previousName = String(parsed.siteName || '').trim();
                const normalizedName = migrateLegacySiteName(previousName);
                loadedLegacySiteName = normalizedName !== previousName;
                siteSettings = normalizeSiteSettings({
                    ...parsed,
                    siteDescription: parsed.siteDescription || parsed.siteDesc
                });
            }
        }
    } catch (_) {
        /* ignore */
    }

    /* Migra slogan institucional legado → novo posicionamento. */
    const LEGACY_SITE_DESCRIPTIONS = new Set([
        'Portal de Notícias Premium',
        'Portal de Noticias Premium',
        'Portal de Notícias',
        'Portal de Noticias',
        'Tudo o que você quer saber, em qualquer tecla.'
    ]);
    const needsSiteIdentityPersist =
        loadedLegacySiteName ||
        LEGACY_SITE_DESCRIPTIONS.has(String(siteSettings.siteDescription || '').trim());
    if (needsSiteIdentityPersist) {
        siteSettings = {
            ...siteSettings,
            siteName: loadedLegacySiteName
                ? migrateLegacySiteName(siteSettings.siteName)
                : siteSettings.siteName,
            siteDescription: LEGACY_SITE_DESCRIPTIONS.has(
                String(siteSettings.siteDescription || '').trim()
            )
                ? DEFAULT_SITE_SETTINGS.siteDescription
                : siteSettings.siteDescription
        };
        persistSiteSettingsIdentity();
    }

    // Remove matérias descontinuadas
    for (let i = articles.length - 1; i >= 0; i--) {
        if (
            articles[i].id === '2' ||
            articles[i].id === '3' ||
            articles[i].id === '6' ||
            articles[i].slug === 'nova-era-ia-2027' ||
            articles[i].slug === 'ps6-vazamento-especificacoes' ||
            articles[i].slug === 'regulacao-plataformas-brasil-2026' ||
            articles[i].slug === 'novo-rpg-fantasia-redefine-genero'
        ) {
            articles.splice(i, 1);
        }
    }

    migrateTaxonomyIfNeeded();

    global.MockData = {
        categories,
        authors,
        articles,
        publishedArticles,
        resolveArticle,
        assetPath,
        normalizeAuthor,
        upsertAuthor,
        getAuthorById,
        slugifyAuthor,
        normalizeCategory,
        upsertCategory,
        deleteCategory,
        getCategoryBySlug,
        slugifyCategory,
        SOCIAL_ICON_OPTIONS,
        ALLOWED_SOCIAL_ICONS,
        AUTHOR_SOCIAL_PRESETS,
        normalizeAuthorSocialLinks,
        socialLinksFromAuthorPayload,
        getSocialLinks,
        getVisibleSocialLinks,
        saveSocialLinks,
        upsertSocialLink,
        deleteSocialLink,
        moveSocialLink,
        setSocialLinkEnabled,
        normalizeSocialLink,
        normalizeSocialLinksList,
        isValidSocialUrl,
        slugifySocialId,
        DEFAULT_SITE_SETTINGS,
        DEFAULT_LOGIN_BACKGROUND,
        DEFAULT_LOGIN_BG_IMAGE_URL,
        getSiteSettings,
        saveSiteSettings,
        normalizeSiteSettings,
        normalizeLoginBackground,
        isValidEmail,
        PLACEHOLDER_IMG,
        DEFAULT_AVATAR,
        DEFAULT_AUTHOR_BIO
    };
})(window);
