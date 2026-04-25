import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getAIConfig, mapAIError } from '../utils/aiClient.js';
import { getDB } from '../pages/api/db.js';

vi.mock('../pages/api/db.js', () => ({
    getDB: vi.fn(),
}));

vi.mock('../utils/logger.js', () => ({
    default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));

describe('aiClient.getAIConfig', () => {
    let mockClient: any;
    const savedEnv = { ...process.env };

    beforeEach(() => {
        mockClient = { query: vi.fn(), release: vi.fn() };
        (getDB as any).mockResolvedValue(mockClient);
        delete process.env.AI_BASE_URL;
        delete process.env.AI_API_KEY;
        delete process.env.AI_MODEL;
        delete process.env.GEMINI_API_KEY;
    });

    afterEach(() => {
        process.env = { ...savedEnv };
    });

    function settingsRows(map: Record<string, string | object>) {
        return {
            rows: Object.entries(map).map(([key, value]) => ({ key, value }))
        };
    }

    it('uses defaults when no settings or env are configured', async () => {
        mockClient.query.mockResolvedValueOnce({ rows: [] });

        const config = await getAIConfig();

        expect(config.baseURL).toBe('https://openrouter.ai/api/v1');
        expect(config.model).toBe('google/gemini-2.5-flash');
        expect(config.apiKey).toBeUndefined();
        expect(config.extraHeaders).toEqual({});
        expect(mockClient.release).toHaveBeenCalledTimes(1);
    });

    it('prefers app_settings over env vars', async () => {
        process.env.AI_API_KEY = 'env-key';
        process.env.AI_MODEL = 'env-model';
        mockClient.query.mockResolvedValueOnce(settingsRows({
            ai_base_url: '"https://custom.example.com/v1"',
            ai_api_key: '"db-key"',
            ai_model: '"openai/gpt-4o-mini"'
        }));

        const config = await getAIConfig();

        expect(config.baseURL).toBe('https://custom.example.com/v1');
        expect(config.apiKey).toBe('db-key');
        expect(config.model).toBe('openai/gpt-4o-mini');
    });

    it('falls back to env vars when settings are absent', async () => {
        process.env.AI_BASE_URL = 'https://env.example.com/v1';
        process.env.AI_API_KEY = 'env-key';
        process.env.AI_MODEL = 'groq/llama-3-70b';
        mockClient.query.mockResolvedValueOnce({ rows: [] });

        const config = await getAIConfig();

        expect(config.baseURL).toBe('https://env.example.com/v1');
        expect(config.apiKey).toBe('env-key');
        expect(config.model).toBe('groq/llama-3-70b');
    });

    it('falls back to legacy gemini_api_key for backward compat', async () => {
        mockClient.query.mockResolvedValueOnce(settingsRows({
            gemini_api_key: '"legacy-gemini-key"'
        }));

        const config = await getAIConfig();

        expect(config.apiKey).toBe('legacy-gemini-key');
    });

    it('falls back to GEMINI_API_KEY env var', async () => {
        process.env.GEMINI_API_KEY = 'env-gemini';
        mockClient.query.mockResolvedValueOnce({ rows: [] });

        const config = await getAIConfig();

        expect(config.apiKey).toBe('env-gemini');
    });

    it('prefixes legacy gemini-* model names with google/ when ai_model is unset', async () => {
        mockClient.query.mockResolvedValueOnce(settingsRows({
            gemini_model: '"gemini-1.5-pro"'
        }));

        const config = await getAIConfig();

        expect(config.model).toBe('google/gemini-1.5-pro');
    });

    it('does not prefix non-gemini model names', async () => {
        mockClient.query.mockResolvedValueOnce(settingsRows({
            gemini_model: '"openai/gpt-4"'
        }));

        const config = await getAIConfig();

        expect(config.model).toBe('openai/gpt-4');
    });

    it('parses ai_extra_headers when stored as a JSON string', async () => {
        mockClient.query.mockResolvedValueOnce({
            rows: [{ key: 'ai_extra_headers', value: '{"HTTP-Referer":"https://nudlers.app","X-Title":"Nudlers"}' }]
        });

        const config = await getAIConfig();

        expect(config.extraHeaders).toEqual({
            'HTTP-Referer': 'https://nudlers.app',
            'X-Title': 'Nudlers'
        });
    });

    it('accepts ai_extra_headers stored as a jsonb object', async () => {
        mockClient.query.mockResolvedValueOnce({
            rows: [{ key: 'ai_extra_headers', value: { 'X-Custom': 'foo' } }]
        });

        const config = await getAIConfig();

        expect(config.extraHeaders).toEqual({ 'X-Custom': 'foo' });
    });

    it('falls back to empty headers when ai_extra_headers is malformed', async () => {
        mockClient.query.mockResolvedValueOnce({
            rows: [{ key: 'ai_extra_headers', value: 'not-valid-json{' }]
        });

        const config = await getAIConfig();

        expect(config.extraHeaders).toEqual({});
    });

    it('rejects array as ai_extra_headers', async () => {
        mockClient.query.mockResolvedValueOnce({
            rows: [{ key: 'ai_extra_headers', value: '["foo"]' }]
        });

        const config = await getAIConfig();

        expect(config.extraHeaders).toEqual({});
    });

    it('releases the DB client even when query throws', async () => {
        mockClient.query.mockRejectedValueOnce(new Error('connection refused'));

        await expect(getAIConfig()).rejects.toThrow('connection refused');
        expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
});

describe('aiClient.mapAIError', () => {
    it('maps 401 to invalid-key message', () => {
        const err: any = new Error('unauthorized');
        err.status = 401;
        expect(mapAIError(err, 'm')).toMatch(/Invalid API key/);
    });

    it('maps 429 to rate-limit message', () => {
        const err: any = new Error('rate limit exceeded');
        err.status = 429;
        expect(mapAIError(err, 'm')).toMatch(/Rate limit|quota/i);
    });

    it('maps 404 to model-not-found message including model name', () => {
        const err: any = new Error('not found');
        err.status = 404;
        expect(mapAIError(err, 'foo/bar')).toMatch(/Model "foo\/bar" not found/);
    });

    it('maps 402 / insufficient credits', () => {
        const err: any = new Error('insufficient_quota');
        err.status = 402;
        expect(mapAIError(err, 'm')).toMatch(/Insufficient credits/);
    });

    it('maps content-filter errors', () => {
        const err: any = new Error('Response blocked by content_filter');
        expect(mapAIError(err, 'm')).toMatch(/content filters/);
    });

    it('does not leak raw provider error text in fallback', () => {
        const err: any = new Error('SECRET_INTERNAL_DETAIL: db host=10.0.0.1');
        const mapped = mapAIError(err, 'm');
        expect(mapped).not.toContain('SECRET_INTERNAL_DETAIL');
        expect(mapped).not.toContain('10.0.0.1');
    });
});
