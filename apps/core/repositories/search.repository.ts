import { db } from "../../../data/sqlite/db.js";

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

        (-bm25(files_fts)) AS score,

        snippet(
          files_fts,
          2,
          '[',
          ']',
          '…',
          10
        ) AS snippet,

        (files_fts.name MATCH ?) AS name_match,
        (files_fts.path MATCH ?) AS path_match

      FROM files_fts
      JOIN files f ON f.id = files_fts.file_id

      WHERE files_fts MATCH ?

      ORDER BY
        name_match DESC,
        path_match DESC,
        score DESC

      LIMIT ?
    `);

    return stmt.all(
      match,
      match,
      match,
      limit
    );
  }
}
