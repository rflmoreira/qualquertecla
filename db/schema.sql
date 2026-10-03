-- Estrutura de Banco de Dados: Qualquer Tecla
-- Para ser executado no SQL Editor do Supabase

-- 1. Habilitar extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Criação de Tabelas

-- Autores
CREATE TABLE authors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    bio TEXT,
    avatar_url TEXT,
    twitter_handle TEXT,
    social_links JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Categorias
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    color TEXT,
    parent_slug TEXT REFERENCES categories(slug) CHECK (slug != parent_slug),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);


-- Tags
CREATE TABLE tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT UNIQUE NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Notícias (Articles)
CREATE TABLE articles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    subtitle TEXT,
    slug TEXT UNIQUE NOT NULL,
    content TEXT NOT NULL,
    excerpt TEXT,
    category_id UUID NOT NULL REFERENCES categories(id),
    author_id UUID NOT NULL REFERENCES authors(id),
    featured_image TEXT,
    image_caption TEXT,
    source_name TEXT,
    source_url TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'published', 'archived')),
    featured BOOLEAN DEFAULT FALSE,
    published_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    seo_title TEXT,
    seo_description TEXT,
    ai_summary TEXT,
    reading_time INTEGER DEFAULT 5,
    views INTEGER DEFAULT 0
);

-- Relacionamento N:N entre Articles e Tags
CREATE TABLE article_tags (
    article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (article_id, tag_id)
);

-- Configurações do Site
CREATE TABLE site_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    site_name TEXT DEFAULT 'QUALQUER TECLA',
    site_description TEXT,
    contact_email TEXT DEFAULT 'redacao@qualquertecla.com.br',
    support_url TEXT DEFAULT 'https://buy.stripe.com/qualquer-tecla',
    support_enabled BOOLEAN DEFAULT true,
    -- Array ordenado: [{ id, label, url, icon, enabled }, ...]
    social_links JSONB DEFAULT '[]'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Inserir o registro único de configurações (redes padrão do portal)
INSERT INTO site_settings (id, site_name, site_description, contact_email, support_url, support_enabled, social_links) VALUES (
    1,
    'QUALQUER TECLA',
    'Onde tecnologia e cultura se encontram.',
    'redacao@qualquertecla.com.br',
    'https://buy.stripe.com/qualquer-tecla',
    true,
    '[
      {"id":"twitch","label":"Twitch","url":"https://www.twitch.tv","icon":"ph-twitch-logo","enabled":true},
      {"id":"youtube","label":"YouTube","url":"https://www.youtube.com","icon":"ph-youtube-logo","enabled":true},
      {"id":"facebook","label":"Facebook","url":"https://www.facebook.com","icon":"ph-facebook-logo","enabled":true},
      {"id":"instagram","label":"Instagram","url":"https://www.instagram.com","icon":"ph-instagram-logo","enabled":true},
      {"id":"x","label":"X","url":"https://x.com","icon":"ph-x-logo","enabled":true},
      {"id":"spotify","label":"Spotify","url":"https://open.spotify.com","icon":"ph-spotify-logo","enabled":true}
    ]'::jsonb
);

-- 3. Row Level Security (RLS)

-- Habilitar RLS em todas as tabelas
ALTER TABLE authors ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;

-- Políticas de Leitura (SELECT)
-- O público pode ler categorias, autores, tags e configurações
CREATE POLICY "Public profiles are viewable by everyone." ON authors FOR SELECT USING (true);
CREATE POLICY "Categories are viewable by everyone." ON categories FOR SELECT USING (true);
CREATE POLICY "Tags are viewable by everyone." ON tags FOR SELECT USING (true);
CREATE POLICY "Site settings are viewable by everyone." ON site_settings FOR SELECT USING (true);
CREATE POLICY "Article tags are viewable by everyone." ON article_tags FOR SELECT USING (true);

-- O público só pode ler artigos publicados
CREATE POLICY "Published articles are viewable by everyone." ON articles FOR SELECT
USING (status = 'published' AND published_at <= NOW());

-- Administradores (usuários autenticados) podem ver TODOS os artigos
CREATE POLICY "Admins can view all articles" ON articles FOR SELECT TO authenticated USING (true);

-- Políticas de Escrita (INSERT, UPDATE, DELETE)
-- Apenas usuários autenticados (Admin) podem modificar dados
CREATE POLICY "Admins can insert authors" ON authors FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admins can update authors" ON authors FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Admins can delete authors" ON authors FOR DELETE TO authenticated USING (true);

CREATE POLICY "Admins can insert categories" ON categories FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admins can update categories" ON categories FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Admins can delete categories" ON categories FOR DELETE TO authenticated USING (true);

CREATE POLICY "Admins can insert articles" ON articles FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admins can update articles" ON articles FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Admins can delete articles" ON articles FOR DELETE TO authenticated USING (true);

CREATE POLICY "Admins can insert article tags" ON article_tags FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admins can delete article tags" ON article_tags FOR DELETE TO authenticated USING (true);

CREATE POLICY "Admins can update site settings" ON site_settings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- 4. Função para atualizar "updated_at" automaticamente
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_articles_modtime
    BEFORE UPDATE ON articles
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_column();

CREATE TRIGGER update_site_settings_modtime
    BEFORE UPDATE ON site_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_column();

-- 5. Storage Buckets (Criar via UI do Supabase, mas aqui as políticas)
-- Você precisará criar um bucket chamado "media" no painel do Supabase.
-- Abaixo estão as políticas recomendadas para o bucket "media" após sua criação:

-- Política de leitura: público pode ver os arquivos
-- CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING (bucket_id = 'media');

-- Políticas de escrita: apenas autenticados podem enviar e deletar
-- CREATE POLICY "Admin Insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'media');
-- CREATE POLICY "Admin Update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'media');
-- CREATE POLICY "Admin Delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'media');

-- ---------------------------------------------------------------------------
-- 6. Reações de artigos — ver também db/article_reactions.sql (migração isolada)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS article_reactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    article_slug TEXT NOT NULL,
    article_id UUID REFERENCES articles(id) ON DELETE SET NULL,
    reaction TEXT NOT NULL CHECK (reaction IN ('ace', 'love', 'urgh', 'omg', 'lol')),
    device_id TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT article_reactions_slug_len CHECK (char_length(article_slug) BETWEEN 1 AND 200),
    CONSTRAINT article_reactions_device_len CHECK (char_length(device_id) BETWEEN 8 AND 128),
    CONSTRAINT article_reactions_unique_device UNIQUE (article_slug, device_id)
);

CREATE INDEX IF NOT EXISTS idx_article_reactions_slug ON article_reactions (article_slug);
CREATE INDEX IF NOT EXISTS idx_article_reactions_reaction ON article_reactions (reaction);
CREATE INDEX IF NOT EXISTS idx_article_reactions_created_at ON article_reactions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_article_reactions_slug_reaction ON article_reactions (article_slug, reaction);

ALTER TABLE article_reactions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.get_article_reaction_counts(p_slug TEXT)
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(
        (
            SELECT json_object_agg(reaction, cnt)
            FROM (
                SELECT reaction, COUNT(*)::int AS cnt
                FROM article_reactions
                WHERE article_slug = p_slug
                GROUP BY reaction
            ) s
        ),
        '{}'::json
    );
$$;

CREATE OR REPLACE FUNCTION public.get_my_article_reaction(p_slug TEXT, p_device_id TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT reaction
    FROM article_reactions
    WHERE article_slug = p_slug
      AND device_id = p_device_id
    LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_reaction_metrics(
    p_from TIMESTAMPTZ DEFAULT NULL,
    p_to TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    result JSON;
BEGIN
    WITH filtered AS (
        SELECT *
        FROM article_reactions
        WHERE (p_from IS NULL OR created_at >= p_from)
          AND (p_to IS NULL OR created_at <= p_to)
    ),
    by_reaction AS (
        SELECT reaction, COUNT(*)::int AS cnt
        FROM filtered
        GROUP BY reaction
    ),
    by_article AS (
        SELECT
            article_slug,
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE reaction = 'ace')::int AS ace,
            COUNT(*) FILTER (WHERE reaction = 'love')::int AS love,
            COUNT(*) FILTER (WHERE reaction = 'urgh')::int AS urgh,
            COUNT(*) FILTER (WHERE reaction = 'omg')::int AS omg,
            COUNT(*) FILTER (WHERE reaction = 'lol')::int AS lol
        FROM filtered
        GROUP BY article_slug
    ),
    totals AS (
        SELECT
            COALESCE(SUM(cnt), 0)::int AS total,
            COALESCE(SUM(cnt) FILTER (WHERE reaction = 'ace'), 0)::int AS ace,
            COALESCE(SUM(cnt) FILTER (WHERE reaction = 'love'), 0)::int AS love,
            COALESCE(SUM(cnt) FILTER (WHERE reaction = 'urgh'), 0)::int AS urgh,
            COALESCE(SUM(cnt) FILTER (WHERE reaction = 'omg'), 0)::int AS omg,
            COALESCE(SUM(cnt) FILTER (WHERE reaction = 'lol'), 0)::int AS lol
        FROM by_reaction
    ),
    top_reaction AS (
        SELECT reaction
        FROM by_reaction
        ORDER BY cnt DESC, reaction ASC
        LIMIT 1
    )
    SELECT json_build_object(
        'total', (SELECT total FROM totals),
        'counts', json_build_object(
            'ace', (SELECT ace FROM totals),
            'love', (SELECT love FROM totals),
            'urgh', (SELECT urgh FROM totals),
            'omg', (SELECT omg FROM totals),
            'lol', (SELECT lol FROM totals)
        ),
        'top_reaction', (SELECT reaction FROM top_reaction),
        'articles', COALESCE(
            (
                SELECT json_agg(row_to_json(a) ORDER BY a.total DESC, a.article_slug ASC)
                FROM by_article a
            ),
            '[]'::json
        )
    )
    INTO result;

    RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_article_reaction_counts(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_article_reaction(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_reaction_metrics(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_article_reaction_counts(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_article_reaction(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_reaction_metrics(TIMESTAMPTZ, TIMESTAMPTZ) TO anon, authenticated;

DROP POLICY IF EXISTS "Public can insert article reactions" ON article_reactions;
CREATE POLICY "Public can insert article reactions"
    ON article_reactions
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (
        reaction IN ('ace', 'love', 'urgh', 'omg', 'lol')
        AND char_length(device_id) BETWEEN 8 AND 128
        AND char_length(article_slug) BETWEEN 1 AND 200
    );

DROP POLICY IF EXISTS "Authenticated can read article reactions" ON article_reactions;
CREATE POLICY "Authenticated can read article reactions"
    ON article_reactions
    FOR SELECT
    TO authenticated
    USING (true);

-- ---------------------------------------------------------------------------
-- 7. Newsletter — ver também db/newsletter_subscribers.sql (migração isolada)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'unsubscribed')),
    source TEXT NOT NULL DEFAULT 'site'
        CHECK (char_length(source) BETWEEN 1 AND 40),
    subscribed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    unsubscribed_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT newsletter_subscribers_email_format
        CHECK (email ~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$'),
    CONSTRAINT newsletter_subscribers_email_len
        CHECK (char_length(email) BETWEEN 5 AND 120),
    CONSTRAINT newsletter_subscribers_email_unique UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_status
    ON newsletter_subscribers (status);
CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_subscribed_at
    ON newsletter_subscribers (subscribed_at DESC);

ALTER TABLE newsletter_subscribers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read newsletter subscribers" ON newsletter_subscribers;
CREATE POLICY "Authenticated can read newsletter subscribers"
    ON newsletter_subscribers
    FOR SELECT
    TO authenticated
    USING (true);

CREATE OR REPLACE FUNCTION public.subscribe_newsletter(p_email TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    normalized TEXT;
    existing newsletter_subscribers%ROWTYPE;
BEGIN
    normalized := lower(trim(p_email));

    IF normalized IS NULL
       OR char_length(normalized) < 5
       OR char_length(normalized) > 120
       OR normalized !~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$'
    THEN
        RETURN json_build_object(
            'ok', false,
            'status', 'invalid_email',
            'message', 'Informe um e-mail válido.'
        );
    END IF;

    SELECT * INTO existing
    FROM newsletter_subscribers
    WHERE email = normalized
    LIMIT 1;

    IF FOUND THEN
        IF existing.status = 'active' THEN
            RETURN json_build_object(
                'ok', true,
                'status', 'already',
                'email', normalized,
                'subscribed_at', existing.subscribed_at
            );
        END IF;

        UPDATE newsletter_subscribers
        SET status = 'active',
            subscribed_at = NOW(),
            unsubscribed_at = NULL,
            source = 'site'
        WHERE email = normalized
        RETURNING * INTO existing;

        RETURN json_build_object(
            'ok', true,
            'status', 'subscribed',
            'email', normalized,
            'subscribed_at', existing.subscribed_at
        );
    END IF;

    INSERT INTO newsletter_subscribers (email, status, source)
    VALUES (normalized, 'active', 'site')
    RETURNING * INTO existing;

    RETURN json_build_object(
        'ok', true,
        'status', 'subscribed',
        'email', normalized,
        'subscribed_at', existing.subscribed_at
    );
END;
$$;

REVOKE ALL ON FUNCTION public.subscribe_newsletter(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.subscribe_newsletter(TEXT) TO anon, authenticated;
