import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ pools: [] as { options: Record<string, unknown>; emitter: EventEmitter }[] }));

vi.mock('@neondatabase/serverless', () => ({
  Pool: class {
    emitter = new EventEmitter();
    constructor(public options: Record<string, unknown>) {
      h.pools.push(this as never);
    }
    on(event: string, fn: (...args: unknown[]) => void) {
      this.emitter.on(event, fn);
      return this;
    }
  },
}));
vi.mock('drizzle-orm/neon-serverless', () => ({ drizzle: () => ({}) }));

beforeEach(() => {
  h.pools.length = 0;
  vi.resetModules();
  process.env.DATABASE_URL = 'postgresql://u:p@example.neon.tech/db';
});

describe('getDb (Neon Pool dùng lại giữa các lần gọi serverless)', () => {
  it('tạo một Pool duy nhất với idle timeout ngắn', async () => {
    const { getDb } = await import('@/lib/db/client');
    getDb();
    getDb();
    expect(h.pools).toHaveLength(1);
    expect(h.pools[0].options.connectionString).toBe(process.env.DATABASE_URL);
    expect(h.pools[0].options.idleTimeoutMillis).toBeLessThanOrEqual(10_000);
  });

  it("kết nối rảnh bị đóng ('error' trên pool) không làm crash tiến trình", async () => {
    const { getDb } = await import('@/lib/db/client');
    getDb();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // EventEmitter ném lỗi nếu 'error' không có listener — đúng như node-postgres Pool làm sập instance.
    expect(() => h.pools[0].emitter.emit('error', new Error('Connection terminated unexpectedly'))).not.toThrow();
  });

  it('thiếu DATABASE_URL → báo lỗi rõ ràng', async () => {
    delete process.env.DATABASE_URL;
    const { getDb } = await import('@/lib/db/client');
    expect(() => getDb()).toThrow('DATABASE_URL');
  });
});
