"""Response schemas for the public API.

These exist so the endpoint's shape is declared rather than implied by a dict
literal: FastAPI validates responses against them and publishes them as the
OpenAPI schema at /docs, which is also what makes the frontend's expectations
checkable.
"""

from datetime import datetime

from pydantic import BaseModel, Field


class Vulnerability(BaseModel):
    id: str = Field(description="Advisory identifier, usually a GHSA id.")
    summary: str | None = Field(
        default=None, description="One-line description, when the advisory has one."
    )
    severity: str | None = Field(
        default=None,
        description="Advisory-reported severity, e.g. LOW/MODERATE/HIGH/CRITICAL.",
    )
    cve: str | None = Field(
        default=None, description="First CVE alias, when the advisory has one."
    )
    advisory_url: str = Field(description="Link to the advisory's page on OSV.dev.")
    fixed_version: str | None = Field(
        default=None,
        description=(
            "Highest version OSV reports as fixing this advisory in the npm "
            "ecosystem, taken verbatim from the advisory. Null when OSV lists "
            "no fix. Not verified against the installed version's actual "
            "range; see advisory_url for that."
        ),
    )
    affects_latest_version: bool = Field(
        default=False,
        description=(
            "Whether this advisory still applies to the latest published version. "
            "Determined by OSV, not by range-matching on our side."
        ),
    )


class PackageHealth(BaseModel):
    name: str
    description: str | None = None
    latest_version: str
    last_publish_date: datetime
    latest_version_vulnerable: bool = Field(
        description=(
            "Whether the latest published version has any known vulnerability — "
            "the 'is it safe to install today?' answer."
        )
    )
    vulnerability_count: int = Field(
        description="Total advisories ever reported, not only those still unfixed."
    )
    vulnerabilities: list[Vulnerability]
    license: str | None = Field(
        default=None, description="SPDX license identifier, when the registry has one."
    )
    maintainers_count: int | None = Field(
        default=None,
        description="Number of maintainers listed on the registry entry.",
    )
    dependency_count: int | None = Field(
        default=None,
        description="Number of runtime dependencies of the latest version.",
    )
    deprecated: bool = Field(
        default=False,
        description="Whether the latest version carries an npm deprecation notice.",
    )
    weekly_downloads: int | None = Field(
        default=None,
        description=(
            "Weekly download count from the npm download-counts API. Null "
            "when that API was unreachable or has no data for this package — "
            "a soft failure that never fails the whole request."
        ),
    )


class VersionVulnerabilities(BaseModel):
    package_name: str
    version: str
    vulnerable: bool = Field(
        description="Whether this exact version has any known vulnerability."
    )
    vulnerabilities: list[Vulnerability] = Field(
        description=(
            "Advisories affecting this exact version, as determined by OSV. "
            "Each entry's affects_latest_version field is not computed here "
            "and should be ignored."
        )
    )


class ServiceStatus(BaseModel):
    message: str


class ErrorResponse(BaseModel):
    detail: str
