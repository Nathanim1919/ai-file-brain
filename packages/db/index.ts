import Database, { type Database as DatabaseType } from "better-sqlite3";

export const db: DatabaseType = new Database("filebrain.db");

// ─── Schema ──────────────────────────────────────────────────

db.prepare(`
CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT UNIQUE,
    name TEXT,
    size INTEGER,
    type TEXT,
    content TEXT DEFAULT '',
    created_at TEXT,
    modified_at TEXT
)
`).run();

// ─── Types ───────────────────────────────────────────────────

export interface FileMetadata {
    path: string;
    name: string;
    size: number;
    type: string;
    content: string;
    created_at: string;
    modified_at: string;
}

// ─── Operations ──────────────────────────────────────────────

/** Insert or update file metadata in the files table. */
export const upsertFile = (metadata: FileMetadata): void => {
    const stmt = db.prepare(`
        INSERT INTO files (path, name, size, type, content, created_at, modified_at)
        VALUES (@path, @name, @size, @type, @content, @created_at, @modified_at)
        ON CONFLICT(path) DO UPDATE SET
        name = @name,
        size = @size,
        type = @type,
        content = @content,
        created_at = @created_at,
        modified_at = @modified_at
    `);
    stmt.run(metadata);
};

/**
 * Wipe all data from the files table and the FTS5 index.
 * Used by `scan --fresh` to start from a clean slate.
 */
export const clearAllFiles = (): void => {
    db.exec("DELETE FROM files");

    // FTS5 table may not exist yet (first run), so guard
    try {
        db.exec("DELETE FROM files_fts");
    } catch {
        // files_fts doesn't exist yet — that's fine
    }
};

