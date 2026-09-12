# Ideas

Things this could become. Nothing here is committed to — it is a place to argue
with, so that whatever gets built next is chosen rather than defaulted into.

Ordered by whether it fixes something broken, then by what it would actually
change for someone using this.

---

## Already fixed

Two of these started life on this list. Recording them because how they were
found matters more than that they are done.

- ~~**Reminders set by hand were never delivered.**~~ The dispatcher only ever
  invented suggestions from free slots; anything from `/add` or the Reminders
  screen was written to the database and left there while the bot said
  "✅ Reminder set". Found by reading the dispatch loop to explain how it worked,
  not by a test.
- ~~**`recurrence_rule` was stored and read by nothing.**~~ Daily and weekdays
  were accepted, saved, and silently ignored. Each occurrence is now its own
  row, so answering Monday's reminder does not end the series.
- ~~**Later and Skip did the same thing.**~~ Both recorded an action, both
  bought an hour of quiet, and neither ever came back — so the two buttons
  differed only in wording and in one stats counter. Later now re-dates the
  reminder to the next free slot and clears its delivery stamp, which is what
  brings it back. Noticed by the person using it, not by anyone reading the
  spec it was already written in.

---

## Worth doing next

### Learn when you actually say yes

`completion_logs` already records every Done, Later and Skip with a timestamp.
Nobody reads it back.

That table can already answer: *which hour of the day does this person actually
complete things?* If someone finishes what they start at 9pm and skips
everything suggested at 3pm, the allocator should prefer 9pm.

This is the feature that would make the product feel like it is paying
attention — and it needs **no model at all**, just counting rows. The data is
sitting there.

Worth being careful: adapting too fast turns one bad day into a permanent
opinion. Needs a minimum number of observations before it changes anything.

### Import a timetable instead of typing it

Entering a weekly schedule by hand is the single biggest thing standing between
a new user and the product working. Everything downstream — every slot, every
suggestion — depends on data most people will not sit and type.

An `.ics` import (Google Calendar, university timetables, Outlook) turns five
minutes of form-filling into one file. Onboarding is where this product is
weakest and it is not close.

### A weekly digest, unprompted

`/stats` works but has to be remembered. A Sunday evening message — what you
finished, what you kept skipping, one number against last week — arrives
without being asked, which is the same reason the reminders work.

Cheap: the stats endpoint already returns everything needed.

### Streaks

"6 days in a row." The cheapest motivation mechanic that exists, and the one
most likely to be missed by a product that is otherwise scrupulously neutral
about how you are doing.

Worth keeping honest: a streak that breaks should not be punished with red. The
tone everywhere else is deliberately non-punitive and a streak counter is where
that usually slips.

---

## Interesting, further out

### Energy-aware allocation

Right now a slot is a slot. But a 7am hour and a 10pm hour are not
interchangeable for the person living them. Letting goals carry a hint — *needs
focus* versus *can do tired* — would stop the allocator putting the hardest
thing in the worst hour.

### Deadline-aware goals

"I need 10 hours of this before the 14th." The allocator currently optimises one
slot at a time with no idea that some work has a horizon. Scheduling backwards
from a deadline is a genuinely different and more useful problem — and the one
students actually have.

### Accountability between people

Someone else can see the streak. Everything in this product is currently private
and that is the right default, but shared accountability is the thing that
actually works for a lot of people.

Do this carefully or not at all: it is the one idea here that can make a person
feel worse.

### Web push as a second channel

Telegram is the only delivery route, deliberately. A browser notification would
let someone try the product without linking an account first, which would
shorten the path from "landed on the repo" to "saw it work".

---

## Deliberately out of scope for v1

Listed in the planning documents as Phase 2, and worth leaving there:

- Voice input
- LLM-written weekly reflections
- A "what should I do now" chat interface
- MCP tool layer
- Google Calendar two-way sync
- Gamification beyond streaks

---

## One rule to keep

Whatever gets added, the scheduling stays deterministic. Free-slot detection and
allocation are pure functions with no model in the path, which is why the same
schedule always produces the same answer and why any of it can be tested at all.

Adaptive timing is the interesting case, because it sounds like it breaks that
rule and does not: counting which hours a person completes things in is still
arithmetic. Keep it arithmetic.
