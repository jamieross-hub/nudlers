-- Migration: Generic AI provider settings (OpenAI-compatible)
-- Replaces gemini-specific settings with provider-agnostic ones.
-- Default provider is OpenRouter; users can swap to any OpenAI-compatible API.

-- ai_base_url: provider endpoint (defaults to OpenRouter)
INSERT INTO app_settings (key, value, description)
VALUES (
    'ai_base_url',
    '"https://openrouter.ai/api/v1"',
    'Base URL of an OpenAI-compatible AI provider (default: OpenRouter)'
)
ON CONFLICT (key) DO NOTHING;

-- ai_api_key: copy from gemini_api_key if set, else empty
INSERT INTO app_settings (key, value, description)
SELECT
    'ai_api_key',
    COALESCE(
        (SELECT value FROM app_settings WHERE key = 'gemini_api_key'),
        '""'::jsonb
    ),
    'API key (Bearer token) for the configured AI provider'
ON CONFLICT (key) DO NOTHING;

-- ai_model: prefix legacy gemini-* model names with "google/" for OpenRouter,
-- otherwise default to google/gemini-2.5-flash
INSERT INTO app_settings (key, value, description)
SELECT
    'ai_model',
    COALESCE(
        (SELECT
            CASE
                WHEN trim(both '"' from value::text) LIKE 'gemini-%'
                    THEN to_jsonb('google/' || trim(both '"' from value::text))
                ELSE value
            END
         FROM app_settings WHERE key = 'gemini_model'),
        '"google/gemini-2.5-flash"'::jsonb
    ),
    'Model identifier (provider-specific slug, e.g. google/gemini-2.5-flash, openai/gpt-4o-mini)'
ON CONFLICT (key) DO NOTHING;

-- ai_extra_headers: optional JSON object of additional headers
-- (e.g. OpenRouter recommends HTTP-Referer and X-Title)
INSERT INTO app_settings (key, value, description)
VALUES (
    'ai_extra_headers',
    '{}'::jsonb,
    'Optional JSON object of extra HTTP headers sent on every AI request'
)
ON CONFLICT (key) DO NOTHING;
