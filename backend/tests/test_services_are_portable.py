"""app.services must stay importable by the scheduler container.

TRD Section 6.4 packages slot_engine/allocator as a shared internal module the
`scheduler` image imports directly, rather than duplicating the logic or paying
for a network hop. That image installs neither FastAPI nor SQLAlchemy, so an
innocent-looking `from app.db.models import ...` inside these modules would
break the dispatch loop at runtime — long after CI went green.

This test fails fast instead.
"""

import subprocess
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]

PROBE = """
import sys
# Simulate the scheduler image, where the API's dependencies are absent.
for name in ("sqlalchemy", "fastapi", "pydantic", "pydantic_settings",
             "pydantic_core", "jose", "passlib", "slowapi", "asyncpg", "alembic"):
    sys.modules[name] = None

from datetime import datetime, time
from app.services import GoalSpec, ScheduleEntry, allocate, next_free_slot

entries = [ScheduleEntry(day="mon", label="Work", start=time(9, 0), end=time(17, 0))]
slot = next_free_slot(entries, datetime(2026, 9, 7, 12, 0))
assert slot is not None and slot.duration_minutes == 300
assert allocate(slot.duration_minutes, [GoalSpec("g1", "React", "high", 20)])[0].minutes == 20
print("OK")
"""


def test_services_import_without_the_api_dependencies():
    result = subprocess.run(
        [sys.executable, "-c", PROBE],
        cwd=BACKEND_ROOT,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, (
        "app.services pulled in an API-only dependency, which would break the "
        f"scheduler container:\n{result.stderr}"
    )
    assert "OK" in result.stdout
