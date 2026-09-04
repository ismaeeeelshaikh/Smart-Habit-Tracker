# Build context is the repo root so the scheduler can import the pure-function
# slot_engine/allocator modules from backend/app/services (TRD Section 6.4) —
# shared source, never duplicated.
FROM python:3.11-slim

WORKDIR /app

COPY scheduler/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app /app/backend_src/app
COPY scheduler/ /app/

ENV PYTHONPATH=/app:/app/backend_src
ENV PYTHONUNBUFFERED=1

CMD ["python", "main.py"]
