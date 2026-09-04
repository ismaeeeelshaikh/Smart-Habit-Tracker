FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Contents are copied to /app (not /app/telegram) so the folder name does not
# shadow the python-telegram-bot `telegram` package.
COPY . /app/

ENV PYTHONUNBUFFERED=1

CMD ["python", "main.py"]
