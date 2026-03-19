<p align="center">
  <h1 align="center">🧠 AI File Brain</h1>
  <p align="center">
    <strong>Local AI-powered file assistant — search, understand, and organize your files with AI.</strong>
  </p>
  <p align="center">
    Local-first · Offline · CLI-based · Privacy-respecting
  </p>
</p>

---

AI File Brain is a CLI tool that scans your local files, extracts their content, generates AI embeddings using [Ollama](https://ollama.com), and lets you search them semantically — all without sending a single byte to the cloud.

## ✨ Features

- **Semantic Search** — Find files by meaning, not just keywords. Ask for "machine learning papers" and find your `neural-network-overview.pdf`.
- **Keyword Search** — Blazing-fast FTS5 full-text search with BM25 ranking and highlighted snippets.
- **Smart Scanning** — Recursively scans directories, extracts text from PDFs, DOCX, Markdown, and plain text files. Automatically skips code projects, hidden dirs, and large files.
- **Beautiful CLI** — Branded output with progress bars, spinners, relevance bars, and color-coded results.
- **Setup Wizard** — One command to install Ollama, pull models, and index your files.
- **Fully Offline** — Uses Ollama + `nomic-embed-text` locally. Your files never leave your machine.

## 📦 Tech Stack

| Layer | Technology |
|-------|-----------|
| CLI Framework | [Commander.js](https://github.com/tj/commander.js) |
| Embeddings | [Ollama](https://ollama.com) + `nomic-embed-text` (768d) |
| Vector Store | [LanceDB](https://lancedb.com) |
| Metadata DB | SQLite via [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) |
| Full-Text Search | SQLite FTS5 with BM25 scoring |
| Content Extraction | [pdf-parse](https://www.npmjs.com/package/pdf-parse), [mammoth](https://www.npmjs.com/package/mammoth) |
| Language | TypeScript (ESM) |

## 🚀 Quick Start

### Prerequisites

- **Node.js** ≥ 18
- **Ollama** — the setup wizard can install it for you

### Installation

```bash
git clone https://github.com/Nathanim1919/ai-file-brain.git
cd ai-file-brain
npm install
```

### Configuration

Copy the example config and customize it with your directories:

```bash
cp config.example.json config.json
```

Edit `config.json` to point to the directories you want to index:

```json
{
  "allowedPaths": [
    "/home/youruser/Documents",
    "/home/youruser/Downloads"
  ]
}
```

### First Run

```bash
# Run the setup wizard (installs Ollama, pulls models, scans files)
npm run dev -- setup

# Or step by step:
npm run dev -- scan          # Index your files
npm run dev -- find "query"  # Semantic search
```

## 📖 Commands

| Command | Description |
|---------|-------------|
| `ai setup` | First-time setup wizard — installs Ollama, pulls models, offers to scan |
| `ai scan` | Scan configured directories, extract content, generate embeddings |
| `ai scan --fresh` | Wipe all indexes and rescan from scratch |
| `ai search <query>` | Keyword search using FTS5 full-text index |
| `ai find <query>` | Semantic search using AI vector embeddings |
| `ai stats` | Show index statistics (files, chunks, storage, Ollama status) |

### Examples

```bash
ai scan                          # Index your files
ai scan --fresh                  # Full re-index from scratch
ai search "invoice"              # Fast keyword search
ai find "machine learning papers"  # AI-powered semantic search
ai find "tax documents from 2024"  # Natural language queries work
ai stats                         # Check index health
```

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────┐
│                   CLI Layer                      │
│        (Commander.js + branded UI)               │
├─────────────────────────────────────────────────┤
│              Command Handlers                    │
│     setup · scan · search · find · stats         │
├──────────────────┬──────────────────────────────┤
│   AI Package     │     Scanner Package           │
│  ┌────────────┐  │  ┌────────────────────────┐   │
│  │ Embedding   │  │  │ Walker (recursive)     │   │
│  │ Service     │  │  │ Metadata Extractor     │   │
│  │ Queue       │  │  │ Content Extractor      │   │
│  │ Chunker     │  │  │ (PDF, DOCX, text)      │   │
│  └────────────┘  │  └────────────────────────┘   │
├──────────────────┴──────────────────────────────┤
│                 Data Layer                        │
│   SQLite (metadata + FTS5)  ·  LanceDB (vectors) │
└─────────────────────────────────────────────────┘
          ↕                        ↕
      filebrain.db           data/vectors/
```

graph TB
    subgraph tauri_app [Tauri Desktop App]
        subgraph frontend [Svelte Frontend]
            SearchUI[Search Bar + Results]
            ScanUI[Scan Manager]
            StatsUI[Stats Dashboard]
            SettingsUI[Settings / Folder Picker]
        end
        
        subgraph rust_shell [Rust Shell]
            WindowMgr[Window Manager]
            Lifecycle[App Lifecycle]
            Sidecar[Sidecar Launcher]
        end
    end
    
    subgraph ts_backend [TypeScript API Server]
        API[Express/Hono API]
        Scanner[Scanner Package]
        EmbeddingQ[Embedding Queue]
        VectorRepo[LanceDB Vectors]
        SQLiteDB[SQLite + FTS5]
        OllamaClient[Ollama Client]
    end
    
    subgraph ollama [Ollama]
        EmbedModel[nomic-embed-text]
    end
    
    frontend -->|"HTTP/fetch"| API
    Sidecar -->|"spawns"| ts_backend
    OllamaClient --> ollama

### How Search Works

**Keyword Search (`ai search`):**
Query → FTS5 MATCH → BM25 ranking → results with highlighted snippets

**Semantic Search (`ai find`):**
Query → Ollama embedding → LanceDB cosine similarity → re-ranking (vector score + filename boost + path boost) → results

## 📁 Project Structure

```
ai-file-brain/
├── apps/
│   └── cli/src/
│       ├── index.ts              # CLI entry point + Commander setup
│       └── commands/
│           ├── setup.ts          # First-run wizard
│           ├── scan.ts           # File scanning + embedding
│           ├── search.ts         # FTS5 keyword search
│           ├── find.ts           # Semantic vector search
│           └── stats.ts          # Index statistics
├── packages/
│   ├── ai/
│   │   ├── embedding.service.ts  # Ollama embedding client
│   │   ├── embeddingQueue.ts     # Concurrent embedding scheduler
│   │   ├── chunker.ts           # Text chunking with overlap
│   │   └── ingestionService.ts   # Chunk → embed → store pipeline
│   ├── cli-ui/
│   │   ├── theme.ts             # Colors, icons, layout helpers
│   │   ├── spinner.ts           # Ora spinner wrapper
│   │   └── progress.ts          # Progress bar service
│   ├── repositories/
│   │   └── vector.repository.ts  # LanceDB operations
│   ├── scanner/src/
│   │   ├── walker.ts            # Recursive directory walker
│   │   ├── metadata.ts          # File metadata extraction
│   │   └── extractor.ts         # Content extraction (PDF, DOCX, text)
│   └── search/
│       ├── search.service.ts     # Search orchestration
│       ├── search.repository.ts  # SQLite LIKE queries
│       ├── search.parser.ts      # CLI arg parser
│       └── search.types.ts       # Type definitions
├── data/
│   └── sqlite/
│       └── db.ts                 # SQLite schema + operations
├── config.example.json           # Example configuration
├── package.json
└── tsconfig.json
```

## ⚙️ Configuration

The `config.json` file controls what gets scanned:

| Field | Description |
|-------|-------------|
| `allowedPaths` | Directories to scan for files |
| `allowedExtensions` | File types to index (`.pdf`, `.docx`, `.md`, `.txt`, etc.) |
| `projectMarkerFiles` | Files that indicate a code project — those directories are skipped |
| `ignoredDirs` | Directory names to always skip (`node_modules`, `build`, etc.) |
| `ignoredFiles` | Specific filenames to skip (`.DS_Store`, `thumbs.db`) |

## 🔒 Privacy & Safety

- **100% local** — All processing happens on your machine via Ollama
- **No cloud** — Zero network requests except to localhost Ollama
- **Read-only** — The tool only reads your files; it never modifies, moves, or deletes anything
- **Configurable scope** — You control exactly which directories are scanned

## 🗺️ Roadmap

- [ ] `ai ask` — Natural language Q&A over your files using local LLM
- [ ] `ai organize` — AI-powered file organization suggestions
- [ ] Hybrid search (merge FTS5 + vector results with weighted scoring)
- [ ] File clustering and smart folder suggestions
- [ ] Watch mode (auto-rescan on file changes)
- [ ] Incremental scanning (only re-embed changed files)

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
