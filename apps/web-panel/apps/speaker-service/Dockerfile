# syntax=docker/dockerfile:1
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HF_HOME=/models/huggingface \
    TORCH_HOME=/models/torch \
    SPEAKER_MODEL_DIR=/models/speechbrain \
    SPEAKER_PORT=8091 \
    SPEAKER_TORCH_THREADS=2

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends libsndfile1 ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN python -m pip install --no-cache-dir torch==2.9.1 torchaudio==2.9.1 --index-url https://download.pytorch.org/whl/cpu
COPY requirements.txt ./
RUN python -m pip install --no-cache-dir -r requirements.txt

RUN groupadd --system --gid 10002 speaker \
  && useradd --system --uid 10002 --gid speaker --home-dir /models speaker \
  && mkdir -p /models \
  && chown -R speaker:speaker /models

COPY --chown=speaker:speaker server.py ./server.py
USER speaker

EXPOSE 8091
HEALTHCHECK --interval=15s --timeout=3s --start-period=180s --retries=5 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8091/health', timeout=2)"]

CMD ["python", "server.py"]
