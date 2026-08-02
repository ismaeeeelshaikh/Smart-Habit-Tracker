# UI/UX Design Brief
## AI-Powered Personal Time Intelligence Platform

**Companion to:** PRD, Implementation Spec, TRD, UX Flow Document
**Author:** Senior UI/UX Designer (draft)
**Purpose:** Define the visual identity and interaction texture of the product, precise enough that an AI app builder can implement it consistently across every screen listed in the UX Flow Document without inventing style decisions ad hoc.

---

## 1. Design Concept (Read This First)

The product's entire value proposition is a single idea: **your week is mostly full, but the gaps matter more than the blocks.** Every other habit app visualizes the habit. This one visualizes the *time around* the habit — free slots are the hero, not streaks or checkmarks.

**Signature element:** A **Week Strip** — a slim, literal horizontal grid representing Mon–Sun, rendered as solid blocks for committed time and open (outlined, lightly tinted) space for free time. This is not a decorative chart; it is the actual data, rendered directly. It appears at the top of Dashboard, Schedule, and Stats, and functions as the product's visual signature — the one element a user would recognize this app by, the way a boarding pass or a subway map is recognizable by its own grammar.

This concept drives every decision below: the palette separates "committed" from "free" as the primary color contrast (not decoration), and the type system treats time values (durations, timestamps) as data worth setting distinctly from prose.

**Explicitly rejected directions** (so the builder doesn't default to them): no warm-cream-and-terracotta editorial look, no near-black-with-acid-accent tech-startup look, no dense newspaper/hairline broadsheet look. This product is a daily-use utility, not a marketing page — it should feel closer to a well-made transit or weather app than a landing page.

---

## 2. Color Palette

Cool, paper-light base (not warm cream) — because the product's job is clarity and low visual noise for something checked many times a day, not editorial warmth.

| Token | Hex | Usage |
|---|---|---|
| `--color-bg` | `#F6F7F5` | App background (cool off-white, slightly desaturated) |
| `--color-surface` | `#FFFFFF` | Cards, modals, input fields |
| `--color-ink` | `#1B211F` | Primary text (near-black, slight green undertone to avoid pure gray flatness) |
| `--color-ink-muted` | `#5C645F` | Secondary text, placeholders, helper copy |
| `--color-border` | `#DADDD7` | Hairline borders, dividers |
| `--color-committed` | `#3B4266` | **Busy/committed time blocks** (deep slate blue — the "full" state) |
| `--color-free` | `#17A085` | **Free/available time** (teal-green — the "open" state, used for the Week Strip's open segments, primary CTA buttons, and success confirmations) |
| `--color-free-tint` | `#E4F5F0` | Light tint of `--color-free`, used as background fill for free-slot cards/sections |

**Priority colors** (separate semantic system — used only for goal priority badges, never for committed/free state, to avoid ambiguity):

| Token | Hex | Usage |
|---|---|---|
| `--color-priority-high` | `#D64550` | High priority badge |
| `--color-priority-medium` | `#E8A33D` | Medium priority badge |
| `--color-priority-low` | `#4C9F70` | Low priority badge |

**Status colors** (system feedback, distinct from the above two systems):

| Token | Hex | Usage |
|---|---|---|
| `--color-error` | `#C13B3B` | Error text, error borders |
| `--color-warning-bg` | `#FCF3D9` | Warning banners (e.g., Telegram-not-connected banner) |

**Rule for the builder:** `--color-committed` and `--color-free` are reserved exclusively for representing time state (schedule blocks, Week Strip, free-slot cards). Do not reuse them for unrelated UI decoration (e.g., don't make a random icon teal just because it's the accent) — that dilutes the one piece of color-coding that's actually meaningful in this product.

---

## 3. Typography

Three roles, chosen because this product's content is genuinely bimodal: conversational UI copy (goals, labels, buttons) and precise numeric/time data (durations, timestamps, stats). The type system should make that distinction visible, not flatten it into one face.

| Role | Typeface | Reasoning |
|---|---|---|
| **Display** (page titles, section headers, Week Strip day labels) | **Space Grotesk** (600/700 weight) | A grotesk with slightly unusual, geometric character in its numerals — appropriate for a product whose core object is literally a grid of time. Used sparingly: page titles and the Week Strip only, never body paragraphs. |
| **Body** (all UI copy, form labels, buttons, descriptions) | **Inter** (400/500 weight) | Highly legible at small sizes, neutral enough to not compete with Space Grotesk, well-supported variable font with good number rendering. |
| **Utility/Data** (durations, timestamps, stats numbers, reminder times, Telegram command syntax) | **IBM Plex Mono** (400/500 weight) | Monospacing makes columns of times/durations align visually (e.g., a list of reminders at "9:00 AM", "10:30 AM") — reinforces the product's precision-about-time identity, and doubles as the natural face for displaying `/commands`. |

**Type scale (base 16px):**

| Level | Size / Line-height | Weight | Face |
|---|---|---|---|
| Display XL (page hero, rare) | 32px / 40px | 700 | Space Grotesk |
| Display (page titles: "Schedule", "Goals") | 24px / 32px | 600 | Space Grotesk |
| Heading (card/section titles) | 18px / 26px | 600 | Space Grotesk |
| Body | 15px / 22px | 400 | Inter |
| Body medium (button labels, form labels) | 15px / 22px | 500 | Inter |
| Small / caption (helper text, empty states) | 13px / 18px | 400 | Inter |
| Data (durations, timestamps, stats numbers) | 15px / 22px | 500 | IBM Plex Mono |
| Data large (stats percentages on Stats screen) | 28px / 34px | 500 | IBM Plex Mono |

**Rule for the builder:** any number representing a time, duration, or percentage renders in IBM Plex Mono, everywhere in the app, no exceptions — this consistency is what makes the "data feels precise" impression work.

---

## 4. Layout Direction

### 4.1 Grid & spacing
- Base spacing unit: **4px**, scale: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64
- Content max-width on desktop: **960px**, centered, with generous side margins (minimum 24px) — this is a utility app, not a dense data-terminal; don't cram edge-to-edge.
- Card border-radius: **10px** (soft but not pill-shaped — matches the "calm utility" register, not playful, not severe)
- Card border: 1px `--color-border`, no drop shadows by default (shadows reserved only for modals/overlays, to keep the base UI flat and calm)

### 4.2 The Week Strip (signature component, spec for builder)
- Horizontal band, 7 equal-width day columns (Mon–Sun), each column height representing a compressed 24-hour range (or a configurable visible window, e.g., 6 AM–11 PM, to avoid wasting vertical space on empty night hours)
- Committed blocks: solid `--color-committed` fill, 6px corner radius, label on hover/tap showing block name + time range
- Free segments: `--color-free-tint` fill with a 1px `--color-free` outline — visually "open," not just "empty" (an unstyled gap would read as missing data, not as available time)
- Day labels above each column in Space Grotesk, 13px, uppercase, letter-spaced
- On Dashboard: Week Strip shows only today, expanded larger, with the current time marked by a thin vertical `--color-ink` line
- On Schedule/Stats: full 7-day Week Strip, more compact per-day height

### 4.3 Page layout patterns
- **Form-heavy screens** (Schedule, Goals onboarding/management): single-column list layout, max-width 640px within the 960px container, so forms don't stretch uncomfortably wide
- **Dashboard**: Week Strip at top (full width within container), followed by a 2-column card grid on desktop (Next Suggested Task + This Week at a Glance side by side), collapsing to single column on mobile
- **Stats**: Week Strip at top, then 3 priority stat blocks in a row (desktop) / stacked (mobile), each using Data Large type for the percentage

---

## 5. Component Style

### 5.1 Buttons
- Primary button: `--color-free` background, white text, 10px radius, 12px/20px padding, 500 weight Inter. Hover: 8% darken. This ties the primary action color directly to the "free/open/go" concept — clicking the primary button always feels like moving toward availability, not just a generic brand color.
- Secondary button: transparent background, 1px `--color-border`, `--color-ink` text
- Destructive action (delete, disconnect): text-only red (`--color-error`) link-style button, not a filled button — destructive actions in this app are all low-frequency and should look deliberately unlike the primary flow (matches the UX doc's inline-confirmation pattern rather than modal dialogs)
- Disabled state: `--color-ink-muted` text, `--color-border` background, no hover effect

### 5.2 Priority badges
Small pill, 4px/10px padding, 12px Inter 500, colored background at 15% opacity of the priority color with full-opacity text of the same color (e.g., High: `#D64550` text on `#D64550` at 15% opacity background) — readable, not shouty.

### 5.3 Inline confirmation (delete/deactivate pattern)
Per the UX Flow Document's global behavior spec: destructive actions expand inline rather than opening a modal. Style: the row transitions to show muted body text ("Remove this block?") with a small red "Yes, remove" text button and a neutral "Cancel" text button, inline, replacing the edit/delete icons temporarily.

### 5.4 Form fields
- 1px `--color-border`, 8px radius, 10px/12px padding, white background
- Focus state: border becomes `--color-free`, 2px, with a subtle `--color-free-tint` glow (box-shadow, 3px spread, low opacity) — **required for accessibility** (visible keyboard focus, per baseline UX quality)
- Error state: border becomes `--color-error`, helper text below in `--color-error`, 13px

### 5.5 Toasts / banners
- Success toast: `--color-free-tint` background, `--color-free` left border accent (4px), `--color-ink` text
- Error toast: light red tint background, `--color-error` left border accent
- Warning banner (e.g., Telegram not connected): `--color-warning-bg` background, no icon needed — the color itself signals "needs attention" without being alarming

### 5.6 Empty states
Per the UX Flow Document's writing guidance (empty states are an invitation to act, not an apology): centered within their container, `--color-ink-muted` body text, a single clear action link/button below in `--color-free`. No illustration/mascot graphics — keep it text-led and calm, consistent with the utility register of the whole product.

---

## 6. Mobile Responsiveness

Breakpoints:
| Name | Width |
|---|---|
| Mobile | < 640px |
| Tablet | 640–959px |
| Desktop | ≥ 960px |

**Mobile-specific rules:**
- Global nav (Dashboard/Schedule/Goals/Reminders/Stats/Settings/Logout) collapses to a **bottom tab bar** with 5 primary items (Dashboard, Schedule, Goals, Stats, Settings), Reminders and Logout accessible via a "More" tab or from within Settings — five items keeps the bottom bar uncluttered on small screens.
- Week Strip on mobile: day columns remain horizontally scrollable within their container rather than shrinking illegibly — never compress the 7 columns below a usable tap-target width; horizontal scroll with a subtle edge-fade is preferable to cramming.
- Two-column layouts (Dashboard cards, Stats priority blocks) stack to single column below 640px.
- Onboarding wizard: step indicator ("Step 1 of 3") becomes more prominent on mobile (since there's no room for a persistent sidebar) — render as a slim progress bar at the very top, sticky.
- Add Block / Add Goal sub-forms: on mobile, open as a full-screen sheet (slide up from bottom) rather than an inline expansion or centered modal, to give form fields enough room.
- Minimum tap target: 44x44px for all interactive elements, per standard mobile accessibility baseline.

---

## 7. UX Principles

1. **Free time is the reward, not the checklist.** Visual weight favors showing what's open, not just what's done. The Week Strip's teal "free" segments should read as more visually inviting than the slate "committed" segments — this is a deliberate hierarchy, not neutral color choice.

2. **Non-punitive tone, always.** Per the UX Flow Document's messaging (e.g., "No worries — see you next time" on Skip), no red error styling or alarming language for a skipped habit. Reserve `--color-error` strictly for actual system errors (failed requests, invalid input) — never for a user choosing "Skip" or "Later." Conflating "you skipped a habit" with "something went wrong" is a tone mistake to explicitly avoid.

3. **Data earns monospace; prose doesn't.** Reinforces the precision identity without making the whole UI feel like a terminal — restraint is what makes the mono treatment meaningful.

4. **One accent color carries meaning.** `--color-free` is used for: primary buttons, free-slot indication, and success states. This consistency means a user learns "teal = good/open/go" once and it holds everywhere — don't introduce a second competing "brand" color for marketing flourishes.

5. **Confirmation without ceremony.** Destructive actions confirm inline (Section 5.3), not via modal — respects that this is a low-stakes, frequently-used utility app where a habit block or goal is easy to re-add, not a one-way door requiring heavy friction.

6. **Calm density.** This app may be opened many times a day (checking free slots, marking tasks). It should never feel like it's trying to hold attention — no gamified animation, no celebratory confetti on "Done," no streak-flame icons. A quiet checkmark and a one-line toast is enough. Motion, where used at all, should be limited to subtle state transitions (button hover, toast slide-in, inline confirm expand) — nothing ambient or decorative, per the "match complexity to the vision" principle: this is a minimal, precision-driven direction, so restraint is the craft, not an afterthought.

---

## 8. Visual References (Stylistic Touchstones, Not to Be Copied Directly)

These are named as directional reference points for tone and precision — the builder should not reproduce any specific screen, layout, or copyrighted visual asset from them, only the underlying design sensibility:

- **Transit/wayfinding systems** (e.g., the visual clarity of a subway map or boarding pass) — for the Week Strip's literal, legible grid treatment of time.
- **Weather apps with minimal, data-forward dashboards** — for the calm, glanceable, low-ceremony card layout on Dashboard and Stats.
- **Modern developer/analytics tools with monospace data treatment** — for the specific choice of IBM Plex Mono on numeric values, and the flat, hairline-bordered card style without heavy shadows.

The product should feel like **a well-made utility you check between commitments, not a lifestyle brand app** — closer in spirit to a train departures board than to a wellness app's soft illustration style.

---

## 9. Implementation Notes for the AI App Builder

- Define all tokens in Section 2 and the type scale in Section 3 as CSS custom properties / Tailwind theme extensions at the project root — do not hardcode hex values or font sizes inline in components.
- Build the Week Strip as a single reusable component (per Section 4.2) since it appears on 3 different screens (Dashboard, Schedule, Stats) with different size/density configurations — do not reimplement it per page.
- Cross-reference the UX Flow Document for exact screen-by-screen component usage (which buttons, which empty states, which confirmation patterns appear where) — this brief defines *how things look*, the UX Flow Document defines *where and when they appear*. Where the two could be read as conflicting, the UX Flow Document's interaction behavior takes precedence and this brief's styling should be applied on top of it, not used to override specified behavior.
- Accessibility floor (non-negotiable, per Section 5.4 and Section 6): visible keyboard focus states on every interactive element, minimum 44px mobile tap targets, and color is never the *only* signal (e.g., priority badges use both color and text label "High/Medium/Low," not color alone).

---

*This brief should be treated as the single source of truth for visual styling. Any screen or component described in the UX Flow Document that isn't explicitly styled here should be built using the closest analogous pattern from Sections 5–6, not a new ad hoc style.*
