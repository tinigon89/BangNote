import { type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { getDb } from '@/lib/db/client';
import { buildNotesDocx } from '@/lib/export/docx';
import { exportFilename, formatNotesTxt } from '@/lib/export/text';
import { handleApiError, jsonError } from '@/lib/http';
import { parseNoteFilters, toListFilter } from '@/lib/notes/filters';
import { MAX_LIST_LIMIT, listNotes } from '@/lib/notes/notes';

const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * Xuất ghi chú: `id` lặp lại → chỉ các ghi chú đó; không có → toàn bộ ghi chú khớp bộ lọc (tối đa 5000).
 * `num=0` bỏ số #, `detail=0` bỏ tag/ngày giờ/link.
 */
export async function GET(req: NextRequest) {
  if (!verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)) return jsonError(401, 'Chưa đăng nhập');

  const params = req.nextUrl.searchParams;
  const format = params.get('format');
  if (format !== 'txt' && format !== 'docx') return jsonError(400, 'format phải là txt hoặc docx');

  try {
    const filters = parseNoteFilters(Object.fromEntries([...new Set(params.keys())].map((k) => [k, params.getAll(k)])));
    const ids = params.getAll('id').filter((s) => /^\d+$/.test(s)).map(Number);
    const listFilter = ids.length ? { ids, sort: filters.sort } : toListFilter(filters);
    const { notes } = await listNotes(getDb(), { ...listFilter, limit: MAX_LIST_LIMIT });

    const opts = { number: params.get('num') !== '0', detail: params.get('detail') !== '0' };
    const disposition = `attachment; filename="${exportFilename(format)}"`;
    if (format === 'txt') {
      return new Response(formatNotesTxt(notes, opts), {
        headers: { 'content-type': 'text/plain; charset=utf-8', 'content-disposition': disposition },
      });
    }
    return new Response(new Uint8Array(await buildNotesDocx(notes, opts)), {
      headers: { 'content-type': DOCX_TYPE, 'content-disposition': disposition },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
