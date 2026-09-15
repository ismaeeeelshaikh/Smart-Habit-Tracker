from app.dispatch.clients import BackendClient, TelegramSender
from app.dispatch.loop import dispatch_once


async def run_pass() -> int:
    """One dispatch pass. Clients are per-run so a dead connection can't persist."""
    backend = BackendClient()
    sender = TelegramSender()
    try:
        return await dispatch_once(backend, sender)
    finally:
        await backend.aclose()
        await sender.aclose()
