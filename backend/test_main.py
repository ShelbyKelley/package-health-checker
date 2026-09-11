import json

import httpx
import pytest
import respx
from fastapi.testclient import TestClient
from httpx import Response

from main import MAX_PACKAGE_NAME_LENGTH, NPM_REGISTRY_URL, OSV_API_URL, app


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


def osv_split_by_version(request):
    """Mimics OSV: an unscoped query returns every vuln ever reported;
    a version-scoped query returns only the ones affecting that version."""
    body = json.loads(request.content)
    if "version" in body:
        return Response(200, json={"vulns": [VULN_STILL_IN_LATEST]})
    return Response(200, json={"vulns": [VULN_FIXED_IN_LATEST, VULN_STILL_IN_LATEST]})


@respx.mock
def test_lowercase_package_name_works(client):
    respx.get(f"{NPM_REGISTRY_URL}/examplepkg").mock(
        return_value=Response(200, json=LOWERCASE_PACKAGE_BODY)
    )
    osv_route = respx.post(OSV_API_URL).mock(
        return_value=Response(200, json={"vulns": []})
    )

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

    response = client.get("/package/examplepkg")

    assert response.status_code == 502
