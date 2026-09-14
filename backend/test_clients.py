import httpx
import pytest
import respx
from fastapi import HTTPException
from httpx import Response

from clients import (
    MAX_PACKAGE_NAME_LENGTH,
    MAX_VERSION_LENGTH,
    NPM_DOWNLOADS_URL,
    NPM_REGISTRY_URL,
    OSV_API_URL,
    extract_fixed_version,
    extract_license,
    fetch_package_metadata,
    fetch_weekly_downloads,
    get_vulnerabilities,
    to_vulnerability,
    validate_package_name,
    validate_version,
)

# Only the get_vulnerabilities/fetch_* tests below are async; this applies
# to the whole module harmlessly since the mark is a no-op on sync tests.
pytestmark = pytest.mark.anyio


@pytest.fixture
async def http_client():
    async with httpx.AsyncClient() as client:
        yield client


# --- validate_package_name -------------------------------------------------


def test_valid_package_names_pass():
    validate_package_name("lodash")
    validate_package_name("@scope/pkg")


def test_invalid_characters_are_rejected():
    with pytest.raises(HTTPException) as exc_info:
        validate_package_name("ex$amplepkg")
    assert exc_info.value.status_code == 400


def test_leading_dot_is_rejected():
    with pytest.raises(HTTPException) as exc_info:
        validate_package_name(".hidden")
    assert exc_info.value.status_code == 400


def test_overlong_name_is_rejected():
    with pytest.raises(HTTPException) as exc_info:
        validate_package_name("a" * (MAX_PACKAGE_NAME_LENGTH + 1))
    assert exc_info.value.status_code == 400


# --- validate_version --------------------------------------------------


def test_valid_version_passes():
    validate_version("4.17.19")


def test_empty_version_is_rejected():
    with pytest.raises(HTTPException) as exc_info:
        validate_version("")
    assert exc_info.value.status_code == 400


def test_overlong_version_is_rejected():
    with pytest.raises(HTTPException) as exc_info:
        validate_version("9" * (MAX_VERSION_LENGTH + 1))
    assert exc_info.value.status_code == 400


# --- extract_license ---------------------------------------------------


def test_extract_license_from_a_plain_string():
    assert extract_license({"license": "MIT"}) == "MIT"


def test_extract_license_from_a_legacy_object_form():
    assert extract_license({"license": {"type": "ISC"}}) == "ISC"


def test_extract_license_missing_is_none():
    assert extract_license({}) is None


# --- to_vulnerability ----------------------------------------------------


def test_to_vulnerability_picks_the_first_cve_alias():
    vuln = to_vulnerability(
        {
            "id": "GHSA-1",
            "summary": "a bug",
            "database_specific": {"severity": "HIGH"},
            "aliases": ["GHSA-2", "CVE-2024-0001", "CVE-2024-0002"],
        }
    )
    assert vuln.cve == "CVE-2024-0001"
    assert vuln.advisory_url.endswith("/GHSA-1")


def test_to_vulnerability_with_no_cve_alias():
    vuln = to_vulnerability({"id": "GHSA-1", "aliases": []})
    assert vuln.cve is None
    assert vuln.summary is None
    assert vuln.severity is None


def test_to_vulnerability_includes_fixed_version():
    vuln = to_vulnerability(
        {
            "id": "GHSA-1",
            "affected": [
                {
                    "package": {"ecosystem": "npm"},
                    "ranges": [
                        {
                            "type": "SEMVER",
                            "events": [{"introduced": "0"}, {"fixed": "4.17.21"}],
                        }
                    ],
                }
            ],
        }
    )
    assert vuln.fixed_version == "4.17.21"


# --- extract_fixed_version -------------------------------------------------


def test_extract_fixed_version_picks_the_highest_across_ranges():
    vuln = {
        "affected": [
            {
                "package": {"ecosystem": "npm"},
                "ranges": [
                    {
                        "type": "SEMVER",
                        "events": [{"introduced": "0"}, {"fixed": "1.2.3"}],
                    },
                    {
                        "type": "SEMVER",
                        "events": [{"introduced": "2.0.0"}, {"fixed": "2.5.0"}],
                    },
                ],
            }
        ]
    }
    assert extract_fixed_version(vuln) == "2.5.0"


def test_extract_fixed_version_none_when_no_fix_exists():
    vuln = {
        "affected": [
            {
                "package": {"ecosystem": "npm"},
                "ranges": [{"type": "SEMVER", "events": [{"introduced": "0"}]}],
            }
        ]
    }
    assert extract_fixed_version(vuln) is None


def test_extract_fixed_version_ignores_non_npm_ecosystems():
    vuln = {
        "affected": [
            {
                "package": {"ecosystem": "PyPI"},
                "ranges": [
                    {"type": "SEMVER", "events": [{"fixed": "9.9.9"}]},
                ],
            }
        ]
    }
    assert extract_fixed_version(vuln) is None


def test_extract_fixed_version_ignores_non_semver_ranges():
    vuln = {
        "affected": [
            {
                "package": {"ecosystem": "npm"},
                "ranges": [
                    {"type": "GIT", "events": [{"fixed": "abc123"}]},
                ],
            }
        ]
    }
    assert extract_fixed_version(vuln) is None


def test_extract_fixed_version_missing_affected_data():
    assert extract_fixed_version({}) is None


# --- get_vulnerabilities -------------------------------------------------


@respx.mock
async def test_get_vulnerabilities_scopes_the_query_to_a_version(http_client):
    route = respx.post(OSV_API_URL).mock(return_value=Response(200, json={"vulns": []}))

    await get_vulnerabilities(http_client, "lodash", version="4.17.19")

    body = route.calls.last.request.content
    assert b'"version":"4.17.19"' in body or b'"version": "4.17.19"' in body


@respx.mock
async def test_get_vulnerabilities_outage_is_a_502(http_client):
    respx.post(OSV_API_URL).mock(side_effect=httpx.ConnectError("boom"))

    with pytest.raises(HTTPException) as exc_info:
        await get_vulnerabilities(http_client, "lodash")
    assert exc_info.value.status_code == 502


@respx.mock
async def test_get_vulnerabilities_unreadable_payload_is_a_502(http_client):
    respx.post(OSV_API_URL).mock(
        return_value=Response(200, json={"vulns": [{"no-id-field": True}]})
    )

    with pytest.raises(HTTPException) as exc_info:
        await get_vulnerabilities(http_client, "lodash")
    assert exc_info.value.status_code == 502


# --- fetch_weekly_downloads ------------------------------------------------


@respx.mock
async def test_fetch_weekly_downloads_success(http_client):
    respx.get(f"{NPM_DOWNLOADS_URL}/lodash").mock(
        return_value=Response(200, json={"downloads": 42})
    )

    assert await fetch_weekly_downloads(http_client, "lodash") == 42


@respx.mock
async def test_fetch_weekly_downloads_degrades_to_none_on_outage(http_client):
    respx.get(f"{NPM_DOWNLOADS_URL}/lodash").mock(
        side_effect=httpx.ConnectError("boom")
    )

    assert await fetch_weekly_downloads(http_client, "lodash") is None


@respx.mock
async def test_fetch_weekly_downloads_degrades_to_none_on_malformed_payload(
    http_client,
):
    respx.get(f"{NPM_DOWNLOADS_URL}/lodash").mock(
        return_value=Response(200, json={"downloads": "not-a-number"})
    )

    assert await fetch_weekly_downloads(http_client, "lodash") is None


# --- fetch_package_metadata ------------------------------------------------


@respx.mock
async def test_fetch_package_metadata_success(http_client):
    respx.get(f"{NPM_REGISTRY_URL}/lodash").mock(
        return_value=Response(200, json={"name": "lodash"})
    )

    data = await fetch_package_metadata(http_client, "lodash")
    assert data["name"] == "lodash"


@respx.mock
async def test_fetch_package_metadata_404(http_client):
    respx.get(f"{NPM_REGISTRY_URL}/nonexistent").mock(return_value=Response(404))

    with pytest.raises(HTTPException) as exc_info:
        await fetch_package_metadata(http_client, "nonexistent")
    assert exc_info.value.status_code == 404


@respx.mock
async def test_fetch_package_metadata_outage_is_a_502(http_client):
    respx.get(f"{NPM_REGISTRY_URL}/lodash").mock(side_effect=httpx.ConnectError("boom"))

    with pytest.raises(HTTPException) as exc_info:
        await fetch_package_metadata(http_client, "lodash")
    assert exc_info.value.status_code == 502


@respx.mock
async def test_fetch_package_metadata_malformed_response_is_a_502(http_client):
    respx.get(f"{NPM_REGISTRY_URL}/lodash").mock(return_value=Response(500))

    with pytest.raises(HTTPException) as exc_info:
        await fetch_package_metadata(http_client, "lodash")
    assert exc_info.value.status_code == 502
