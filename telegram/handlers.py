"""Command handlers.

Every handler runs behind the unlinked-user gate (App Flow Document Section
12.10) — an unlinked chat gets one clear sentence instead of a confusing empty
result from each command in turn.
"""

import logging
import re
from datetime import datetime, timedelta

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.constants import ParseMode
from telegram.ext import ContextTypes, ConversationHandler

import formatting as fmt
from api_client import BackendError, NotLinked
from config import settings

log = logging.getLogger(__name__)

# /add walks name -> date -> time -> recurrence, one question at a time.
ASK_LABEL, ASK_DATE, ASK_TIME, ASK_RECURRENCE = range(4)

CODE_PATTERN = re.compile(r"^[A-Z2-9]{8}$")

ACTION_APPENDIX = {
    "done": "✅ Marked as done — nice work!",
    "later": "⏳ Snoozed — I'll check in again later.",
    "skipped": "❌ Skipped. No worries — see you next time.",
}


def action_keyboard(reminder_id: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        [
            [
                InlineKeyboardButton("✅ Done", callback_data=f"status:done:{reminder_id}"),
                InlineKeyboardButton("⏳ Later", callback_data=f"status:later:{reminder_id}"),
                InlineKeyboardButton("❌ Skip", callback_data=f"status:skipped:{reminder_id}"),
            ]
        ]
    )

# Accepts what people actually type: "9:30 pm", "9pm", "21:30", "09:30".
TIME_FORMATS = ("%I:%M %p", "%I:%M%p", "%I %p", "%I%p", "%H:%M", "%H.%M")


def parse_time_input(raw: str) -> "datetime.time | None":
    """Read a time the way a person writes one, or return None.

    The app shows 12-hour times everywhere, so demanding 24-hour input here
    made the one place the user types a time the only place disagreeing with
    the rest of the product.
    """
    text = " ".join(raw.strip().lower().split())
    # "9:30pm" and "9:30 p.m." are the same intent.
    text = text.replace(".", "").replace("a m", "am").replace("p m", "pm")

    for fmt_str in TIME_FORMATS:
        try:
            return datetime.strptime(text.upper(), fmt_str).time()
        except ValueError:
            continue
    return None


def parse_date_input(raw: str, today: "datetime.date") -> "datetime.date | None":
    """YYYY-MM-DD, plus the two words people reach for first."""
    text = raw.strip().lower()
    if text == "today":
        return today
    if text == "tomorrow":
        return today + timedelta(days=1)
    try:
        return datetime.strptime(text, "%Y-%m-%d").date()
    except ValueError:
        return None


def _chat_id(update: Update) -> str:
    return str(update.effective_chat.id)


def _client(context: ContextTypes.DEFAULT_TYPE):
    return context.application.bot_data["backend"]


async def _reply(update: Update, text: str, **kwargs) -> None:
    await update.effective_message.reply_text(text, parse_mode=ParseMode.MARKDOWN, **kwargs)


async def _guard(update: Update, context: ContextTypes.DEFAULT_TYPE) -> bool:
    """True if this chat is linked; otherwise says so and returns False."""
    if await _client(context).is_linked(_chat_id(update)):
        return True
    await update.effective_message.reply_text(
        fmt.NOT_LINKED.format(web_app=settings.WEB_APP_URL)
    )
    return False


async def _try_link(update: Update, context: ContextTypes.DEFAULT_TYPE, code: str) -> None:
    user = update.effective_user
    linked, detail = await _client(context).consume_link_code(
        code=code, chat_id=_chat_id(update), username=user.username if user else None
    )
    if linked:
        await update.effective_message.reply_text(
            "✅ Connected! You'll start receiving reminders here. Send /help to see what I can do."
        )
    else:
        await update.effective_message.reply_text(detail or "That didn't work. Try again.")


# --- commands ---------------------------------------------------------------


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """/start, optionally carrying a link code from the web app's deep link."""
    payload = context.args[0].strip().upper() if context.args else ""
    if payload:
        await _try_link(update, context, payload)
        return

    if await _client(context).is_linked(_chat_id(update)):
        await update.effective_message.reply_text(
            "You're all set. Send /help to see what I can do."
        )
        return

    await update.effective_message.reply_text(
        "Hi! To connect your account, generate a linking code in the app "
        f"({settings.WEB_APP_URL}/settings) and send it to me here."
    )


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Static text — no API call, so it works even when the backend is down."""
    await _reply(update, fmt.HELP)


async def today(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await _guard(update, context):
        return

    client, chat = _client(context), _chat_id(update)
    try:
        blocks = await client.get_as(chat, "/api/schedule/")
        todays = await client.get_as(chat, "/api/slots/free/today")
    except BackendError:
        await update.effective_message.reply_text("Couldn't load that right now. Try again.")
        return

    weekday = fmt.DAY_ORDER[datetime.fromisoformat(todays["date"]).weekday()]
    todays_blocks = [b for b in blocks if b["day_of_week"] == weekday]
    await _reply(update, fmt.format_today(todays_blocks, todays["slots"]))


async def schedule(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await _guard(update, context):
        return

    try:
        blocks = await _client(context).get_as(_chat_id(update), "/api/schedule/")
    except BackendError:
        await update.effective_message.reply_text("Couldn't load that right now. Try again.")
        return

    await _reply(update, fmt.format_week(blocks, settings.WEB_APP_URL))


async def free(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await _guard(update, context):
        return

    try:
        todays = await _client(context).get_as(_chat_id(update), "/api/slots/free/today")
    except BackendError:
        await update.effective_message.reply_text("Couldn't load that right now. Try again.")
        return

    await _reply(update, fmt.format_free(todays["slots"]))


async def next_task(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Same shape as the proactive reminder, buttons included (Section 12.5)."""
    if not await _guard(update, context):
        return

    client, chat = _client(context), _chat_id(update)
    try:
        suggestion = await client.get_as(chat, "/api/slots/next")
    except BackendError:
        await update.effective_message.reply_text("Couldn't load that right now. Try again.")
        return

    text = fmt.format_suggestion(suggestion)
    allocations = suggestion.get("allocations") or []
    if not allocations:
        await update.effective_message.reply_text(text)
        return

    # A tappable suggestion needs a reminder to act on, so create one for the
    # slot we just proposed.
    first = allocations[0]
    try:
        reminder = await client.request_as(
            chat,
            "POST",
            "/api/reminders/",
            json={"goal_id": first["goal_id"], "scheduled_time": first["start"]},
        )
    except BackendError:
        # Still worth showing the suggestion, just without the buttons.
        await update.effective_message.reply_text(text)
        return

    await update.effective_message.reply_text(text, reply_markup=action_keyboard(reminder["id"]))


async def stats(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await _guard(update, context):
        return

    try:
        weekly = await _client(context).get_as(_chat_id(update), "/api/stats/weekly")
    except BackendError:
        await update.effective_message.reply_text("Couldn't load that right now. Try again.")
        return

    await _reply(update, fmt.format_stats(weekly))


def reminder_id_from_reply(message) -> str | None:
    """Recover which reminder a replied-to message was about.

    The id is already in the message's own buttons, so it is read back from
    there rather than kept in a lookup table that a restart would lose. Buttons
    are stripped once a reminder is actioned, which conveniently means an
    already-answered reminder yields nothing and the user is asked instead.
    """
    replied = getattr(message, "reply_to_message", None)
    markup = getattr(replied, "reply_markup", None) if replied else None
    if not markup:
        return None

    for row in getattr(markup, "inline_keyboard", []) or []:
        for button in row:
            data = getattr(button, "callback_data", "") or ""
            if data.startswith("status:"):
                parts = data.split(":", 2)
                if len(parts) == 3:
                    return parts[2]
    return None


async def done_or_skip(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """/done and /skip.

    Acts on the reminder being replied to. Without that context it asks rather
    than guessing (Section 12.6) — marking the wrong task silently is worse than
    asking.
    """
    if not await _guard(update, context):
        return

    message = update.effective_message
    reminder_id = reminder_id_from_reply(message)

    if reminder_id is None:
        await message.reply_text(
            "Which task? Reply to a reminder message, or use /next to see your current suggestion."
        )
        return

    action = "skipped" if (message.text or "").startswith("/skip") else "done"

    try:
        await _client(context).request_as(
            _chat_id(update),
            "PUT",
            f"/api/reminders/{reminder_id}/status",
            json={"status": action},
        )
    except BackendError:
        await message.reply_text("⚠️ Couldn't save that — please try again.")
        return

    await message.reply_text(ACTION_APPENDIX[action])


# --- inline buttons ---------------------------------------------------------


async def on_action_button(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """✅ Done / ⏳ Later / ❌ Skip on a reminder message (Section 12.1)."""
    query = update.callback_query
    await query.answer()

    try:
        _, action, reminder_id = query.data.split(":", 2)
    except ValueError:
        return

    chat = str(query.message.chat_id)
    original = query.message.text or ""

    try:
        await _client(context).request_as(
            chat, "PUT", f"/api/reminders/{reminder_id}/status", json={"status": action}
        )
    except (BackendError, NotLinked):
        # Never fail silently: say so and leave the buttons up to retry.
        await query.edit_message_text(
            f"{original}\n\n⚠️ Couldn't save that — please try again.",
            reply_markup=action_keyboard(reminder_id),
        )
        return

    # Buttons removed so the same reminder can't be double-tapped.
    await query.edit_message_text(f"{original}\n\n{ACTION_APPENDIX[action]}")


# --- /add conversation ------------------------------------------------------


async def add_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    if not await _guard(update, context):
        return ConversationHandler.END

    await update.effective_message.reply_text(
        "What should I remind you about? (/cancel to stop)"
    )
    return ASK_LABEL


async def add_label(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    label = (update.effective_message.text or "").strip()
    if not label:
        await update.effective_message.reply_text("I didn't understand that. Try a short name, like Revise DSA.")
        return ASK_LABEL

    context.user_data["label"] = label[:150]
    await update.effective_message.reply_text(
        "What date? Send today, tomorrow, or a date like 2026-09-10."
    )
    return ASK_DATE


async def add_date(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    raw = update.effective_message.text or ""
    parsed = parse_date_input(raw, datetime.now().date())
    if parsed is None:
        # Re-ask this step only, rather than restarting the flow (Section 12.7).
        await update.effective_message.reply_text(
            "I didn't understand that. Try today, tomorrow, or a date like 2026-09-10."
        )
        return ASK_DATE

    context.user_data["date"] = parsed.isoformat()
    await update.effective_message.reply_text("What time? For example 9:30 PM.")
    return ASK_TIME


async def add_time(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    parsed = parse_time_input(update.effective_message.text or "")
    if parsed is None:
        await update.effective_message.reply_text(
            "I didn't understand that. Try something like 9:30 PM or 21:30."
        )
        return ASK_TIME

    context.user_data["time"] = parsed.strftime("%H:%M:%S")
    await update.effective_message.reply_text("Repeat? Send: none, daily, or weekdays.")
    return ASK_RECURRENCE


async def add_recurrence(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    choice = (update.effective_message.text or "").strip().lower()
    if choice not in {"none", "daily", "weekdays"}:
        await update.effective_message.reply_text(
            "I didn't understand that. Try none, daily, or weekdays."
        )
        return ASK_RECURRENCE

    when = f"{context.user_data['date']}T{context.user_data['time']}"
    label = context.user_data["label"]

    try:
        await _client(context).request_as(
            _chat_id(update),
            "POST",
            "/api/reminders/",
            json={"label": label, "scheduled_time": when, "recurrence_rule": choice},
        )
    except BackendError:
        await update.effective_message.reply_text(
            "Couldn't save that reminder — the time may be in the past. Try /add again."
        )
        context.user_data.clear()
        return ConversationHandler.END

    await update.effective_message.reply_text(fmt.format_reminder_confirmation(label, when))
    context.user_data.clear()
    return ConversationHandler.END


async def add_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data.clear()
    await update.effective_message.reply_text("Cancelled.")
    return ConversationHandler.END


# --- catch-all --------------------------------------------------------------


async def on_plain_text(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """An unlinked chat sending something that looks like a code is linking."""
    text = (update.effective_message.text or "").strip().upper()

    if CODE_PATTERN.match(text) and not await _client(context).is_linked(_chat_id(update)):
        await _try_link(update, context, text)
        return

    if not await _guard(update, context):
        return

    await update.effective_message.reply_text("Not sure what you mean — send /help.")
