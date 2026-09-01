import httpx
from fastapi import FastAPI, HTTPException

app = FastAPI()

NPM_REGISTRY_URL = "https://registry.npmjs.org"


@app.get("/")
def read_root():
    return {"message": "Package Health Checker API is running"}


@app.get("/package/{package_name}")
async def get_package(package_name: str):
    async with httpx.AsyncClient() as client:
        response = await client.get(f"{NPM_REGISTRY_URL}/{package_name}")

    if response.status_code == 404:
        raise HTTPException(status_code=404, detail="Package not found")

    data = response.json()

    latest_version = data["dist-tags"]["latest"]
    last_publish_date = data["time"][latest_version]

    return {
        "name": data["name"],
        "description": data.get("description"),
        "latest_version": latest_version,
        "last_publish_date": last_publish_date,
    }
