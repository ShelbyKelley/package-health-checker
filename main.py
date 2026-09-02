from urllib.parse import quote

import httpx
from fastapi import FastAPI, HTTPException

app = FastAPI()

NPM_REGISTRY_URL = "https://registry.npmjs.org"
OSV_API_URL = "https://api.osv.dev/v1/query"
OSV_ADVISORY_URL = "https://osv.dev/vulnerability"


@app.get("/")
def read_root():
    return {"message": "Package Health Checker API is running"}


async def get_vulnerabilities(package_name: str):
    async with httpx.AsyncClient() as client:
        response = await client.post(
            OSV_API_URL,
            json={"package": {"name": package_name, "ecosystem": "npm"}},
        )

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
    encoded_name = quote(package_name, safe="")

    async with httpx.AsyncClient() as client:
        response = await client.get(f"{NPM_REGISTRY_URL}/{encoded_name}")

    if response.status_code == 404:
        raise HTTPException(status_code=404, detail="Package not found")

    data = response.json()

    latest_version = data["dist-tags"]["latest"]
    last_publish_date = data["time"][latest_version]

    vulnerabilities = await get_vulnerabilities(package_name)

    return {
        "name": data["name"],
        "description": data.get("description"),
        "latest_version": latest_version,
        "last_publish_date": last_publish_date,
        "vulnerability_count": len(vulnerabilities),
        "vulnerabilities": vulnerabilities,
    }
