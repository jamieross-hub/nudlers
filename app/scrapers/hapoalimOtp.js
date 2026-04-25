/**
 * Bank Hapoalim 2FA / OTP scraper helper.
 *
 * Mirrors the mechanics of israeli-bank-scrapers PR #1084
 * (https://github.com/eshaham/israeli-bank-scrapers/pull/1084):
 *
 *   • Detect via DOM selector `form.auth-otp-login` (the bank does NOT redirect).
 *   • Fill per-digit inputs with REAL keyboard events. Synthetic value-set
 *     bypasses Angular reactive forms and leaves the submit button disabled.
 *   • Submit via real Puppeteer mouse click. `el.click()` inside page.evaluate
 *     is ignored by Hapoalim's Angular form (this was the missing piece).
 *   • Wait in two phases: form-disappears-or-error-shows, then URL reaches one
 *     of three known post-login paths.
 */

import { waitForOtp, clearPendingOtp } from '../pages/api/scrapers/otp.js';
import logger from '../utils/logger.js';

// --- Selectors ------------------------------------------------------------

const OTP_FORM_SELECTOR = 'form.auth-otp-login';
const OTP_DIGIT_INPUT_SCOPED = 'form.auth-otp-login input[type="text"]';
const OTP_DIGIT_INPUT_FALLBACK = 'input[data-testid^="separated-"]';
const OTP_SUBMIT_SCOPED = 'form.auth-otp-login .btn-red_1';
const OTP_SUBMIT_FALLBACK = '.btn-red_1';
const OTP_ERROR_SELECTOR = '.errors-rb .error-message, .auth-otp-login .error';

const SUCCESS_URL_PATTERNS = [
    '/portalserver/HomePage',
    '/ng-portals-bt/rb/he/homepage',
    '/ng-portals/rb/he/homepage',
];

// --- Timings --------------------------------------------------------------

const MAX_OTP_ATTEMPTS = 3;
// Per-attempt user wait. Three attempts × this value defines worst-case duration,
// so keep it tight — 3 min is enough to read an SMS, even on a bad day.
const OTP_USER_TIMEOUT_MS = 180_000;
const FORM_APPEAR_TIMEOUT_MS = 10_000;   // 10 s — wait for form to render
const PHASE_A_TIMEOUT_MS = 20_000;       // 20 s — form gone OR fresh error
const PHASE_B_TIMEOUT_MS = 10_000;       // 10 s — URL reaches success path
const POLL_INTERVAL_MS = 1_000;
const PER_KEY_TYPE_DELAY_MS = 50;
const PER_DIGIT_SETTLE_MS = 100;
const PRE_SUBMIT_DELAY_MS = 600;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Frame / DOM helpers --------------------------------------------------

async function safeQuery(context, selector) {
    if (!context || typeof context.$ !== 'function') return null;
    try { return await context.$(selector); } catch { return null; }
}

async function safeQueryAll(context, selector) {
    if (!context || typeof context.$$ !== 'function') return [];
    try { return await context.$$(selector); } catch { return []; }
}

function tryUrl(ctx) {
    try { return ctx?.url?.() ?? 'unknown'; } catch { return 'unknown'; }
}

/**
 * Locate the frame (main page or iframe) that contains the OTP form.
 */
async function findOtpFrame(page) {
    if (!page) return null;
    if (await safeQuery(page, OTP_FORM_SELECTOR)) return page;
    if (typeof page.frames !== 'function') return null;
    let frames = [];
    try { frames = page.frames() || []; } catch { return null; }
    let mainFrame = null;
    try { mainFrame = page.mainFrame?.(); } catch { /* ignore */ }
    for (const frame of frames) {
        if (frame === mainFrame) continue;
        if (await safeQuery(frame, OTP_FORM_SELECTOR)) return frame;
    }
    return null;
}

/**
 * Poll `predicate` every `intervalMs` until it returns a truthy value or
 * `timeoutMs` elapses. Returns whatever the predicate returned (so callers
 * can encode multiple outcomes), or null on timeout.
 *
 * Exceptions are swallowed (treated as "not yet") EXCEPT execution-context
 * destruction, which signals navigation — we re-throw so callers can decide.
 */
async function waitUntil(predicate, timeoutMs, intervalMs = POLL_INTERVAL_MS, label = 'condition') {
    const start = Date.now();
    let attempt = 0;
    while (true) {
        attempt++;
        try {
            const result = await predicate();
            if (result) {
                logger.debug({ label, attempt, elapsedMs: Date.now() - start }, '[Hapoalim OTP] waitUntil resolved');
                return result;
            }
        } catch (err) {
            const msg = err?.message || '';
            if (/execution context|frame got detached|target closed|destroyed/i.test(msg)) {
                throw err;
            }
            // otherwise: swallow & keep polling
        }
        if (Date.now() - start >= timeoutMs) {
            logger.debug({ label, attempt, elapsedMs: Date.now() - start }, '[Hapoalim OTP] waitUntil timed out');
            return null;
        }
        await sleep(intervalMs);
    }
}

// --- OTP page detection ---------------------------------------------------

/**
 * Decide whether the current page is the Hapoalim OTP/2FA page.
 *
 * Primary signal:   `form.auth-otp-login` present in the DOM (any frame).
 * Secondary signal: ≥4 separated digit inputs.
 * Tertiary signal:  narrow URL pattern OR a strong Hebrew/English keyword
 *                   without the login fields (resilience against markup tweaks).
 */
export async function isOtpPage(page) {
    const url = tryUrl(page);
    logger.info({ url }, '[Hapoalim OTP] Checking if page is OTP page');

    // Primary: form selector
    const formFrame = await findOtpFrame(page);
    if (formFrame) {
        logger.info('[Hapoalim OTP] Detected via form.auth-otp-login');
        return true;
    }

    // Secondary: separated digit inputs
    const digitInputs = await safeQueryAll(page, OTP_DIGIT_INPUT_FALLBACK);
    if (digitInputs.length >= 4) {
        logger.info({ count: digitInputs.length }, '[Hapoalim OTP] Detected via separated digit inputs');
        return true;
    }

    // Tertiary: URL patterns (kept narrow — must include OTP-specific tokens)
    if (/VALIDATEOTPCODE|MOBILE_AUTHENTICATION|smsVerification|AUTHENTICATE.*OTP|OTP.*VALIDATE/i.test(url || '')) {
        logger.info({ url }, '[Hapoalim OTP] Detected via URL pattern');
        return true;
    }

    // Tertiary: very narrow text scan (skips if login form is visible)
    if (typeof page.evaluate === 'function') {
        try {
            const matched = await page.evaluate(() => {
                const text = (document.body?.innerText || '').toLowerCase();
                if (!text) return false;
                if (document.querySelector('#userCode, #password')) return false;
                return text.includes('קוד אימות') || text.includes('אימות דו שלבי') || text.includes('one-time password');
            });
            if (matched) {
                logger.info('[Hapoalim OTP] Detected via text content keyword');
                return true;
            }
        } catch (err) {
            logger.warn({ error: err.message }, '[Hapoalim OTP] Text scan failed');
        }
    }

    logger.info('[Hapoalim OTP] No OTP indicators found');
    return false;
}

// --- OTP submission mechanics ---------------------------------------------

async function getDigitInputs(formFrame) {
    let inputs = await safeQueryAll(formFrame, OTP_DIGIT_INPUT_SCOPED);
    if (inputs.length >= 4) return { inputs, selector: OTP_DIGIT_INPUT_SCOPED };
    inputs = await safeQueryAll(formFrame, OTP_DIGIT_INPUT_FALLBACK);
    if (inputs.length >= 4) return { inputs, selector: OTP_DIGIT_INPUT_FALLBACK };
    return { inputs: [], selector: null };
}

/**
 * Type each OTP digit into its input using real keyboard events.
 * Synthetic value-set + dispatchEvent does NOT trip Angular ngModel — do not
 * "optimise" this with shortcuts.
 */
async function fillDigits(inputs, digits) {
    logger.info({ inputCount: inputs.length, digitCount: digits.length }, '[Hapoalim OTP] Typing digits');
    for (let i = 0; i < inputs.length; i++) {
        const input = inputs[i];
        await input.click();
        await input.evaluate((el) => { el.value = ''; });
        if (i < digits.length) {
            await input.type(digits[i], { delay: PER_KEY_TYPE_DELAY_MS });
        }
        await sleep(PER_DIGIT_SETTLE_MS);
    }
}

/**
 * Click the OTP submit button using real Puppeteer mouse events.
 * Returns true on the first selector that successfully clicks.
 */
async function submitOtpForm(formFrame, page) {
    const tries = [
        { ctx: formFrame, sel: OTP_SUBMIT_SCOPED, label: 'form-frame:scoped' },
        { ctx: formFrame, sel: OTP_SUBMIT_FALLBACK, label: 'form-frame:fallback' },
    ];
    if (page && page !== formFrame) {
        tries.push({ ctx: page, sel: OTP_SUBMIT_SCOPED, label: 'main-page:scoped' });
        tries.push({ ctx: page, sel: OTP_SUBMIT_FALLBACK, label: 'main-page:fallback' });
    }
    for (const { ctx, sel, label } of tries) {
        if (!ctx || typeof ctx.click !== 'function') continue;
        try {
            await ctx.click(sel);
            logger.info({ selector: sel, where: label }, '[Hapoalim OTP] Submit clicked');
            return true;
        } catch (err) {
            logger.debug({ selector: sel, where: label, error: err.message }, '[Hapoalim OTP] Submit click attempt failed');
        }
    }
    return false;
}

/**
 * Snapshot the inline-error text so we can later distinguish a fresh error
 * (rejected this attempt) from a stale error (left over from a prior attempt).
 */
async function captureErrorState(formFrame, page) {
    const ctx = formFrame && typeof formFrame.evaluate === 'function' ? formFrame : page;
    if (!ctx || typeof ctx.evaluate !== 'function') return null;
    try {
        return await ctx.evaluate((selector) => {
            const els = document.querySelectorAll(selector);
            return Array.from(els).map((e) => (e.textContent || '').trim()).join('||');
        }, OTP_ERROR_SELECTOR);
    } catch {
        return null;
    }
}

/**
 * Two-phase wait for OTP submission outcome.
 *  Phase A: the form goes away OR a NEW (different from `preSubmitErrorState`)
 *           error becomes visible.
 *  Phase B: URL contains one of `SUCCESS_URL_PATTERNS`.
 *
 * Returns 'success' | 'wrong-code' | 'form-still-present' | 'navigation-timeout'.
 */
async function waitForOtpOutcome(page, formFrame, preSubmitErrorState) {
    logger.info('[Hapoalim OTP] Phase A: waiting for form-gone or fresh error');

    let phaseA;
    try {
        phaseA = await waitUntil(async () => {
            const formStillThere = !!(await safeQuery(formFrame, OTP_FORM_SELECTOR));
            if (!formStillThere) {
                const elsewhere = await findOtpFrame(page);
                if (!elsewhere) return 'form-gone';
            }
            const currentErr = await captureErrorState(formFrame, page);
            if (currentErr && currentErr !== preSubmitErrorState && currentErr.length > 0) {
                logger.warn({ currentErr }, '[Hapoalim OTP] Inline error detected (different from pre-submit)');
                return 'error';
            }
            return null;
        }, PHASE_A_TIMEOUT_MS, POLL_INTERVAL_MS, 'phaseA');
    } catch (err) {
        // Execution context destroyed = navigation = form gone.
        logger.info({ error: err.message }, '[Hapoalim OTP] Phase A: context destroyed (treated as form-gone)');
        phaseA = 'form-gone';
    }

    if (phaseA === 'error') {
        return 'wrong-code';
    }
    if (phaseA !== 'form-gone') {
        logger.warn({ url: tryUrl(page) }, '[Hapoalim OTP] Phase A: form still present after timeout');
        return 'form-still-present';
    }

    logger.info({ patterns: SUCCESS_URL_PATTERNS }, '[Hapoalim OTP] Phase B: waiting for post-OTP navigation');
    const matched = await waitUntil(() => {
        const url = tryUrl(page);
        const hit = SUCCESS_URL_PATTERNS.find((p) => url.includes(p));
        return hit || false;
    }, PHASE_B_TIMEOUT_MS, POLL_INTERVAL_MS, 'phaseB');

    if (matched) {
        logger.info({ matched, url: tryUrl(page) }, '[Hapoalim OTP] Phase B: success URL reached');
        return 'success';
    }
    logger.warn({ url: tryUrl(page) }, '[Hapoalim OTP] Phase B: timeout — form gone but no known post-login URL');
    return 'navigation-timeout';
}

async function takeDebugScreenshot(page, label) {
    if (!page || typeof page.screenshot !== 'function') return;
    try {
        const path = `/tmp/hapoalim_otp_${label}.png`;
        await page.screenshot({ path, fullPage: true });
        logger.info({ path }, `[Hapoalim OTP] Screenshot saved: ${label}`);
    } catch (err) {
        logger.warn({ error: err.message, label }, '[Hapoalim OTP] Screenshot failed');
    }
}

// --- Public entry point ---------------------------------------------------

/**
 * Run the full Hapoalim OTP verification flow on a Puppeteer page.
 *
 * Returns true on success. Throws on terminal failure (max attempts reached,
 * user timeout, form not found, post-OTP navigation failure).
 *
 * @param {import('puppeteer').Page} page
 * @param {(companyId: string, payload: object) => void} [onProgress]
 */
export async function handleHapoalimOtp(page, onProgress) {
    logger.info({ url: tryUrl(page) }, '[Hapoalim OTP] Starting verification flow');
    await takeDebugScreenshot(page, 'detected');

    let formFrame = await waitUntil(() => findOtpFrame(page), FORM_APPEAR_TIMEOUT_MS, 500, 'form-appears');
    if (!formFrame) formFrame = await findOtpFrame(page);
    if (!formFrame) {
        logger.error('[Hapoalim OTP] OTP form not found on page or in any frame');
        await takeDebugScreenshot(page, 'form-not-found');
        if (onProgress) {
            onProgress('hapoalim', { type: 'otpFailed', message: '2FA verification form not found on page' });
        }
        throw new Error('Hapoalim OTP form not found');
    }
    logger.info({ frameUrl: tryUrl(formFrame) }, '[Hapoalim OTP] OTP form located');

    for (let attempt = 1; attempt <= MAX_OTP_ATTEMPTS; attempt++) {
        logger.info({ attempt, maxAttempts: MAX_OTP_ATTEMPTS }, '[Hapoalim OTP] Beginning attempt');

        if (onProgress) {
            onProgress('hapoalim', {
                type: 'otpRequired',
                attempt,
                maxAttempts: MAX_OTP_ATTEMPTS,
                message: attempt === 1
                    ? 'Bank Hapoalim requires 2FA verification. Please enter the SMS code sent to your phone.'
                    : `Verification code rejected. Please try again (attempt ${attempt}/${MAX_OTP_ATTEMPTS}).`,
            });
        }

        let otpCode;
        try {
            otpCode = await waitForOtp('hapoalim', OTP_USER_TIMEOUT_MS);
        } catch (err) {
            logger.error({ error: err.message, attempt }, '[Hapoalim OTP] Aborted waiting for user');
            clearPendingOtp();
            if (onProgress) {
                onProgress('hapoalim', { type: 'otpFailed', message: err.message });
            }
            throw err;
        }
        logger.info({ codeLength: otpCode.length, attempt }, '[Hapoalim OTP] Code received from user');

        if (onProgress) {
            onProgress('hapoalim', { type: 'otpSubmitting', message: 'Submitting verification code...' });
        }

        // Re-resolve the frame in case the DOM mutated while we waited
        formFrame = await findOtpFrame(page);
        if (!formFrame) {
            const url = tryUrl(page);
            if (SUCCESS_URL_PATTERNS.some((p) => url.includes(p))) {
                logger.info({ url }, '[Hapoalim OTP] Form vanished and URL is on success path — treating as success');
                if (onProgress) onProgress('hapoalim', { type: 'otpSuccess', message: '✓ 2FA verification successful' });
                return true;
            }
            logger.error({ url }, '[Hapoalim OTP] Form disappeared but URL is not a success path');
            await takeDebugScreenshot(page, `attempt-${attempt}-form-vanished`);
            throw new Error('Hapoalim OTP form disappeared unexpectedly');
        }

        const { inputs, selector: digitSelector } = await getDigitInputs(formFrame);
        if (inputs.length < 4) {
            logger.error({ found: inputs.length, attempt }, '[Hapoalim OTP] Digit inputs not found');
            await takeDebugScreenshot(page, `attempt-${attempt}-no-inputs`);
            if (onProgress) {
                onProgress('hapoalim', { type: 'otpFailed', message: 'Could not find OTP input fields' });
            }
            throw new Error('Hapoalim OTP: digit inputs not found');
        }
        logger.info({ digitSelector, inputCount: inputs.length, attempt }, '[Hapoalim OTP] Digit inputs located');

        const preSubmitError = await captureErrorState(formFrame, page);

        await fillDigits(inputs, otpCode.split(''));
        await sleep(PRE_SUBMIT_DELAY_MS);

        const submitted = await submitOtpForm(formFrame, page);
        if (!submitted) {
            logger.error({ attempt }, '[Hapoalim OTP] Submit button could not be clicked');
            await takeDebugScreenshot(page, `attempt-${attempt}-no-submit`);
            if (onProgress) {
                onProgress('hapoalim', { type: 'otpFailed', message: 'Could not click submit button' });
            }
            throw new Error('Hapoalim OTP: submit button not clickable');
        }

        const outcome = await waitForOtpOutcome(page, formFrame, preSubmitError);
        await takeDebugScreenshot(page, `attempt-${attempt}-${outcome}`);
        logger.info({ outcome, attempt }, '[Hapoalim OTP] Attempt outcome');

        if (outcome === 'success') {
            if (onProgress) onProgress('hapoalim', { type: 'otpSuccess', message: '✓ 2FA verification successful' });
            return true;
        }

        if (outcome === 'navigation-timeout') {
            // Form is gone, retry won't help — treat as terminal.
            clearPendingOtp();
            if (onProgress) {
                onProgress('hapoalim', {
                    type: 'otpFailed',
                    message: 'Code accepted but the bank did not redirect. Please try again later.',
                });
            }
            throw new Error('Hapoalim OTP: post-submit navigation did not reach a known page');
        }

        // 'wrong-code' or 'form-still-present' — retryable.
        const isLast = attempt >= MAX_OTP_ATTEMPTS;
        if (isLast) {
            clearPendingOtp();
            if (onProgress) {
                onProgress('hapoalim', {
                    type: 'otpFailed',
                    message: `2FA verification failed after ${MAX_OTP_ATTEMPTS} attempts`,
                });
            }
            throw new Error(`Hapoalim OTP verification failed after ${MAX_OTP_ATTEMPTS} attempts`);
        }
        if (onProgress) {
            onProgress('hapoalim', {
                type: 'otpFailed',
                message: outcome === 'wrong-code'
                    ? 'Verification code rejected. Please try again.'
                    : 'Verification did not complete. Please try again.',
            });
        }
        // loop continues to the next attempt
    }

    // Unreachable, but keeps return type honest
    return false;
}

const hapoalimOtp = { handleHapoalimOtp, isOtpPage, waitForOtp, clearPendingOtp };
export default hapoalimOtp;
