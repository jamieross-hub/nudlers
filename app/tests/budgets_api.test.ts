import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../pages/api/db', () => ({
    getDB: vi.fn()
}));

vi.mock('../utils/logger.js', () => ({
    default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
}));

import { getDB } from '../pages/api/db';
import budgetsHandler from '../pages/api/budgets/index';
import budgetByIdHandler from '../pages/api/budgets/[id]';

describe('Budgets API (/api/budgets)', () => {
    let mockClient: { query: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> };
    let mockRes: { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn>; setHeader: ReturnType<typeof vi.fn> };

    beforeEach(() => {
        vi.clearAllMocks();
        mockClient = { query: vi.fn(), release: vi.fn() };
        (getDB as any).mockResolvedValue(mockClient);
        mockRes = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
            setHeader: vi.fn()
        };
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('GET /api/budgets', () => {
        it('should return all budgets ordered by category', async () => {
            const budgets = [
                { id: 1, category: 'Food', budget_limit: 2000 },
                { id: 2, category: 'Transport', budget_limit: 500 }
            ];
            mockClient.query.mockResolvedValue({ rows: budgets });

            await budgetsHandler({ method: 'GET' } as any, mockRes as any);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(budgets);
            expect(mockClient.query).toHaveBeenCalledTimes(1);
            const [sql] = mockClient.query.mock.calls[0];
            expect(sql).toContain('ORDER BY category ASC');
        });

        it('should return empty array when no budgets exist', async () => {
            mockClient.query.mockResolvedValue({ rows: [] });

            await budgetsHandler({ method: 'GET' } as any, mockRes as any);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith([]);
        });
    });

    describe('POST /api/budgets', () => {
        it('should create a new budget (upsert)', async () => {
            const newBudget = { id: 1, category: 'Food', budget_limit: 2000 };
            mockClient.query.mockResolvedValue({ rows: [newBudget] });

            await budgetsHandler({
                method: 'POST',
                body: { category: 'Food', budget_limit: 2000 }
            } as any, mockRes as any);

            expect(mockRes.status).toHaveBeenCalledWith(201);
            expect(mockRes.json).toHaveBeenCalledWith(newBudget);
            const [sql, params] = mockClient.query.mock.calls[0];
            expect(sql).toContain('ON CONFLICT (category)');
            expect(params).toEqual(['Food', 2000]);
        });

        it('should return 400 when category is missing', async () => {
            await budgetsHandler({
                method: 'POST',
                body: { budget_limit: 2000 }
            } as any, mockRes as any);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockClient.query).not.toHaveBeenCalled();
        });

        it('should return 400 when budget_limit is missing', async () => {
            await budgetsHandler({
                method: 'POST',
                body: { category: 'Food' }
            } as any, mockRes as any);

            expect(mockRes.status).toHaveBeenCalledWith(400);
        });

        it('should allow budget_limit of 0', async () => {
            mockClient.query.mockResolvedValue({ rows: [{ id: 1, category: 'Food', budget_limit: 0 }] });

            await budgetsHandler({
                method: 'POST',
                body: { category: 'Food', budget_limit: 0 }
            } as any, mockRes as any);

            expect(mockRes.status).toHaveBeenCalledWith(201);
        });
    });

    describe('Method not allowed', () => {
        it('should return 405 for unsupported methods', async () => {
            await budgetsHandler({ method: 'DELETE' } as any, mockRes as any);

            expect(mockRes.status).toHaveBeenCalledWith(405);
            expect(mockRes.setHeader).toHaveBeenCalledWith('Allow', ['GET', 'POST']);
        });
    });

    describe('Error handling', () => {
        it('should return 500 on database error and release client', async () => {
            mockClient.query.mockRejectedValue(new Error('DB error'));

            await budgetsHandler({ method: 'GET' } as any, mockRes as any);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockClient.release).toHaveBeenCalledTimes(1);
        });
    });
});

describe('Budget by ID API (/api/budgets/[id])', () => {
    let mockClient: { query: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> };
    let mockRes: { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn>; setHeader: ReturnType<typeof vi.fn> };

    beforeEach(() => {
        vi.clearAllMocks();
        mockClient = { query: vi.fn(), release: vi.fn() };
        (getDB as any).mockResolvedValue(mockClient);
        mockRes = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
            setHeader: vi.fn()
        };
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('PUT /api/budgets/[id]', () => {
        it('should update budget_limit', async () => {
            const updated = { id: 1, category: 'Food', budget_limit: 3000 };
            mockClient.query.mockResolvedValue({ rows: [updated] });

            await budgetByIdHandler({
                method: 'PUT',
                query: { id: '1' },
                body: { budget_limit: 3000 }
            } as any, mockRes as any);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(updated);
        });

        it('should return 404 when budget not found', async () => {
            mockClient.query.mockResolvedValue({ rows: [] });

            await budgetByIdHandler({
                method: 'PUT',
                query: { id: '999' },
                body: { budget_limit: 1000 }
            } as any, mockRes as any);

            expect(mockRes.status).toHaveBeenCalledWith(404);
        });

        it('should return 400 when budget_limit is undefined', async () => {
            await budgetByIdHandler({
                method: 'PUT',
                query: { id: '1' },
                body: {}
            } as any, mockRes as any);

            expect(mockRes.status).toHaveBeenCalledWith(400);
        });
    });

    describe('DELETE /api/budgets/[id]', () => {
        it('should delete a budget', async () => {
            mockClient.query.mockResolvedValue({ rows: [{ id: 1 }] });

            await budgetByIdHandler({
                method: 'DELETE',
                query: { id: '1' }
            } as any, mockRes as any);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Budget deleted successfully' });
        });

        it('should return 404 when budget not found', async () => {
            mockClient.query.mockResolvedValue({ rows: [] });

            await budgetByIdHandler({
                method: 'DELETE',
                query: { id: '999' }
            } as any, mockRes as any);

            expect(mockRes.status).toHaveBeenCalledWith(404);
        });
    });

    describe('Validation', () => {
        it('should return 400 when id is missing', async () => {
            await budgetByIdHandler({
                method: 'PUT',
                query: {},
                body: { budget_limit: 100 }
            } as any, mockRes as any);

            expect(mockRes.status).toHaveBeenCalledWith(400);
        });

        it('should return 405 for unsupported methods', async () => {
            await budgetByIdHandler({
                method: 'GET',
                query: { id: '1' }
            } as any, mockRes as any);

            expect(mockRes.status).toHaveBeenCalledWith(405);
        });
    });

    describe('Client release', () => {
        it('should always release the client', async () => {
            mockClient.query.mockRejectedValue(new Error('DB error'));

            await budgetByIdHandler({
                method: 'PUT',
                query: { id: '1' },
                body: { budget_limit: 100 }
            } as any, mockRes as any);

            expect(mockClient.release).toHaveBeenCalledTimes(1);
        });
    });
});
