import { db } from "../../data/sqlite/db.js";
import type { SearchQuery, SearchResult } from "./search.types.js";


export const runSearchQuery = (query: SearchQuery): SearchResult[] => {
    let sql = `
        SELECT path, name, size, type, modified_at
        FROM files
        WHERE 1=1
    `;

    const params: any[] = [];

    if (query.text) {
        sql += ` AND (name LIKE ? OR path LIKE ?)` // search in name and path
        params.push(`%${query.text}%`, `%${query.text}%`);
    }

    if (query.extension) {
        sql += ` AND type = ?`;
        params.push(query.extension);
    }

    if (query.minSize) {
        sql += ` AND size >= ?`;
        params.push(query.minSize);
    }

    if (query.maxSize) {
        sql += ` AND size <= ?`;
        params.push(query.maxSize);
    }

    if (query.recentDays) {
        sql += ` AND modified_at >= ?`;
        params.push(Date.now() - query.recentDays * 24 * 60 * 60 * 1000);
    }

    if (query.dir) {
        sql += ` AND path LIKE ?`;
        params.push(`%${query.dir}%`);
    }

    sql += ` ORDER BY modified_at DESC LIMIT 50`;

    return db.prepare(sql).all(params);
}