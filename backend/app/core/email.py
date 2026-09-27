"""Sending mail through Brevo's HTTP API.

Not SMTP: Render's free plan blocks outbound SMTP ports (25, 465, 587), so the
mail goes out over HTTPS instead. With no API key set the message is logged
rather than sent, which is what local development wants.
"""

import logging

import httpx

from app.core.config import settings

log = logging.getLogger(__name__)

BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email"


class EmailError(Exception):
    """The mail service refused or couldn't be reached."""


async def send_email(to: str, subject: str, text: str, html: str) -> None:
    if not settings.BREVO_API_KEY or not settings.EMAIL_FROM:
        log.warning("email not configured; would send to %s: %s\n%s", to, subject, text)
        return

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.post(
                BREVO_SEND_URL,
                headers={"api-key": settings.BREVO_API_KEY, "accept": "application/json"},
                json={
                    "sender": {"name": settings.EMAIL_FROM_NAME, "email": settings.EMAIL_FROM},
                    "to": [{"email": to}],
                    "subject": subject,
                    "textContent": text,
                    "htmlContent": html,
                },
            )
    except httpx.HTTPError as err:
        raise EmailError(f"could not reach the mail service: {err}") from err
    if res.status_code >= 400:
        raise EmailError(f"mail service answered {res.status_code}: {res.text[:200]}")


def _code_email(intro: str, code: str, outro: str) -> str:
    code_style = (
        "font-size:32px;font-weight:bold;letter-spacing:8px;"
        "font-family:monospace;margin:0 0 16px;color:#1F7FB0"
    )
    return (
        '<div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;padding:24px;color:#1F1D1A">'
        f'<p style="font-size:15px;margin:0 0 16px">{intro}</p>'
        f'<p style="{code_style}">{code}</p>'
        f'<p style="font-size:13px;color:#67625A;margin:0">{outro}</p>'
        "</div>"
    )


async def send_password_reset_code(to: str, code: str) -> None:
    minutes = settings.EMAIL_CODE_TTL_MINUTES
    outro = f"It works for {minutes} minutes. If you didn't ask to reset your password, ignore this email."
    text = f"Your Time Intel password reset code is {code}\n\n{outro}"
    html = _code_email("Enter this code to choose a new Time Intel password:", code, outro)
    await send_email(to, f"{code} is your Time Intel reset code", text, html)


async def send_verification_code(to: str, code: str) -> None:
    minutes = settings.EMAIL_CODE_TTL_MINUTES
    text = (
        f"Your Time Intel code is {code}\n\n"
        f"Enter it to finish creating your account. It works for {minutes} minutes.\n\n"
        "If you didn't sign up, you can ignore this email."
    )
    code_style = (
        "font-size:32px;font-weight:bold;letter-spacing:8px;"
        "font-family:monospace;margin:0 0 16px;color:#1F7FB0"
    )
    html = (
        '<div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;padding:24px;color:#1F1D1A">'
        '<p style="font-size:15px;margin:0 0 16px">'
        "Enter this code to finish creating your Time Intel account:</p>"
        f'<p style="{code_style}">{code}</p>'
        '<p style="font-size:13px;color:#67625A;margin:0">'
        f"It works for {minutes} minutes. If you didn't sign up, you can ignore this email.</p>"
        "</div>"
    )
    await send_email(to, f"{code} is your Time Intel code", text, html)
