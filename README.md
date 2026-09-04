# Package Health Checker

Look up any npm package and see its real health at a glance: known vulnerabilities (with severity and CVE numbers where available), end-of-life-style metadata, and links to full advisory details — the same diagnostic work I do professionally, built as a standalone tool.

## Tech stack

**Backend**
- **FastAPI** (Python) — async REST API
- **httpx** — outbound calls to the npm registry and OSV.dev
- **Ruff** — linting and formatting

**Frontend**
- **React** (Vite) — search UI
- **Tailwind CSS v4** — styling, sharing a fall/Halloween theme (light/dark) with my [portfolio site](https://shelbyannkelley.com)
- **ESLint** (`@eslint-react/eslint-plugin`, `eslint-plugin-jsx-a11y-x`, `eslint-plugin-import-x`) + **Prettier**

**Tooling**
- **Husky + lint-staged** — auto-lints and formats staged files (both languages) before every commit
- **commitlint** — enforces conventional commit messages
- **Docker + docker-compose** — one-command local setup for both services

## What it does

- Pulls live package metadata (description, latest version, last publish date) from the npm registry
- Cross-references known vulnerabilities via [OSV.dev](https://osv.dev), including severity and CVE numbers where available
- Deduplicates and reconciles vulnerability data reported by multiple advisory sources into a single accurate view
- Supports scoped packages (e.g. `@angular/common`)
- Validates and rate-limits input to prevent the API from being used as a relay for abuse

## Running it locally

**With Docker (recommended — one command, both services):**

```bash
docker compose up
```

Backend: `http://localhost:8000` · Frontend: `http://localhost:5173`

**Without Docker:**

Backend:
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

Frontend:
```bash
cd frontend
npm install
npm run dev
```

## Example

```
GET /package/lodash
```

```json
{
  "name": "lodash",
  "description": "Lodash modular utilities.",
  "latest_version": "4.18.1",
  "last_publish_date": "2026-04-01T21:01:20.458Z",
  "vulnerability_count": 10,
  "vulnerabilities": [
    {
      "id": "GHSA-35jh-r3h4-6jhm",
      "summary": "Command Injection in lodash",
      "severity": "HIGH",
      "cve": "CVE-2021-23337",
      "advisory_url": "https://osv.dev/vulnerability/GHSA-35jh-r3h4-6jhm"
    }
  ]
}
```

## Linting & formatting

```bash
# Backend (from backend/, with venv active)
ruff check .
ruff format .

# Frontend (from frontend/)
npx eslint .
npx prettier --check .
```

## Status

Live demo deployment (AWS Lambda + API Gateway, publicly reachable) is in progress. Fully functional locally today via Docker.
