# Database

PostgreSQL is the target database for the university student learning assistant platform.

The frontend now reads and writes through the local API service first. If the API is unavailable, the screen keeps a static demo fallback so the UI can still render during development.

- `schema.sql`: normalized PostgreSQL tables for accounts, student portal permissions, users, classes, courses, plans, tasks, resources, resource ingestion, knowledge mapping, resource chunks, distilled resource outputs, question attempts, goal modes, tutoring chats, reports, suggestions, and sync events.
- `seed.sql`: university coursework demo dataset matching the current frontend.

Demo login accounts:

| Portal | Username | Demo password | Permission |
| --- | --- | --- | --- |
| Student | `student_demo` | `student123` | student read/write |

The active demo is student-portal only. Legacy teacher/parent demo records were removed from active seed data and current runtime permissions.

Installed local client and data directory after migration:

```powershell
D:\PostgreSQL\16\bin\psql.exe
D:\PostgreSQL\16\data
```

Local database creation after setting `PGPASSWORD` in your current terminal:

```powershell
$env:PGPASSWORD="your-postgres-password"
D:\A3\tools\init-a3-database.ps1
```

The frontend now calls `/api/dashboard?portal=student&account=student_demo`, `/api/auth/login`, `/api/plans`, `/api/goal-modes`, `/api/goal-modes/:modeKey/activate`, and `/api/tasks/:id/toggle`. Resource integration foundation is documented in `docs/资源接入说明.md`. Run the API with:

```powershell
cd D:\A3\frontend
copy .env.example .env
npm run api
```

Local PDF resources are read from `D:\A3\ziyuan`, which is ignored by Git. To refresh database records after adding PDFs:

```powershell
cd D:\A3
node tools\ingest-local-pdf-resources.cjs
```

The importer stores metadata, checksums, page counts, OCR state, resource cards, versions, summaries, and recommendations. It does not copy PDFs or store PDF binaries in PostgreSQL. Current resource APIs include `/api/resources`, `/api/resources/:id`, `/api/resources/:id/file`, `/api/questions`, and `/api/question-attempts`.

Apply a new SQL migration without relying on `psql` in PATH:

```powershell
cd D:\A3
node tools\apply-sql-migration.cjs database\migrations\2026-06-20-local-ocr-pipeline.sql
```

Run incremental OCR for scanned PDFs:

```powershell
cd D:\A3
node tools\ocr-local-pdf-resource.cjs --all-local --pages 1 --max-pages 1 --limit 4
```

OCR progress is stored in `resource_ocr_jobs`; searchable text is stored in `resource_chunks`.

Do not commit database passwords or connection strings with secrets.
