# Package Health Checker

Look up any npm package and see its real health at a glance: known vulnerabilities (with severity and CVE numbers where available), a health score and grade, and package metadata, or drop in a `package-lock.json` and audit every installed package, transitive dependencies included — the same diagnostic work I do professionally, built as a standalone tool.

**Backend:** deployed and live on AWS Lambda behind API Gateway. **Frontend:** wired into my [portfolio site](https://shelbyannkelley.com/package-health-checker)'s Package Health Checker page, or run standalone locally (see below). The app's own "notes" section explains how the data is sourced and how to read a result; the [case study](https://shelbyannkelley.com/package-health-checker) on my portfolio covers the scoping and trade-off decisions behind it in full.

## Tech stack

**Backend**
- **FastAPI** (Python 3.13) — async REST API, with Pydantic response models so
  the contract is declared and published as an OpenAPI schema at `/docs`
- **httpx** — outbound calls to the npm registry and OSV.dev, over a single
  pooled client so warm Lambda invocations reuse connections
- **Mangum** — adapts the FastAPI app to run on AWS Lambda
- **Ruff** — linting and formatting
- **pytest + respx** — tests with every outbound call mocked

**Infrastructure**
- **AWS Lambda** (container image via ECR) — runs the backend
- **AWS API Gateway** (HTTP API) — public HTTPS endpoint, with request throttling to prevent abuse
- Least-privilege IAM execution role (logs only)

**Frontend**
- **React** (Vite) — search UI, with components shared with my [portfolio site](https://github.com/ShelbyKelley/portfolio-site) (synced automatically via a GitHub Actions workflow that opens a PR against that repo whenever a manifest-listed component changes)
- **Tailwind CSS v4** — styling, sharing a fall/Halloween theme (light/dark) with that same portfolio site
- **React 19 form Actions** (`useActionState`) for the search submit, so the
  pending state and error handling come from the action rather than from
  hand-rolled `loading`/`try`/`finally` bookkeeping
- **Vitest + React Testing Library** — component tests driven through the
  accessible UI (roles and labels), not implementation details
- **ESLint** (`@eslint-react/eslint-plugin`, `eslint-plugin-jsx-a11y-x`, `eslint-plugin-import-x`) + **Prettier**

**Tooling**
- **GitHub Actions** — CI lints, tests, and builds both halves on every push and PR; a separate workflow redeploys the Lambda automatically when backend code changes on `main`
- **Husky + lint-staged** — auto-lints and formats staged files (both languages) before every commit
- **commitlint** — enforces conventional commit messages
- **Docker + docker-compose** — one-command local setup for both services

## What it does

- Pulls live package metadata (description, latest version, last publish date, license, maintainer count, weekly downloads, deprecation status) from the npm registry
- Cross-references known vulnerabilities via [OSV.dev](https://osv.dev), including severity and CVE numbers where available, with a link to the full advisory for exact affected-version details
- Computes a health score and letter grade from open advisories, publish cadence, and maintainer count, as a triage signal rather than a certification
- Audits an npm `package-lock.json` (v2/v3) the way `npm audit` does: every installed package in the tree, transitive dependencies included, at its exact installed version. A package installed at two versions is checked at both. Parsing happens client-side (nothing is uploaded), lookups run six at a time with a live progress count, and the report pages its findings 10 at a time with a patched-version column (OSV's own reported fix, not locally computed) plus JSON/CSV/Markdown export that always covers every finding, whatever page or filter is showing
- Rejects a `package.json` on purpose. It lists version *ranges* (`^4.17.19`), not what's installed, and OSV answers an unparseable range with a plausible but wrong result rather than an error. On a generated lockfile containing known-vulnerable versions, the audit flagged exactly the same 10 packages as `npm audit`, six of them transitive dependencies a `package.json` never lists
- Supports scoped packages (e.g. `@angular/common`)
- Validates package name input (format and length) before it reaches npm or OSV
- Rate-limited at the API Gateway layer to prevent abuse (see Infrastructure above)
- Distinguishes a genuinely missing package from an upstream outage, so a bad day at npm or OSV doesn't read as "package not found"

## Accessibility

The tool is usable without a mouse or a working pair of eyes, which for a
search-and-filter UI mostly comes down to not leaking information through
visual position alone:

- Every control has an accessible name — the package search field, the
  lockfile textarea, and the "advisories per page" select are all labelled
  rather than relying on placeholder or option text
- Every filter is a toggle that exposes `aria-pressed` — the severity pills
  and the audit's "vulnerable only" toggle — so on/off state is announced
  rather than implied by colour. Each keeps a fixed label and changes only
  its pressed state, so a toggle never reads as a different button
- The health verdict is a live region, so the answer to "is this safe?" is
  announced when a new result replaces the previous one. The bare grade
  letter is restated in words, since "A" read aloud on its own means nothing
- Paging and the audit's start and finish announce themselves, since the
  content they describe changes without any other cue. The per-package
  progress bar uses `role="progressbar"` with live values but sits outside
  the live region on purpose, since announcing hundreds of increments would
  drown a screen reader
- Errors (an unreachable API, a throttle, a missing package) use
  `role="alert"`, and the export buttons' decorative arrows are hidden from
  assistive tech
- Per-advisory links are named for the advisory they open, instead of a dozen
  identical "View advisory" links
- Colour contrast meets WCAG AA in both themes: every text pair clears 4.5:1
  (the severity badges are 12px text on a 10% tint of their own colour, which
  is what caps those hues' lightness), and borders that identify a control
  clear 3:1. Verified with an automated axe-core audit (WCAG 2.1 A and AA)
  of both the search result and the audit report, in both themes, with zero
  violations.

## Running it locally

Both the Docker and manual setup need one environment file first. It's
gitignored, so a fresh clone won't have it:

```bash
echo "VITE_API_URL=http://localhost:8000" > frontend/.env.development
```

`npm run build` / `npm run preview` read `frontend/.env.production` instead,
so create that too if you want to exercise a production build locally.

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
  "latest_version_vulnerable": true,
  "vulnerability_count": 10,
  "vulnerabilities": [
    {
      "id": "GHSA-35jh-r3h4-6jhm",
      "summary": "Command Injection in lodash",
      "severity": "HIGH",
      "cve": "CVE-2021-23337",
      "advisory_url": "https://osv.dev/vulnerability/GHSA-35jh-r3h4-6jhm",
      "affects_latest_version": true
    }
    // ...9 more, truncated for this example
  ]
}
```

`latest_version_vulnerable` answers the question most people are actually
asking — "is it safe to install this today?" — while `vulnerabilities` keeps
the full history, each entry flagged with `affects_latest_version`.

### Status codes

| Code | Meaning |
| --- | --- |
| `200` | Package found |
| `400` | Package name failed validation (bad characters, or too long) |
| `404` | No such package in the npm registry |
| `429` | API Gateway throttle tripped |
| `502` | npm or OSV was unreachable or returned something unusable |

## Linting & formatting

```bash
# Backend (from backend/, with venv active)
ruff check .
ruff format .

# Frontend (from frontend/)
npm run lint
npx prettier --check .
```

Some ESLint rules (`no-console`, import ordering) are warnings so they don't
interrupt local work, but CI runs `npm run lint -- --max-warnings 0`, so they
still can't be merged.

## Testing

```bash
# Backend (from backend/, with venv active)
pip install -r requirements-dev.txt
pytest
pytest --cov=main --cov=clients --cov=models --cov-report=term-missing

# Frontend (from frontend/)
npm test
npm run test:coverage
```

Backend tests mock outbound npm/OSV calls with `respx` — no live network
access needed, and nothing in the suite depends on timing or ordering. They
are split to mirror the code: `test_main.py` exercises the routes end to end
through FastAPI's `TestClient`, and `test_clients.py` unit-tests the upstream
client and validation layer directly.

Frontend tests live in `src/components/__tests__/`, render the tool, and drive
it the way a user does — by label, role, and button text — rather than by
test ids or class names. They deliberately cover the cases that are easy to
get silently wrong:

- a missing `VITE_API_URL` at build time, reported instead of requesting
  `undefined/package/...`
- a throttle (429) or upstream outage (502) reported as such, rather than as
  a missing package
- an active filter resetting when a different package is searched
- an audit where **every** lookup fails showing a network error, rather than
  a zeroed-out "Nothing known-vulnerable" report that looks like good news
- exports always covering the full findings set, even while the on-screen
  table is filtered down or on a later page (checked against the real
  downloaded JSON, CSV, and Markdown, not just the button wiring)
- a lockfile audit reaching transitive dependencies, and checking a package
  installed at two versions at **both** (keying by name alone silently drops
  one), while a `package.json` is rejected rather than half-parsed
- lookups never exceeding the concurrency cap, and a slow earlier audit never
  overwriting a newer one

Both suites run near full coverage (backend 100% of lines, frontend about
99%). Coverage output lands in gitignored paths (`backend/.coverage`,
`frontend/coverage/`), so running it locally never dirties the working tree.

## CI/CD

Two GitHub Actions workflows, plus the component sync:

- **`ci.yml`** — on every push and PR: lints, tests, and builds both halves.
  The backend runs on Python 3.13, the version Lambda runs.
- **`deploy-backend.yml`** — after CI passes on `main`: builds the Lambda
  image, pushes it to ECR tagged with the commit SHA, and updates the
  function. Authenticates to AWS with OIDC, so there are no long-lived access
  keys in the repo. It deploys on every green `main` build rather than trying
  to detect whether `backend/` changed — a `workflow_run` event carries no
  commit range, so that check could silently skip a real backend change.
- **`sync-to-portfolio.yml`** — opens a PR against the portfolio repo
  whenever a file listed in `frontend/src/components/sync-manifest.txt`
  changes.

Because images are tagged with the commit SHA rather than `latest`, what's
running in Lambda is always traceable back to the commit that produced it.

The workflows expect these to be configured on the repo — a fork won't deploy
without them:

| Name | Kind | Used for |
| --- | --- | --- |
| `AWS_ACCOUNT_ID` | variable | Building the ECR image URI |
| `DEPLOY_ROLE_ARN` | variable | The OIDC role the deploy assumes |
| `PORTFOLIO_REPO_PAT` | secret | Opening the sync PR on the portfolio repo |

### Deploying the backend by hand

Normally unnecessary — the workflow above handles it. For a manual deploy
(or a rollback to a known-good SHA), note that ECR login tokens expire every
12 hours, so re-authenticate first:

```bash
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com

cd backend
docker build --provenance=false --platform linux/amd64 -f Dockerfile.lambda -t package-health-checker .
docker tag package-health-checker:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/package-health-checker:latest
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/package-health-checker:latest
aws lambda update-function-code --function-name package-health-checker --image-uri <account-id>.dkr.ecr.us-east-1.amazonaws.com/package-health-checker:latest
```

`--provenance=false` is required: modern Docker defaults to a manifest format
Lambda won't accept. Pushing to ECR alone doesn't update the running
function — `update-function-code` is what actually swaps the image.
