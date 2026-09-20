"""Fixtures for the bot handler tests."""

import pytest

from .fakes import FakeBackend, FakeContext


@pytest.fixture(scope="session", autouse=True)
def create_schema():
    """No database here.

    Shadows the suite-wide schema fixture: these tests drive the handlers
    against fakes, so making them wait on Postgres would only make them slower
    and able to fail for reasons that have nothing to do with the bot.
    """
    yield


@pytest.fixture
def backend():
    return FakeBackend()


@pytest.fixture
def make_context():
    def _make(backend, args=None):
        return FakeContext(backend, args)

    return _make
