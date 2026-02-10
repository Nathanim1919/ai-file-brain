-- enable FTS5 virtual table
CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
    name,
    path,
    content,
    file_id UNINDEXED,
    tokenize="porter unicode61"
);

-- initial population
INSERT INTO files_fts (rowid, name, path, content, file_id)
SELECT id, name, path, content, id
FROM files;


-- insert trigger
CREATE TRIGGER files_fts_insert AFTER INSERT ON files BEGIN
    INSERT INTO files_fts (rowid, name, path, content, file_id)
    VALUES (new.id, new.name, new.path, new.content, new.id);
END;

-- update trigger
CREATE TRIGGER files_fts_update AFTER UPDATE ON files BEGIN
    DELETE FROM files_fts WHERE file_id = old.id;
    INSERT INTO files_fts (rowid, name, path, content, file_id)
    VALUES (new.id, new.name, new.path, new.content, new.id);
END;

-- delete trigger
CREATE TRIGGER files_fts_delete AFTER DELETE ON files BEGIN
    DELETE FROM files_fts WHERE file_id = old.id;
END;
