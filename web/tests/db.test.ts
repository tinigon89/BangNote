import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from '@/lib/db/migrate';
import { createTestDb, type TestDb } from './helpers/test-db';

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.close());

describe('migrations', () => {
  it('chạy lại không làm gì', async () => {
    const applied = await runMigrations({
      exec: (sql) => t.pg.exec(sql),
      query: (sql, params) => t.pg.query(sql, params),
    });
    expect(applied).toEqual([]);
  });

  it('seed đúng một tag mặc định', async () => {
    const { rows } = await t.pg.query<{ name: string }>('SELECT name FROM tags WHERE is_default');
    expect(rows).toEqual([{ name: 'Chưa phân loại' }]);
  });

  it('không cho tạo tag mặc định thứ hai', async () => {
    await expect(
      t.pg.query("INSERT INTO tags (name, color, is_default) VALUES ('Khác', '#000000', true)"),
    ).rejects.toThrow();
  });

  it('f_unaccent bỏ dấu kể cả Đ', async () => {
    const { rows } = await t.pg.query<{ v: string }>("SELECT f_unaccent(lower('ĐIỆN Biên Phủ')) AS v");
    expect(rows[0].v).toBe('dien bien phu');
  });

  it('source ngoài danh sách bị từ chối', async () => {
    await expect(t.pg.query("INSERT INTO notes (content, source) VALUES ('x', 'email')")).rejects.toThrow();
  });
});
