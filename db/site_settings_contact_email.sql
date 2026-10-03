-- Migração isolada: e-mail principal em site_settings
-- Execute no SQL Editor do Supabase se o schema base já estiver aplicado.

ALTER TABLE site_settings
    ADD COLUMN IF NOT EXISTS contact_email TEXT DEFAULT 'redacao@qualquertecla.com.br';

UPDATE site_settings
SET contact_email = COALESCE(NULLIF(TRIM(contact_email), ''), 'redacao@qualquertecla.com.br')
WHERE id = 1;
