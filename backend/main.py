import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated

import httpx
from fastapi import FastAPI, HTTPException, Path, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError

from clients import (
    REGISTRY_UNUSABLE,
    UPSTREAM_TIMEOUT,
    extract_license,
    fetch_package_metadata,
    fetch_weekly_downloads,
    get_vulnerabilities,
    validate_package_name,
    validate_version,
)
from models import (
    ErrorResponse,
    PackageHealth,
    ServiceStatus,
    VersionVulnerabilities,
)

logger = logging.getLogger(__name__)


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


@app.get("/", response_model=ServiceStatus, tags=["meta"])
def read_root() -> ServiceStatus:
    return ServiceStatus(message="Package Health Checker API is running")


@app.get(
    "/package/{package_name:path}/vulnerabilities",
    response_model=VersionVulnerabilities,
    tags=["packages"],
    summary="Check whether one exact installed version has known vulnerabilities",
    responses={
        400: {
            "model": ErrorResponse,
            "description": "Package name or version failed validation",
        },
        502: {"model": ErrorResponse, "description": "OSV was unusable"},
    },
)
async def get_package_vulnerabilities(
    request: Request,
    package_name: Annotated[
        str, Path(description="Exact npm package name; case-sensitive.")
    ],
    version: Annotated[str, Query(description="Exact installed version to check.")],
) -> VersionVulnerabilities:
    # Deliberately lean: no npm registry call, so an audit of many
    # dependencies costs one OSV request each instead of two upstream calls.
    # There's no existence check, so an unpublished version and a clean one
    # both come back "not vulnerable" rather than 404 — the caller already
    # has the version from its own manifest and isn't asking us to confirm it.
    # Registered ahead of the plain "/package/{package_name:path}" route
    # below: that route's :path converter is greedy enough to swallow
    # "/vulnerabilities" too, so route order here is load-bearing.
    validate_package_name(package_name)
    validate_version(version)

    client: httpx.AsyncClient = request.app.state.http_client
    vulnerabilities = await get_vulnerabilities(client, package_name, version=version)

    return VersionVulnerabilities(
        package_name=package_name,
        version=version,
        vulnerable=bool(vulnerabilities),
        vulnerabilities=vulnerabilities,
    )


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

    weekly_downloads = await fetch_weekly_downloads(client, package_name)

    # These all come from the same npm document already fetched above, so
    # reading them costs nothing extra — but the per-version manifest isn't
    # in every test fixture or every real package, so it's optional. Checked
    # by membership, not truthiness: a real manifest with zero dependencies
    # is an empty-but-present dict, which is falsy but not missing.
    versions = data.get("versions")
    has_version_manifest = isinstance(versions, dict) and latest_version in versions
    latest_manifest = versions[latest_version] if has_version_manifest else {}

    try:
        return PackageHealth(
            name=name,
            description=data.get("description"),
            latest_version=latest_version,
            last_publish_date=last_publish_date,
            latest_version_vulnerable=latest_version_vulnerable,
            vulnerability_count=len(vulnerabilities),
            vulnerabilities=vulnerabilities,
            license=extract_license(data),
            maintainers_count=(
                len(data["maintainers"]) if "maintainers" in data else None
            ),
            dependency_count=(
                len(latest_manifest.get("dependencies", {}))
                if has_version_manifest
                else None
            ),
            deprecated=bool(latest_manifest.get("deprecated")),
            weekly_downloads=weekly_downloads,
        )
    except ValidationError as exc:
        # Registry fields that don't fit the schema (an unparseable publish
        # date, say) are still an upstream problem, not a server fault.
        logger.warning("npm metadata for %s failed validation: %s", package_name, exc)
        raise HTTPException(status_code=502, detail=REGISTRY_UNUSABLE) from exc
