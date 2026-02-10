import { db } from "../../../data/sqlite/db.js";

export class SearchRepository {

  search(query: string, limit = 20) {
    const stmt = db.prepare(`
      SELECT
        f.id,
        f.name,
        f.path,
        f.size,
        f.type,
        f.created_at,
        f.modified_at,
        rank
      FROM files_fts
      JOIN files f ON f.id = files_fts.rowid
      WHERE files_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `);

    return stmt.all(query, limit);
  }

}
