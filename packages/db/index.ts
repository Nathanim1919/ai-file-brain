import Database, { type Database as DatabaseType } from "better-sqlite3";
import { DB_PATH, ensureDataDir } from "../paths.js";

// Ensure ~/.ai-file-brain/ exists before opening the database
ensureDataDir();

export const db: DatabaseType = new Database(DB_PATH);

// ─── Schema ──────────────────────────────────────────────────

db.prepare(`
CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT UNIQUE,
    name TEXT,
    size INTEGER,
    type TEXT,
    content TEXT DEFAULT '',
    content_hash TEXT DEFAULT '',
    created_at TEXT,
    modified_at TEXT
)
`).run();

// Migrate existing DBs that lack the content_hash column
try {
    db.prepare("SELECT content_hash FROM files LIMIT 1").get();
} catch {
    db.exec("ALTER TABLE files ADD COLUMN content_hash TEXT DEFAULT ''");
}

// ─── FTS5 Full-Text Search ───────────────────────────────────
// Auto-create the FTS5 virtual table + sync triggers on first run.
// This replaces the old manual migration (002_add_fts5.sql).

db.exec(`
CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
    name,
    path,
    content,
    file_id UNINDEXED,
    tokenize="porter unicode61"
)
`);

// Triggers keep files_fts in sync with the files table automatically.
// CREATE TRIGGER IF NOT EXISTS isn't supported, so we guard manually.
const triggerExists = db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='files_fts_insert'"
).get();

if (!triggerExists) {
    db.exec(`
        CREATE TRIGGER files_fts_insert AFTER INSERT ON files BEGIN
            INSERT INTO files_fts (rowid, name, path, content, file_id)
            VALUES (new.id, new.name, new.path, new.content, new.id);
        END;

        CREATE TRIGGER files_fts_update AFTER UPDATE ON files BEGIN
            DELETE FROM files_fts WHERE file_id = old.id;
            INSERT INTO files_fts (rowid, name, path, content, file_id)
            VALUES (new.id, new.name, new.path, new.content, new.id);
        END;

        CREATE TRIGGER files_fts_delete AFTER DELETE ON files BEGIN
            DELETE FROM files_fts WHERE file_id = old.id;
        END;
    `);

    // Backfill: if files exist but FTS is empty, populate it
    const fileCount = (db.prepare("SELECT COUNT(*) as c FROM files").get() as { c: number }).c;
    const ftsCount = (db.prepare("SELECT COUNT(*) as c FROM files_fts").get() as { c: number }).c;

    if (fileCount > 0 && ftsCount === 0) {
        db.exec(`
            INSERT INTO files_fts (rowid, name, path, content, file_id)
            SELECT id, name, path, content, id FROM files
        `);
    }
}

// ─── Types ───────────────────────────────────────────────────

export interface FileMetadata {
    path: string;
    name: string;
    size: number;
    type: string;
    content: string;
    content_hash: string;
    created_at: string;
    modified_at: string;
}

// ─── Operations ──────────────────────────────────────────────

/** Insert or update file metadata in the files table. */
export const upsertFile = (metadata: FileMetadata): void => {
    const stmt = db.prepare(`
        INSERT INTO files (path, name, size, type, content, content_hash, created_at, modified_at)
        VALUES (@path, @name, @size, @type, @content, @content_hash, @created_at, @modified_at)
        ON CONFLICT(path) DO UPDATE SET
        name = @name,
        size = @size,
        type = @type,
        content = @content,
        content_hash = @content_hash,
        created_at = @created_at,
        modified_at = @modified_at
    `);
    stmt.run(metadata);
};

/**
 * Build a fingerprint from file size + mtime.
 * Fast (stat-only, no file read) and sufficient for change detection.
 */
export const buildContentHash = (size: number, modifiedAt: string): string => {
    return `${size}:${modifiedAt}`;
};

/**
 * Get the stored content_hash for a file path. Returns null if not tracked.
 */
export const getStoredHash = (filePath: string): string | null => {
    const row = db.prepare("SELECT content_hash FROM files WHERE path = ?").get(filePath) as
        { content_hash: string } | undefined;
    return row?.content_hash ?? null;
};

/**
 * Get all tracked file paths from the database.
 * Used to detect deleted files (paths in DB but not on disk).
 */
export const getAllTrackedPaths = (): Set<string> => {
    const rows = db.prepare("SELECT path FROM files").all() as { path: string }[];
    return new Set(rows.map(r => r.path));
};

/**
 * Delete a file record from SQLite by path. Returns the file ID for vector cleanup.
 */
export const deleteFileByPath = (filePath: string): string | null => {
    const row = db.prepare("SELECT id FROM files WHERE path = ?").get(filePath) as
        { id: number } | undefined;
    if (!row) return null;

    db.prepare("DELETE FROM files WHERE path = ?").run(filePath);

    try {
        db.prepare("DELETE FROM files_fts WHERE file_id = ?").run(row.id);
    } catch {
        // FTS table may not exist
    }

    return String(row.id);
};

/**
 * Backfill the content_hash for an existing file row.
 * Used during migration — old rows have empty hash but are already embedded.
 */
export const backfillHash = (filePath: string, hash: string): void => {
    db.prepare("UPDATE files SET content_hash = ? WHERE path = ?").run(hash, filePath);
};

/**
 * Wipe all data from the files table and the FTS5 index.
 * Used by `scan --fresh` to start from a clean slate.
 */
export const clearAllFiles = (): void => {
    db.exec("DELETE FROM files");
    db.exec("DELETE FROM files_fts");
};
