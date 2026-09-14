import json

import httpx
import pytest
import respx
from fastapi.testclient import TestClient
from httpx import Response

from clients import (
    MAX_PACKAGE_NAME_LENGTH,
    NPM_DOWNLOADS_URL,
    NPM_REGISTRY_URL,
    OSV_API_URL,
)
from main import app


@pytest.fixture
def client():
    """Enters the app's lifespan so the shared httpx client exists, the same
    way it does under uvicorn and Mangum."""
    with TestClient(app) as test_client:
        yield test_client


# Synthetic fixture data — not real npm packages. Versions/dates are
# placeholders so these tests never depend on (or drift with) real
# registry state.
LOWERCASE_PACKAGE_BODY = {
    "name": "examplepkg",
    "description": "a synthetic test fixture",
    "dist-tags": {"latest": "0.0.0"},
    "time": {"0.0.0": "2000-01-01T00:00:00.000Z"},
}

MIXED_CASE_PACKAGE_BODY = {
    "name": "MixedCasePkg",
    "description": "a synthetic test fixture with real mixed-case naming",
    "dist-tags": {"latest": "0.0.0"},
    "time": {"0.0.0": "2000-01-01T00:00:00.000Z"},
}

SCOPED_PACKAGE_BODY = {
    "name": "@Scope/Package",
    "dist-tags": {"latest": "0.0.0"},
    "time": {"0.0.0": "2000-01-01T00:00:00.000Z"},
}

VULN_FIXED_IN_LATEST = {
    "id": "GHSA-fixed-0001",
    "summary": "old bug, fixed in a later release",
    "database_specific": {"severity": "LOW"},
    "aliases": [],
}

VULN_STILL_IN_LATEST = {
    "id": "GHSA-current-0001",
    "summary": "still present in the latest release",
    "database_specific": {"severity": "HIGH"},
    "aliases": ["CVE-2099-00001"],
}


def mock_downloads(name="examplepkg", downloads=1000):
    """The download-counts API is a separate host, so every test that
    reaches a full response needs its own mock for it."""
    return respx.get(f"{NPM_DOWNLOADS_URL}/{name}").mock(
        return_value=Response(200, json={"downloads": downloads})
    )


def osv_split_by_version(request):
    """Mimics OSV: an unscoped query returns every vuln ever reported;
    a version-scoped query returns only the ones affecting that version."""
    body = json.loads(request.content)
    if "version" in body:
        return Response(200, json={"vulns": [VULN_STILL_IN_LATEST]})
    return Response(200, json={"vulns": [VULN_FIXED_IN_LATEST, VULN_STILL_IN_LATEST]})


def test_root_reports_the_service_is_running(client):
    # The one endpoint that makes no upstream call, so it answers "is the
    # API itself up?" independently of whether npm or OSV are.
    response = client.get("/")

    assert response.status_code == 200
    assert response.json() == {"message": "Package Health Checker API is running"}


@respx.mock
def test_lowercase_package_name_works(client):
    respx.get(f"{NPM_REGISTRY_URL}/examplepkg").mock(
        return_value=Response(200, json=LOWERCASE_PACKAGE_BODY)
    )
    osv_route = respx.post(OSV_API_URL).mock(
        return_value=Response(200, json={"vulns": []})
    )
    mock_downloads()

    response = client.get("/package/examplepkg")
    body = response.json()

    assert response.status_code == 200
    assert body["name"] == "examplepkg"
    assert body["latest_version_vulnerable"] is False
    # No vulnerabilities at all means there's nothing to check against the
    # latest version, so we shouldn't spend a second OSV call finding out.
    assert osv_route.call_count == 1


@respx.mock
def test_latest_version_vulnerable_when_a_vuln_still_affects_it(client):
    respx.get(f"{NPM_REGISTRY_URL}/examplepkg").mock(
        return_value=Response(200, json=LOWERCASE_PACKAGE_BODY)
    )
    respx.post(OSV_API_URL).mock(side_effect=osv_split_by_version)
    mock_downloads()

    response = client.get("/package/examplepkg")
    body = response.json()

    assert response.status_code == 200
    assert body["latest_version_vulnerable"] is True
    assert body["vulnerability_count"] == 2

    by_id = {vuln["id"]: vuln for vuln in body["vulnerabilities"]}
    assert by_id["GHSA-current-0001"]["affects_latest_version"] is True
    assert by_id["GHSA-fixed-0001"]["affects_latest_version"] is False


@respx.mock
def test_latest_version_not_vulnerable_when_all_vulns_are_fixed(client):
    respx.get(f"{NPM_REGISTRY_URL}/examplepkg").mock(
        return_value=Response(200, json=LOWERCASE_PACKAGE_BODY)
    )
    respx.post(OSV_API_URL).mock(
        side_effect=lambda request: (
            Response(200, json={"vulns": []})
            if "version" in json.loads(request.content)
            else Response(200, json={"vulns": [VULN_FIXED_IN_LATEST]})
        )
    )
    mock_downloads()

    response = client.get("/package/examplepkg")
    body = response.json()

    assert response.status_code == 200
    assert body["latest_version_vulnerable"] is False
    assert body["vulnerability_count"] == 1
    assert body["vulnerabilities"][0]["affects_latest_version"] is False


@respx.mock
def test_mixed_case_package_name_is_accepted_and_looked_up_as_typed(client):
    npm_route = respx.get(f"{NPM_REGISTRY_URL}/MixedCasePkg").mock(
        return_value=Response(200, json=MIXED_CASE_PACKAGE_BODY)
    )
    osv_route = respx.post(OSV_API_URL).mock(
        return_value=Response(200, json={"vulns": []})
    )
    mock_downloads(name="MixedCasePkg")

    response = client.get("/package/MixedCasePkg")

    assert response.status_code == 200
    assert response.json()["name"] == "MixedCasePkg"
    assert npm_route.call_count == 1
    assert osv_route.calls.last.request.content.decode().find('"MixedCasePkg"') != -1


@respx.mock
def test_wrong_case_input_404s_without_retry(client):
    # Lookups are case-sensitive and we don't guess at alternate casing —
    # the caller is expected to pass the exact registered name.
    route = respx.get(f"{NPM_REGISTRY_URL}/Examplepkg").mock(return_value=Response(404))

    response = client.get("/package/Examplepkg")

    assert response.status_code == 404
    assert route.call_count == 1


@respx.mock
def test_unknown_package_404s(client):
    respx.get(f"{NPM_REGISTRY_URL}/nonexistent-package").mock(
        return_value=Response(404)
    )

    response = client.get("/package/nonexistent-package")

    assert response.status_code == 404


def test_invalid_characters_are_rejected(client):
    response = client.get("/package/ex$amplepkg")

    assert response.status_code == 400


def test_scoped_package_name_with_uppercase_is_accepted(client):
    with respx.mock:
        respx.get(f"{NPM_REGISTRY_URL}/@Scope%2FPackage").mock(
            return_value=Response(200, json=SCOPED_PACKAGE_BODY)
        )
        respx.post(OSV_API_URL).mock(return_value=Response(200, json={"vulns": []}))
        mock_downloads(name="@Scope%2FPackage")

        response = client.get("/package/@Scope/Package")

    assert response.status_code == 200
    assert response.json()["name"] == "@Scope/Package"


def test_leading_dot_is_rejected(client):
    # npm itself forbids a leading dot, and rejecting it keeps dot-segments
    # out of the registry path we build. ("." and ".." never reach the
    # handler at all — the URL is path-normalized before routing.)
    response = client.get("/package/.hidden")

    assert response.status_code == 400


def test_overlong_scoped_name_is_rejected(client):
    # The scope segment is unbounded in the pattern, so the explicit
    # length cap is the only thing bounding this input.
    long_scope = "a" * (MAX_PACKAGE_NAME_LENGTH + 1)

    response = client.get(f"/package/@{long_scope}/pkg")

    assert response.status_code == 400


@respx.mock
def test_registry_outage_is_a_502_not_a_500(client):
    respx.get(f"{NPM_REGISTRY_URL}/examplepkg").mock(
        side_effect=httpx.ConnectError("boom")
    )

    response = client.get("/package/examplepkg")

    assert response.status_code == 502


@respx.mock
def test_malformed_registry_payload_is_a_502_not_a_500(client):
    respx.get(f"{NPM_REGISTRY_URL}/examplepkg").mock(
        return_value=Response(200, json={"name": "examplepkg"})
    )

    response = client.get("/package/examplepkg")

    assert response.status_code == 502


@respx.mock
def test_osv_outage_is_a_502_not_a_500(client):
    respx.get(f"{NPM_REGISTRY_URL}/examplepkg").mock(
        return_value=Response(200, json=LOWERCASE_PACKAGE_BODY)
    )
    respx.post(OSV_API_URL).mock(return_value=Response(500))

    response = client.get("/package/examplepkg")

    assert response.status_code == 502


@respx.mock
def test_enrichment_fields_are_surfaced_from_the_npm_payload(client):
    respx.get(f"{NPM_REGISTRY_URL}/examplepkg").mock(
        return_value=Response(
            200,
            json={
                **LOWERCASE_PACKAGE_BODY,
                "license": "MIT",
                "maintainers": [{"name": "a"}, {"name": "b"}],
                "versions": {
                    "0.0.0": {
                        "dependencies": {"leftpad": "^1.0.0"},
                        "deprecated": "use something-else instead",
                    }
                },
            },
        )
    )
    respx.post(OSV_API_URL).mock(return_value=Response(200, json={"vulns": []}))
    mock_downloads(downloads=4200)

    body = client.get("/package/examplepkg").json()

    assert body["license"] == "MIT"
    assert body["maintainers_count"] == 2
    assert body["dependency_count"] == 1
    assert body["deprecated"] is True
    assert body["weekly_downloads"] == 4200


@respx.mock
def test_zero_dependencies_is_a_real_count_not_unknown(client):
    # A package with no runtime dependencies simply omits the key entirely
    # rather than setting it to {} — this must read as 0, not "unknown".
    respx.get(f"{NPM_REGISTRY_URL}/examplepkg").mock(
        return_value=Response(
            200,
            json={**LOWERCASE_PACKAGE_BODY, "versions": {"0.0.0": {}}},
        )
    )
    respx.post(OSV_API_URL).mock(return_value=Response(200, json={"vulns": []}))
    mock_downloads()

    body = client.get("/package/examplepkg").json()

    assert body["dependency_count"] == 0


@respx.mock
def test_missing_enrichment_fields_are_null_not_erroring(client):
    # LOWERCASE_PACKAGE_BODY has no license/maintainers/versions at all —
    # a minimal but real shape for a very old or sparse registry entry.
    respx.get(f"{NPM_REGISTRY_URL}/examplepkg").mock(
        return_value=Response(200, json=LOWERCASE_PACKAGE_BODY)
    )
    respx.post(OSV_API_URL).mock(return_value=Response(200, json={"vulns": []}))
    mock_downloads()

    body = client.get("/package/examplepkg").json()

    assert body["license"] is None
    assert body["maintainers_count"] is None
    assert body["dependency_count"] is None
    assert body["deprecated"] is False


@respx.mock
def test_downloads_outage_degrades_to_null_instead_of_failing(client):
    respx.get(f"{NPM_REGISTRY_URL}/examplepkg").mock(
        return_value=Response(200, json=LOWERCASE_PACKAGE_BODY)
    )
    respx.post(OSV_API_URL).mock(return_value=Response(200, json={"vulns": []}))
    respx.get(f"{NPM_DOWNLOADS_URL}/examplepkg").mock(
        side_effect=httpx.ConnectError("boom")
    )

    response = client.get("/package/examplepkg")

    assert response.status_code == 200
    assert response.json()["weekly_downloads"] is None


@respx.mock
def test_version_vulnerabilities_endpoint_scopes_to_the_exact_version(client):
    osv_route = respx.post(OSV_API_URL).mock(
        return_value=Response(200, json={"vulns": [VULN_STILL_IN_LATEST]})
    )

    response = client.get("/package/examplepkg/vulnerabilities?version=1.0.0")
    body = response.json()

    assert response.status_code == 200
    assert body["package_name"] == "examplepkg"
    assert body["version"] == "1.0.0"
    assert body["vulnerable"] is True
    assert body["vulnerabilities"][0]["id"] == "GHSA-current-0001"
    assert json.loads(osv_route.calls.last.request.content)["version"] == "1.0.0"


@respx.mock
def test_version_vulnerabilities_endpoint_accepts_a_scoped_package(client):
    # Lockfile audits hit this route for every installed package, and scoped
    # names (@babel/core, @types/node) are a large share of a real lockfile.
    # The encoded slash must survive routing ahead of the greedy :path route.
    osv_route = respx.post(OSV_API_URL).mock(
        return_value=Response(200, json={"vulns": []})
    )

    response = client.get("/package/%40babel%2Fcore/vulnerabilities?version=7.24.0")

    assert response.status_code == 200
    assert response.json()["package_name"] == "@babel/core"
    sent = json.loads(osv_route.calls.last.request.content)
    assert sent["package"]["name"] == "@babel/core"
    assert sent["version"] == "7.24.0"


@respx.mock
def test_version_vulnerabilities_endpoint_makes_no_npm_call(client):
    npm_route = respx.get(f"{NPM_REGISTRY_URL}/examplepkg")
    respx.post(OSV_API_URL).mock(return_value=Response(200, json={"vulns": []}))

    response = client.get("/package/examplepkg/vulnerabilities?version=1.0.0")

    assert response.status_code == 200
    assert not npm_route.called


def test_version_vulnerabilities_endpoint_requires_a_version(client):
    response = client.get("/package/examplepkg/vulnerabilities")

    assert response.status_code == 422


def test_version_vulnerabilities_endpoint_rejects_invalid_package_name(client):
    response = client.get("/package/ex$ample/vulnerabilities?version=1.0.0")

    assert response.status_code == 400


@respx.mock
def test_unparseable_publish_date_is_a_502_not_a_500(client):
    respx.get(f"{NPM_REGISTRY_URL}/examplepkg").mock(
        return_value=Response(
            200,
            json={
                "name": "examplepkg",
                "dist-tags": {"latest": "1.0.0"},
                "time": {"1.0.0": "not-a-date"},
            },
        )
    )
    respx.post(OSV_API_URL).mock(return_value=Response(200, json={"vulns": []}))
    mock_downloads()

    response = client.get("/package/examplepkg")

    assert response.status_code == 502
