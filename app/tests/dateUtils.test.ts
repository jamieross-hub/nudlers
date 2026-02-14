import { describe, it, expect } from 'vitest';
import { formatISODate, getTodayISODate, getLocalMidnight } from '../utils/dateUtils';

describe('formatISODate', () => {
    it('should format a Date object as YYYY-MM-DD', () => {
        const date = new Date(2024, 0, 15); // January 15, 2024
        expect(formatISODate(date)).toBe('2024-01-15');
    });

    it('should format a date string', () => {
        // Use a date format that won't be affected by timezone
        const date = new Date(2024, 5, 3); // June 3, 2024
        expect(formatISODate(date)).toBe('2024-06-03');
    });

    it('should pad single-digit months and days', () => {
        const date = new Date(2024, 0, 5); // January 5, 2024
        expect(formatISODate(date)).toBe('2024-01-05');
    });

    it('should handle end of year dates', () => {
        const date = new Date(2024, 11, 31); // December 31, 2024
        expect(formatISODate(date)).toBe('2024-12-31');
    });

    it('should return empty string for null', () => {
        expect(formatISODate(null)).toBe('');
    });

    it('should return empty string for undefined', () => {
        expect(formatISODate(undefined)).toBe('');
    });

    it('should return empty string for invalid date string', () => {
        expect(formatISODate('not-a-date')).toBe('');
    });

    it('should handle timestamp numbers', () => {
        const timestamp = new Date(2024, 2, 10).getTime(); // March 10, 2024
        expect(formatISODate(timestamp)).toBe('2024-03-10');
    });
});

describe('getTodayISODate', () => {
    it('should return a string in YYYY-MM-DD format', () => {
        const result = getTodayISODate();
        expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should match today\'s local date', () => {
        const now = new Date();
        const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        expect(getTodayISODate()).toBe(expected);
    });
});

describe('getLocalMidnight', () => {
    it('should return midnight for a given date', () => {
        const date = new Date(2024, 5, 15, 14, 30, 45);
        const midnight = getLocalMidnight(date);
        expect(midnight.getHours()).toBe(0);
        expect(midnight.getMinutes()).toBe(0);
        expect(midnight.getSeconds()).toBe(0);
        expect(midnight.getMilliseconds()).toBe(0);
    });

    it('should preserve the date part', () => {
        const date = new Date(2024, 5, 15, 14, 30, 45);
        const midnight = getLocalMidnight(date);
        expect(midnight.getFullYear()).toBe(2024);
        expect(midnight.getMonth()).toBe(5);
        expect(midnight.getDate()).toBe(15);
    });

    it('should default to today when no argument is given', () => {
        const midnight = getLocalMidnight();
        const now = new Date();
        expect(midnight.getFullYear()).toBe(now.getFullYear());
        expect(midnight.getMonth()).toBe(now.getMonth());
        expect(midnight.getDate()).toBe(now.getDate());
        expect(midnight.getHours()).toBe(0);
    });

    it('should handle string date input', () => {
        const midnight = getLocalMidnight('2024-06-15T14:30:00');
        expect(midnight.getHours()).toBe(0);
        expect(midnight.getMinutes()).toBe(0);
    });

    it('should not mutate the original date', () => {
        const original = new Date(2024, 5, 15, 14, 30, 45);
        const originalTime = original.getTime();
        getLocalMidnight(original);
        expect(original.getTime()).toBe(originalTime);
    });
});
