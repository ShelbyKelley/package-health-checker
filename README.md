# Package Health Checker

Look up any npm package and see its real health at a glance: known vulnerabilities (with severity and CVE numbers where available), package metadata, and links to full advisory details — the same diagnostic work I do professionally, built as a standalone tool.

**Backend:** deployed and live on AWS Lambda behind API Gateway. **Frontend:** wired into my [portfolio site](https://shelbyannkelley.com/package-health-checker)'s Package Health Checker page, or run standalone locally (see below).

## Tech stack

**Backend**
- **FastAPI** (Python) — async REST API
- **httpx** — outbound calls to the npm registry and OSV.dev
- **Mangum** — adapts the FastAPI app to run on AWS Lambda
- **Ruff** — linting and formatting

**Infrastructure**
- **AWS Lambda** (container image via ECR) — runs the backend
- **AWS API Gateway** (HTTP API) — public HTTPS endpoint, with request throttling to prevent abuse
- Least-privilege IAM execution role (logs only)

**Frontend**
- **React** (Vite) — search UI, with a `PackageHealthCheckerTool` component shared with my [portfolio site](https://github.com/ShelbyKelley/portfolio-site) (synced automatically via a GitHub Actions workflow that opens a PR against that repo whenever this component changes)
- **Tailwind CSS v4** — styling, sharing a fall/Halloween theme (light/dark) with that same portfolio site
- **ESLint** (`@eslint-react/eslint-plugin`, `eslint-plugin-jsx-a11y-x`, `eslint-plugin-import-x`) + **Prettier**

**Tooling**
- **Husky + lint-staged** — auto-lints and formats staged files (both languages) before every commit
- **commitlint** — enforces conventional commit messages
- **Docker + docker-compose** — one-command local setup for both services

## What it does

- Pulls live package metadata (description, latest version, last publish date) from the npm registry
- Cross-references known vulnerabilities via [OSV.dev](https://osv.dev), including severity and CVE numbers where available, with a link to the full advisory for exact affected-version details
- Supports scoped packages (e.g. `@angular/common`)
- Validates package name input (format and length) before it reaches npm or OSV
- Rate-limited at the API Gateway layer to prevent abuse (see Infrastructure above)

## Running it locally

Both the Docker and manual setup need one environment file first:

```bash
echo "VITE_API_URL=http://localhost:8000" > frontend/.env.development
```

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
    // ...9 more, truncated for this example
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

## Deploying backend changes

Changes to the backend need to be rebuilt and pushed to the live Lambda function. ECR login tokens expire every 12 hours, so re-authenticate first if it's been a while:

```bash
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com

cd backend
docker build --provenance=false --platform linux/amd64 -f Dockerfile.lambda -t package-health-checker .
docker tag package-health-checker:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/package-health-checker:latest
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/package-health-checker:latest
aws lambda update-function-code --function-name package-health-checker --image-uri <account-id>.dkr.ecr.us-east-1.amazonaws.com/package-health-checker:latest
```
