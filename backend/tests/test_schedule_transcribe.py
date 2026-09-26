"""POST /api/schedule/transcribe — describing a week out loud.

The words come back into the text box for the user to check, so this only has
to hand audio to the model and report honestly when it can't. Groq is mocked:
no test here may touch the network.
"""

import httpx
import pytest

from app.ai import groq
from app.ai.groq import AIUnavailable
from app.api.endpoints import schedule as schedule_endpoints
from app.core.config import settings

AUDIO = ("recording.webm", b"not really opus, but bytes", "audio/webm")


def heard(text):
    async def _transcribe(audio, filename, content_type):
        return text

    return _transcribe


class TestEndpoint:
    async def test_the_words_come_back(self, auth_client, monkeypatch):
        monkeypatch.setattr(schedule_endpoints, "transcribe", heard("Monday college 9 to 3"))

        res = await auth_client.post("/api/schedule/transcribe", files={"audio": AUDIO})

        assert res.status_code == 200, res.text
        assert res.json() == {"text": "Monday college 9 to 3"}

    async def test_it_passes_the_recording_through_untouched(self, auth_client, monkeypatch):
        seen = {}

        async def _transcribe(audio, filename, content_type):
            seen.update(audio=audio, filename=filename, content_type=content_type)
            return "ok"

        monkeypatch.setattr(schedule_endpoints, "transcribe", _transcribe)

        await auth_client.post("/api/schedule/transcribe", files={"audio": AUDIO})

        assert seen == {
            "audio": b"not really opus, but bytes",
            "filename": "recording.webm",
            "content_type": "audio/webm",
        }

    async def test_an_empty_recording_never_reaches_the_model(self, auth_client, monkeypatch):
        async def explode(*args):
            raise AssertionError("the model should not have been called")

        monkeypatch.setattr(schedule_endpoints, "transcribe", explode)

        res = await auth_client.post(
            "/api/schedule/transcribe", files={"audio": ("r.webm", b"", "audio/webm")}
        )

        assert res.status_code == 422

    async def test_an_oversized_recording_is_refused(self, auth_client, monkeypatch):
        monkeypatch.setattr(schedule_endpoints, "MAX_AUDIO_BYTES", 10)
        monkeypatch.setattr(schedule_endpoints, "transcribe", heard("never"))

        res = await auth_client.post(
            "/api/schedule/transcribe", files={"audio": ("r.webm", b"x" * 11, "audio/webm")}
        )

        assert res.status_code == 413

    async def test_silence_is_said_out_loud(self, auth_client, monkeypatch):
        monkeypatch.setattr(schedule_endpoints, "transcribe", heard(""))

        res = await auth_client.post("/api/schedule/transcribe", files={"audio": AUDIO})

        assert res.status_code == 422
        assert "couldn't hear anything" in res.json()["detail"]

    async def test_a_voice_outage_is_a_503_the_ui_can_read_out(self, auth_client, monkeypatch):
        async def _transcribe(*args):
            raise AIUnavailable("The model is busy right now. Try again in a minute.")

        monkeypatch.setattr(schedule_endpoints, "transcribe", _transcribe)

        res = await auth_client.post("/api/schedule/transcribe", files={"audio": AUDIO})

        assert res.status_code == 503
        assert res.json()["detail"] == "The model is busy right now. Try again in a minute."

    async def test_it_needs_a_logged_in_user(self, client, monkeypatch):
        monkeypatch.setattr(schedule_endpoints, "transcribe", heard("never"))

        res = await client.post("/api/schedule/transcribe", files={"audio": AUDIO})

        assert res.status_code == 401


class TestGroqTranscribe:
    """The client itself, against a stand-in for Groq's HTTP API."""

    @pytest.fixture
    def groq_answers(self, monkeypatch):
        monkeypatch.setattr(settings, "GROQ_API_KEY", "test-key")
        seen = {}

        def install(status=200, body=None):
            def handle(request: httpx.Request) -> httpx.Response:
                seen["request"] = request
                return httpx.Response(status, json=body if body is not None else {"text": " hello "})

            real = httpx.AsyncClient

            def fake_client(*args, **kwargs):
                kwargs["transport"] = httpx.MockTransport(handle)
                return real(*args, **kwargs)

            monkeypatch.setattr(groq.httpx, "AsyncClient", fake_client)
            return seen

        return install

    async def test_it_sends_the_file_with_the_whisper_model(self, groq_answers):
        seen = groq_answers()

        text = await groq.transcribe(b"audio-bytes", "r.webm", "audio/webm")

        assert text == "hello"
        request = seen["request"]
        assert request.url.path.endswith("/audio/transcriptions")
        assert request.headers["Authorization"] == "Bearer test-key"
        body = request.content
        assert b"audio-bytes" in body
        assert settings.GROQ_TRANSCRIBE_MODEL.encode() in body

    async def test_a_rate_limit_becomes_a_readable_error(self, groq_answers):
        groq_answers(status=429, body={"error": "slow down"})

        with pytest.raises(AIUnavailable, match="busy"):
            await groq.transcribe(b"a", "r.webm", "audio/webm")

    async def test_no_key_means_the_feature_is_off(self, monkeypatch):
        monkeypatch.setattr(settings, "GROQ_API_KEY", "")

        with pytest.raises(AIUnavailable, match="isn't set up"):
            await groq.transcribe(b"a", "r.webm", "audio/webm")
