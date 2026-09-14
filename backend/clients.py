"""Upstream I/O and input validation: everything that talks to npm's
registry, npm's download-counts API, or OSV.dev, plus the request
validation that guards those calls. Kept separate from main.py so the route
layer (HTTP concerns) and the upstream-client layer (npm/OSV concerns) don't
live in one growing file.
"""

import logging
import re
from typing import Any
from urllib.parse import quote

import httpx
from fastapi import HTTPException

from models import Vulnerability

logger = logging.getLogger(__name__)

NPM_REGISTRY_URL = "https://registry.npmjs.org"
NPM_DOWNLOADS_URL = "https://api.npmjs.org/downloads/point/last-week"
OSV_API_URL = "https://api.osv.dev/v1/query"
OSV_ADVISORY_URL = "https://osv.dev/vulnerability"

# Lambda bills wall-clock time, so a hung upstream is a cost problem as much
# as a latency one. Keep the ceiling well under the function's own timeout.
UPSTREAM_TIMEOUT = httpx.Timeout(5.0, connect=3.0)

# npm's own documented maximum package-name length.
MAX_PACKAGE_NAME_LENGTH = 214

# No documented npm limit on version-string length; this just bounds what we
# forward into an OSV query body.
MAX_VERSION_LENGTH = 100

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


def validate_package_name(package_name: str) -> None:
    # Length is checked separately from the pattern: the scope and name parts
    # are each unbounded in the regex, so only an explicit total-length cap
    # actually bounds the input.
    if len(package_name) > MAX_PACKAGE_NAME_LENGTH:
        raise HTTPException(status_code=400, detail="Package name is too long")
    if not PACKAGE_NAME_PATTERN.match(package_name):
        raise HTTPException(status_code=400, detail="Invalid package name")


def validate_version(version: str) -> None:
    if not version or len(version) > MAX_VERSION_LENGTH:
        raise HTTPException(status_code=400, detail="Invalid version")


def _version_sort_key(version: str) -> tuple[int, int, int]:
    # A display-only ordering (major, minor, patch as plain ints), not a
    # real semver comparator — used purely to pick the highest of several
    # literal "fixed" values OSV already reported for one advisory. This is
    # NOT range-matching: OSV, not this, decides whether an advisory applies
    # to a given version. Malformed segments sort as 0 rather than raising.
    parts = version.split(".")[:3]
    numbers = []
    for part in parts:
        digits = "".join(ch for ch in part if ch.isdigit())
        numbers.append(int(digits) if digits else 0)
    numbers.extend([0] * (3 - len(numbers)))
    return (numbers[0], numbers[1], numbers[2])


def extract_fixed_version(vuln: dict[str, Any]) -> str | None:
    # Surfaces OSV's own reported fix versions verbatim; it does not
    # reconcile which range applies to a particular installed version (that
    # logic was tried once, got complex and buggy, and was deliberately
    # removed elsewhere in this project). When an advisory lists more than
    # one "fixed" event across ranges, the highest is shown, since that's
    # the single upgrade that clears every range at once. None means OSV
    # lists no fix at all for this advisory in the npm ecosystem.
    fixed_versions = [
        event["fixed"]
        for affected in vuln.get("affected", [])
        if affected.get("package", {}).get("ecosystem") == "npm"
        for rng in affected.get("ranges", [])
        if rng.get("type") == "SEMVER"
        for event in rng.get("events", [])
        if "fixed" in event
    ]
    return max(fixed_versions, key=_version_sort_key) if fixed_versions else None


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
        fixed_version=extract_fixed_version(vuln),
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


def extract_license(data: dict[str, Any]) -> str | None:
    license_field = data.get("license")
    if isinstance(license_field, str):
        return license_field
    if isinstance(license_field, dict):
        return license_field.get("type")
    return None


async def fetch_weekly_downloads(
    client: httpx.AsyncClient, package_name: str
) -> int | None:
    # A pure enrichment signal, not core data: npm's downloads API doesn't
    # cover every package (scoped packages, very new packages), so a miss
    # here degrades to "unknown" instead of failing the whole lookup.
    encoded_name = quote(package_name, safe="")
    try:
        response = await client.get(f"{NPM_DOWNLOADS_URL}/{encoded_name}")
        response.raise_for_status()
        downloads = response.json().get("downloads")
        return downloads if isinstance(downloads, int) else None
    except (httpx.HTTPError, ValueError) as exc:
        logger.info("Weekly download count unavailable for %s: %s", package_name, exc)
        return None


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
