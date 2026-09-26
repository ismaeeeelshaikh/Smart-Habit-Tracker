"""Break a big goal into steps a session can finish.

"Learn DSA" is not something anyone can start at 5pm on a Tuesday; "Arrays &
two pointers" is. The model proposes an ordered list, code tidies it, and the
user edits and saves it — nothing here is stored.

The model never touches the schedule. A step only changes what the next
suggestion *says* ("DSA — today: Strings"), not when it is sent.
"""

from app.ai.groq import AIUnavailable, complete_json

MIN_STEPS = 3
MAX_STEPS = 15
MAX_STEP_LENGTH = 100
MAX_NOTE_LENGTH = 300

SYSTEM_PROMPT = f"""You break one personal goal into an ordered list of concrete steps.

Return JSON of exactly this shape:
{{"steps": ["Arrays & two pointers", "Strings", "Linked lists"]}}

Rules:
- {MIN_STEPS} to {MAX_STEPS} steps, in the order someone should do them.
- Each step fits in one to a few sessions of the stated length. No step is a
  whole course.
- Each step is a short title, at most {MAX_STEP_LENGTH} characters, naming the
  thing to do or learn. No numbering, no dates, no explanations.
- Respect what the person says they already know: start after it.
- Return only the JSON object."""


def build_prompt(goal_name: str, minutes: int, note: str) -> str:
    return (
        f"Goal: {goal_name}\n"
        f"One session is {minutes} minutes a day.\n"
        f"About me: {note.strip()[:MAX_NOTE_LENGTH] or '(nothing given)'}"
    )


def validate(rows: object) -> list[str]:
    """Short, distinct titles in the order given; at most MAX_STEPS."""
    if not isinstance(rows, list):
        return []
    steps: list[str] = []
    seen: set[str] = set()
    for row in rows:
        title = " ".join(str(row or "").split()).lstrip("-•*0123456789.) ").strip()
        title = title[:MAX_STEP_LENGTH]
        key = title.lower()
        if title and key not in seen:
            seen.add(key)
            steps.append(title)
        if len(steps) == MAX_STEPS:
            break
    return steps


async def propose_steps(goal_name: str, minutes: int, note: str = "") -> list[str]:
    answer = await complete_json(SYSTEM_PROMPT, build_prompt(goal_name, minutes, note))
    steps = validate(answer.get("steps") if isinstance(answer, dict) else None)
    if len(steps) < MIN_STEPS:
        raise AIUnavailable("Couldn't break that goal down. Try a clearer name, or add steps yourself.")
    return steps
