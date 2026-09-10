import re
from urllib.parse import quote

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

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

# Matches an npm package name, with or without an @scope/ prefix, made up
# of letters, digits, hyphens, dots, and underscores. Case-sensitive, and
# capped at 100 characters.
PACKAGE_NAME_PATTERN = re.compile(r"^(@[a-zA-Z0-9-_.]+/)?[a-zA-Z0-9-_.]{1,100}$")


def validate_package_name(package_name: str) -> None:
    if not PACKAGE_NAME_PATTERN.match(package_name):
        raise HTTPException(status_code=400, detail="Invalid package name")


NPM_REGISTRY_URL = "https://registry.npmjs.org"
OSV_API_URL = "https://api.osv.dev/v1/query"
OSV_ADVISORY_URL = "https://osv.dev/vulnerability"


@app.get("/")
def read_root():
    return {"message": "Package Health Checker API is running"}


async def get_vulnerabilities(package_name: str, version: str | None = None):
    query = {"package": {"name": package_name, "ecosystem": "npm"}}
    if version:
        query["version"] = version

    async with httpx.AsyncClient() as client:
        response = await client.post(OSV_API_URL, json=query)

    data = response.json()
    vulns = data.get("vulns", [])

    return [
        {
            "id": vuln["id"],
            "summary": vuln.get("summary"),
            "severity": vuln.get("database_specific", {}).get("severity"),
            "cve": next(
                (
                    alias
                    for alias in vuln.get("aliases", [])
                    if alias.startswith("CVE-")
                ),
                None,
            ),
            "advisory_url": f"{OSV_ADVISORY_URL}/{vuln['id']}",
        }
        for vuln in vulns
    ]


@app.get("/package/{package_name:path}")
async def get_package(package_name: str):
    validate_package_name(package_name)
    encoded_name = quote(package_name, safe="")

    async with httpx.AsyncClient() as client:
        response = await client.get(f"{NPM_REGISTRY_URL}/{encoded_name}")

    if response.status_code == 404:
        raise HTTPException(status_code=404, detail="Package not found")

    data = response.json()

    latest_version = data["dist-tags"]["latest"]
    last_publish_date = data["time"][latest_version]

    vulnerabilities = await get_vulnerabilities(package_name)

    # OSV does the affected-version matching itself, so we don't need to
    # parse/reconcile version ranges on our end: a second query scoped to
    # the latest version tells us exactly which of the vulnerabilities
    # above still affect it.
    latest_version_vulnerable = False
    if vulnerabilities:
        vulnerable_in_latest = await get_vulnerabilities(
            package_name, version=latest_version
        )
        ids_affecting_latest = {vuln["id"] for vuln in vulnerable_in_latest}
        for vuln in vulnerabilities:
            vuln["affects_latest_version"] = vuln["id"] in ids_affecting_latest
        latest_version_vulnerable = bool(vulnerable_in_latest)

    return {
        "name": data["name"],
        "description": data.get("description"),
        "latest_version": latest_version,
        "last_publish_date": last_publish_date,
        "latest_version_vulnerable": latest_version_vulnerable,
        "vulnerability_count": len(vulnerabilities),
        "vulnerabilities": vulnerabilities,
    }
