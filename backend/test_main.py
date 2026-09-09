import respx
from fastapi.testclient import TestClient
from httpx import Response

from main import NPM_REGISTRY_URL, OSV_API_URL, app

client = TestClient(app)

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


@respx.mock
def test_lowercase_package_name_works():
    respx.get(f"{NPM_REGISTRY_URL}/examplepkg").mock(
        return_value=Response(200, json=LOWERCASE_PACKAGE_BODY)
    )
    respx.post(OSV_API_URL).mock(return_value=Response(200, json={"vulns": []}))

    response = client.get("/package/examplepkg")

    assert response.status_code == 200
    assert response.json()["name"] == "examplepkg"


@respx.mock
def test_mixed_case_package_name_is_accepted_and_looked_up_as_typed():
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
def test_wrong_case_input_404s_without_retry():
    # Lookups are case-sensitive and we don't guess at alternate casing —
    # the caller is expected to pass the exact registered name.
    route = respx.get(f"{NPM_REGISTRY_URL}/Examplepkg").mock(return_value=Response(404))

    response = client.get("/package/Examplepkg")

    assert response.status_code == 404
    assert route.call_count == 1


@respx.mock
def test_unknown_package_404s():
    respx.get(f"{NPM_REGISTRY_URL}/nonexistent-package").mock(
        return_value=Response(404)
    )

    response = client.get("/package/nonexistent-package")

    assert response.status_code == 404


def test_invalid_characters_are_rejected():
    response = client.get("/package/ex$amplepkg")

    assert response.status_code == 400


def test_scoped_package_name_with_uppercase_is_accepted():
    with respx.mock:
        respx.get(f"{NPM_REGISTRY_URL}/@Scope%2FPackage").mock(
            return_value=Response(200, json=SCOPED_PACKAGE_BODY)
        )
        respx.post(OSV_API_URL).mock(return_value=Response(200, json={"vulns": []}))

        response = client.get("/package/@Scope/Package")

    assert response.status_code == 200
    assert response.json()["name"] == "@Scope/Package"
