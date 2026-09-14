import pytest


@pytest.fixture
def anyio_backend():
    # Pin to asyncio (not trio) — anyio is already a FastAPI/httpx dependency,
    # so this uses what's already installed instead of adding pytest-asyncio.
    return "asyncio"
