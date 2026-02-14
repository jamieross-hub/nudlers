import { describe, it, expect } from 'vitest';
import { getSyncStatusLabel, SyncProgress } from '../utils/sync-ui-utils';

describe('getSyncStatusLabel', () => {
    it('should return stop status message when stopping', () => {
        expect(getSyncStatusLabel(null, false, true, 'Stopping Chrome...')).toBe('Stopping Chrome...');
    });

    it('should return default stopping message when stopStatus is null but isStopping', () => {
        expect(getSyncStatusLabel(null, false, true, null)).toBe('Stopping scrapers...');
    });

    it('should return preparing message when initializing', () => {
        expect(getSyncStatusLabel(null, true, false, null)).toBe('Preparing sync...');
    });

    it('should return generic syncing message when no progress', () => {
        expect(getSyncStatusLabel(null, false, false, null)).toBe('Syncing...');
    });

    it('should return single account message when total is 1', () => {
        const progress: SyncProgress = { current: 0, total: 1 };
        expect(getSyncStatusLabel(progress, false, false, null)).toBe('Syncing account...');
    });

    it('should show progress for multiple accounts', () => {
        const progress: SyncProgress = { current: 1, total: 3 };
        expect(getSyncStatusLabel(progress, false, false, null)).toBe('Syncing accounts... (2 / 3)');
    });

    it('should cap currentNum at total', () => {
        const progress: SyncProgress = { current: 5, total: 3 };
        expect(getSyncStatusLabel(progress, false, false, null)).toBe('Syncing accounts... (3 / 3)');
    });

    it('should handle zero current', () => {
        const progress: SyncProgress = { current: 0, total: 5 };
        expect(getSyncStatusLabel(progress, false, false, null)).toBe('Syncing accounts... (1 / 5)');
    });

    it('should prioritize stopping over initializing', () => {
        expect(getSyncStatusLabel(null, true, true, 'Stopping...')).toBe('Stopping...');
    });
});
