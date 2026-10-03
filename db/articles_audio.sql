-- Migração isolada: áudios de narração (resumo + matéria completa) em articles
-- Execute no SQL Editor do Supabase se o schema base já estiver aplicado.
-- Não ativa SUPABASE_READY no frontend.

ALTER TABLE articles
    ADD COLUMN IF NOT EXISTS audio_summary_url TEXT,
    ADD COLUMN IF NOT EXISTS audio_full_url TEXT,
    ADD COLUMN IF NOT EXISTS audio_summary_hash TEXT,
    ADD COLUMN IF NOT EXISTS audio_full_hash TEXT,
    ADD COLUMN IF NOT EXISTS audio_generated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS audio_status TEXT;

COMMENT ON COLUMN articles.audio_summary_url IS 'URL pública do WAV do resumo (pré-gerado na publicação)';
COMMENT ON COLUMN articles.audio_full_url IS 'URL pública do WAV da leitura completa (pré-gerado na publicação)';
COMMENT ON COLUMN articles.audio_status IS 'ready | missing';
