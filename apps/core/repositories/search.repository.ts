import { db } from "../../../packages/db/index.js";

export class SearchRepository {

  search(query: string, limit = 20) {

    // basic sanitisation for FTS MATCH
    const match = query
      .trim()
      .replace(/["']/g, "")
      .replace(/\s+/g, " ");

    const stmt = db.prepare(`
      SELECT
        f.id,
        f.name,
        f.path,
        f.size,
        f.created_at,
        f.modified_at,

        (-bm25(files_fts, 5.0, 3.0, 1.0, 0.0)) AS score,

        -- Try content snippet first, then name, then path
        COALESCE(
          NULLIF(snippet(files_fts, 2, '[', ']', '…', 10), ''),
          NULLIF(snippet(files_fts, 0, '[', ']', '…', 10), ''),
          snippet(files_fts, 1, '[', ']', '…', 10)
        ) AS snippet

      FROM files_fts
      JOIN files f ON f.id = files_fts.file_id

      WHERE files_fts MATCH ?

      ORDER BY
        score DESC,
        length(f.name) ASC,
        f.modified_at DESC

      LIMIT ?
    `);

    return stmt.all(match, limit);
  }
}
