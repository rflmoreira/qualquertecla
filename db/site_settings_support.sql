-- Migração isolada: Me pague um café (Payment Link) em site_settings
-- Execute no SQL Editor do Supabase se o schema base já estiver aplicado.

ALTER TABLE site_settings
    ADD COLUMN IF NOT EXISTS support_url TEXT DEFAULT 'https://buy.stripe.com/qualquer-tecla';

ALTER TABLE site_settings
    ADD COLUMN IF NOT EXISTS support_enabled BOOLEAN DEFAULT true;

UPDATE site_settings
SET
    support_url = COALESCE(
        NULLIF(TRIM(support_url), ''),
        'https://buy.stripe.com/qualquer-tecla'
    ),
    support_enabled = COALESCE(support_enabled, true)
WHERE id = 1;
