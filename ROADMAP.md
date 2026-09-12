# Roadmap

Where this goes next, in the order it should be built.

The goal it is working towards: **you tell the app your week in your own words,
and it takes care of the rest** — knowing when you are busy, finding the gaps,
and nudging you to build something in them.

The engine that does the hard part already works. What is left is mostly making
it easy to talk to.

---

## Where things stand

| | |
|---|---|
| Free-slot detection | ✅ built, deterministic, heavily tested |
| Priority allocation | ✅ built |
| Telegram delivery + Done / Later / Skip | ✅ built, verified with a real person |
| Manual and recurring reminders | ✅ built |
| Weekly stats | ✅ built |
| Deployment config | ✅ written, not yet deployed |

**The hard part is finished.** Everything below is a layer on top of it; none of
it requires changing the engine.

---

## The rule that does not bend

```
LLM   →  only at the edges   (understanding input, suggesting habits)
Maths →  always deterministic (finding free time, allocating goals)
```

Free-slot detection and allocation stay pure functions with no model in the
path. Three reasons, and none of them are stylistic:

1. **Same schedule must always give the same answer.** "Are you free at 3pm" is
   not a question that may be answered differently on a Tuesday.
2. **It is testable.** The 400-odd tests in this repo exist because the answer
   is predictable. Nothing about an LLM's output can be pinned that way.
3. **It is free and instant.** No API call, no rate limit, no outage, on the one
   path that runs every five minutes for every user.

The LLM's job is to turn *"I'm at college Mon–Fri 9 to 3"* into rows in a table.
Once they are rows, the existing engine takes over and nothing has changed.

---

## Phase 1 — Fill in a real schedule

**Not code.** The schedule table is empty, so the app believes you are free from
8am to 10pm every day and every suggestion it makes is meaningless.

Nothing below can be judged until this is done, because there is no way to tell
a good suggestion from a bad one against an empty calendar.

**Effort:** ten minutes.

---

## ~~Phase 2 — Reminders for the schedule itself~~ ✅ done

A block can now carry "remind me N minutes before". Off by default, per block,
because a schedule is mostly a record of when *not* to interrupt someone and
turning every block into an alarm would undo that.

This is what makes a timetable useful: every lecture gets its own warning, which
the recurrence rules could never express — they only understand *daily* and
*weekdays*, never "every Monday at 9".

---

## Phase 3 — Describe your week instead of typing it

The largest single source of friction in this product. Everything downstream —
every slot, every suggestion — depends on schedule data that most people will
not sit and enter through a form. The empty table in Phase 1 is the evidence.

```
you:  "Mon to Fri I'm at college 9 to 3, gym Tuesday 6pm,
       I'm usually home by 6:30"

app:  College    Mon–Fri   9:00 AM – 3:00 PM
      Gym        Tue       6:00 PM – 7:00 PM
      Commute    Mon–Fri   3:00 PM – 6:30 PM
      → Save these?  [Yes]  [Edit]
```

**How it works:** the model only ever returns structured rows. It never decides
when you are free — it only writes down what you said.

Three things this must do, or it will cause more work than it saves:

- **Always confirm before saving.** The model will sometimes mishear. A wrong
  block silently entering your schedule poisons every suggestion afterwards,
  and you would have no idea why.
- **Validate before showing.** End after start, no impossible overlaps, times
  inside a real day. Reject bad output rather than passing it on.
- **Degrade politely.** If the API is down or out of quota, say so and fall back
  to the form. The app must never stop working because a third party did.

**Effort:** 3–4 days.
**Needs:** an API key (see Phase 6).

---

## Phase 4 — Suggest habits worth building

Right now you have to know what you want. The app could help:

> "You're an engineering student with free evenings. Most people in your
> position build one of these: 30 min DSA, 20 min aptitude, 15 min reading.
> Want to start with one?"

And break a large goal into something doable daily:

> "Learn DSA" → 30 min a day, starting with arrays

**Effort:** 2 days, best done alongside Phase 3 since both use the same
plumbing.

---

## Phase 5 — Actually deploy it

Right now this runs on one laptop. When the laptop sleeps, reminders stop —
which defeats the entire product.

See [DEPLOYING.md](DEPLOYING.md): Oracle Cloud Always Free, permanently free,
runs the compose file unchanged.

**Do this before showing anyone.** A habit tracker that only works while your
laptop is open is a demo, not a product.

---

## Phase 6 — Things to settle before Phase 3

Small, but each one will cost an evening if left until the middle of the work.

**The API key never goes in a chat message or a commit.** It goes in `.env`,
which git already ignores. Anything pasted into a conversation should be treated
as public and rotated.

**Free tiers have rate limits.** One person testing will not hit them; a public
demo might. Decide now what happens when the quota runs out — the answer should
be "the form still works", not "the app breaks".

**LLM output cannot be tested the way the rest of this can.** Tests must mock
the model and assert on how its output is *handled*: good output saved, bad
output rejected, timeouts survived. Never assert on what the model says.

**There is no backup running.** Phase 5 makes this urgent; personal schedules
are not data to lose casually.

---

## A correction about `.ics` import

An earlier version of this recommended `.ics` import over the conversational
route: no API key, no rate limit, nothing to mishear, most of the benefit for a
fraction of the work.

That advice does not apply here, and it is worth writing down why rather than
quietly deleting it.

`.ics` import assumes the timetable is *already in a calendar*. This one is a
PDF. A PDF does not become calendar entries on its own — every lecture would
have to be typed into Google Calendar by hand first, which is exactly the work
the feature was meant to remove.

| Where the timetable lives | What actually helps |
|---|---|
| Already in a calendar | `.ics` import |
| **A PDF or an image** | **a model that can read it** |

So for this project the conversational route is the right one, and `.ics` stays
a nice-to-have for people who keep their timetable in a calendar already.

---

## Order

```
1. Fill in a real schedule        ten minutes, unblocks judging everything else
2. Schedule reminders             hours, no AI
3. Deploy                         half a day, makes it real
4. Conversational input           3–4 days, removes the biggest friction
5. Habit suggestions              2 days, alongside 4
```

Deployment is third rather than last because until it runs somewhere other than
your laptop, none of the rest is being used enough to know whether it works.
