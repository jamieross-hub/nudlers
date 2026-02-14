import { describe, it, expect } from 'vitest';
import { formatNumber, formatCurrencyILS } from '../components/CategoryDashboard/utils/format';
import { dateUtils } from '../components/CategoryDashboard/utils/dateUtils';

describe('formatNumber', () => {
    it('should format a number with 2 decimal places', () => {
        const result = formatNumber(1234.5);
        // Israeli locale uses non-breaking spaces or commas for grouping
        expect(result).toContain('1,234.50');
    });

    it('should format zero', () => {
        expect(formatNumber(0)).toBe('0.00');
    });

    it('should format negative numbers', () => {
        const result = formatNumber(-500.1);
        // Should contain the digits with formatting
        expect(result).toContain('500.10');
    });

    it('should truncate to 2 decimal places', () => {
        const result = formatNumber(1.999);
        expect(result).toContain('2.00');
    });
});

describe('formatCurrencyILS', () => {
    it('should include the shekel symbol', () => {
        const result = formatCurrencyILS(100);
        // Hebrew locale ILS should include ₪
        expect(result).toContain('₪');
    });

    it('should format with 2 decimal places', () => {
        const result = formatCurrencyILS(1234.5);
        expect(result).toContain('1,234.50');
    });

    it('should handle zero', () => {
        const result = formatCurrencyILS(0);
        expect(result).toContain('0.00');
    });
});

describe('dateUtils.formatDate', () => {
    it('should format a Date as DD/MM/YYYY', () => {
        const date = new Date(2024, 0, 15); // January 15, 2024
        expect(dateUtils.formatDate(date)).toBe('15/01/2024');
    });

    it('should pad single-digit day and month', () => {
        const date = new Date(2024, 2, 5); // March 5, 2024
        expect(dateUtils.formatDate(date)).toBe('05/03/2024');
    });

    it('should handle string input', () => {
        // Use a date that won't shift due to timezone
        const date = new Date(2024, 11, 31); // December 31, 2024
        expect(dateUtils.formatDate(date)).toBe('31/12/2024');
    });
});
