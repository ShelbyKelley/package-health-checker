import logging
import re
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated, Any
from urllib.parse import quote

import httpx
from fastapi import FastAPI, HTTPException, Path, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError

from models import ErrorResponse, PackageHealth, ServiceStatus, Vulnerability

logger = logging.getLogger(__name__)

NPM_REGISTRY_URL = "https://registry.npmjs.org"
OSV_API_URL = "https://api.osv.dev/v1/query"
OSV_ADVISORY_URL = "https://osv.dev/vulnerability"

# Lambda bills wall-clock time, so a hung upstream is a cost problem as much
# as a latency one. Keep the ceiling well under the function's own timeout.
UPSTREAM_TIMEOUT = httpx.Timeout(5.0, connect=3.0)

# npm's own documented maximum package-name length.
MAX_PACKAGE_NAME_LENGTH = 214

# An npm package name, with or without an @scope/ prefix: letters, digits,
# hyphens, dots, and underscores. Case-sensitive, because the registry is.
# Neither the scope nor the name may start with a dot, which keeps "." and
# ".." out of the path we build against the registry.
PACKAGE_NAME_PATTERN = re.compile(
    r"^(@[a-zA-Z0-9_][a-zA-Z0-9._-]*/)?[a-zA-Z0-9_][a-zA-Z0-9._-]*$"
)

REGISTRY_UNAVAILABLE = "The npm registry is unavailable right now"
REGISTRY_UNUSABLE = "The npm registry returned an unexpected response"
OSV_UNAVAILABLE = "Vulnerability data is unavailable right now"


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # One client for the whole process, so warm Lambda invocations reuse
    # existing TLS connections to npm and OSV instead of renegotiating.
    async with httpx.AsyncClient(timeout=UPSTREAM_TIMEOUT) as client:
        app.state.http_client = client
        yield


app = FastAPI(
    title="Package Health Checker API",
    description=(
        "Looks up an npm package's registry metadata and cross-references it "
        "against known vulnerabilities from OSV.dev."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:4173",
        "https://shelbyannkelley.com",
    ],
    allow_methods=["GET"],
    allow_headers=["*"],
)


def validate_package_name(package_name: str) -> None:
    # Length is checked separately from the pattern: the scope and name parts
    # are each unbounded in the regex, so only an explicit total-length cap
    # actually bounds the input.
    if len(package_name) > MAX_PACKAGE_NAME_LENGTH:
        raise HTTPException(status_code=400, detail="Package name is too long")
    if not PACKAGE_NAME_PATTERN.match(package_name):
        raise HTTPException(status_code=400, detail="Invalid package name")


@app.get("/", response_model=ServiceStatus, tags=["meta"])
def read_root() -> ServiceStatus:
    return ServiceStatus(message="Package Health Checker API is running")


def to_vulnerability(vuln: dict[str, Any]) -> Vulnerability:
    return Vulnerability(
        id=vuln["id"],
        summary=vuln.get("summary"),
        severity=vuln.get("database_specific", {}).get("severity"),
        cve=next(
            (alias for alias in vuln.get("aliases", []) if alias.startswith("CVE-")),
            None,
        ),
        advisory_url=f"{OSV_ADVISORY_URL}/{vuln['id']}",
    )


async def get_vulnerabilities(
    client: httpx.AsyncClient, package_name: str, version: str | None = None
) -> list[Vulnerability]:
    query: dict[str, Any] = {"package": {"name": package_name, "ecosystem": "npm"}}
    if version:
        query["version"] = version

    try:
        response = await client.post(OSV_API_URL, json=query)
        response.raise_for_status()
        data = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning(
            "OSV lookup failed for %s (version=%s): %s", package_name, version, exc
        )
        raise HTTPException(status_code=502, detail=OSV_UNAVAILABLE) from exc

    try:
        return [to_vulnerability(vuln) for vuln in data.get("vulns", [])]
    except (KeyError, TypeError, AttributeError) as exc:
        logger.warning("OSV returned an unreadable advisory for %s", package_name)
        raise HTTPException(status_code=502, detail=OSV_UNAVAILABLE) from exc


async def fetch_package_metadata(
    client: httpx.AsyncClient, package_name: str
) -> dict[str, Any]:
    encoded_name = quote(package_name, safe="")

    try:
        response = await client.get(f"{NPM_REGISTRY_URL}/{encoded_name}")
    except httpx.HTTPError as exc:
        logger.warning("npm registry unreachable for %s: %s", package_name, exc)
        raise HTTPException(status_code=502, detail=REGISTRY_UNAVAILABLE) from exc

    if response.status_code == 404:
        raise HTTPException(status_code=404, detail="Package not found")

    try:
        response.raise_for_status()
        return response.json()
    except (httpx.HTTPError, ValueError) as exc:
        # A malformed or error response from the registry is an upstream
        # problem, not a bad request — don't surface it as a 500.
        logger.warning(
            "npm registry returned %s for %s", response.status_code, package_name
        )
        raise HTTPException(status_code=502, detail=REGISTRY_UNUSABLE) from exc


@app.get(
    "/package/{package_name:path}",
    response_model=PackageHealth,
    tags=["packages"],
    summary="Look up a package's vulnerability history and current status",
    responses={
        400: {"model": ErrorResponse, "description": "Package name failed validation"},
        404: {"model": ErrorResponse, "description": "No such package on npm"},
        502: {"model": ErrorResponse, "description": "npm or OSV was unusable"},
    },
)
async def get_package(
    request: Request,
    package_name: Annotated[
        str, Path(description="Exact npm package name; case-sensitive.")
    ],
) -> PackageHealth:
    validate_package_name(package_name)

    client: httpx.AsyncClient = request.app.state.http_client
    data = await fetch_package_metadata(client, package_name)

    try:
        name = data["name"]
        latest_version = data["dist-tags"]["latest"]
        last_publish_date = data["time"][latest_version]
    except (KeyError, TypeError) as exc:
        logger.warning("npm metadata for %s is missing expected fields", package_name)
        raise HTTPException(status_code=502, detail=REGISTRY_UNUSABLE) from exc

    vulnerabilities = await get_vulnerabilities(client, package_name)

    # OSV does the affected-version matching itself, so we don't need to
    # parse/reconcile version ranges on our end: a second query scoped to
    # the latest version tells us exactly which of the vulnerabilities
    # above still affect it.
    latest_version_vulnerable = False
    if vulnerabilities:
        vulnerable_in_latest = await get_vulnerabilities(
            client, package_name, version=latest_version
        )
        ids_affecting_latest = {vuln.id for vuln in vulnerable_in_latest}
        for vuln in vulnerabilities:
            vuln.affects_latest_version = vuln.id in ids_affecting_latest
        latest_version_vulnerable = bool(vulnerable_in_latest)

    try:
        return PackageHealth(
            name=name,
            description=data.get("description"),
            latest_version=latest_version,
            last_publish_date=last_publish_date,
            latest_version_vulnerable=latest_version_vulnerable,
            vulnerability_count=len(vulnerabilities),
            vulnerabilities=vulnerabilities,
        )
    except ValidationError as exc:
        # Registry fields that don't fit the schema (an unparseable publish
        # date, say) are still an upstream problem, not a server fault.
        logger.warning("npm metadata for %s failed validation: %s", package_name, exc)
        raise HTTPException(status_code=502, detail=REGISTRY_UNUSABLE) from exc
