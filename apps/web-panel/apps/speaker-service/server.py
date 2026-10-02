import json
import math
import os
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock

import numpy as np
import torch
import torch.nn.functional as functional
from silero_vad import get_speech_timestamps, load_silero_vad
from speechbrain.inference.speaker import EncoderClassifier


TARGET_RATE = 16_000
MAX_BODY_BYTES = 24_000 * 2 * 10
MIN_SPEECH_SAMPLES = int(TARGET_RATE * 0.5)
MODEL_DIR = Path(os.environ.get("SPEAKER_MODEL_DIR", "/models/speechbrain"))
PORT = int(os.environ.get("SPEAKER_PORT", "8091"))

torch.set_num_threads(max(1, int(os.environ.get("SPEAKER_TORCH_THREADS", "2"))))
torch.set_num_interop_threads(1)


class Models:
    def __init__(self):
        self.lock = Lock()
        self.ready = False
        self.loaded_at = None
        self.vad = None
        self.encoder = None

    def load(self):
        started = time.perf_counter()
        MODEL_DIR.mkdir(parents=True, exist_ok=True)
        self.vad = load_silero_vad(onnx=True)
        self.encoder = EncoderClassifier.from_hparams(
            source="speechbrain/spkrec-ecapa-voxceleb",
            savedir=str(MODEL_DIR / "spkrec-ecapa-voxceleb"),
            run_opts={"device": "cpu"},
        )
        self.ready = True
        self.loaded_at = round((time.perf_counter() - started) * 1000)

    def analyze(self, pcm: bytes, sample_rate: int):
        started = time.perf_counter()
        samples = np.frombuffer(pcm, dtype="<i2").astype(np.float32) / 32768.0
        waveform = torch.from_numpy(samples)
        if sample_rate != TARGET_RATE:
            target_length = max(1, round(waveform.numel() * TARGET_RATE / sample_rate))
            waveform = functional.interpolate(
                waveform.reshape(1, 1, -1), size=target_length, mode="linear", align_corners=False
            ).reshape(-1)
        waveform = waveform[: TARGET_RATE * 10]
        with self.lock, torch.inference_mode():
            timestamps = get_speech_timestamps(
                waveform,
                self.vad,
                sampling_rate=TARGET_RATE,
                min_speech_duration_ms=250,
                min_silence_duration_ms=150,
                speech_pad_ms=100,
                return_seconds=False,
            )
            parts = [waveform[item["start"] : item["end"]] for item in timestamps]
            voiced = torch.cat(parts) if parts else torch.empty(0)
            speech_samples = int(voiced.numel())
            if speech_samples < MIN_SPEECH_SAMPLES:
                return {
                    "speech": False,
                    "speechSeconds": round(speech_samples / TARGET_RATE, 3),
                    "processingMs": round((time.perf_counter() - started) * 1000, 1),
                }
            embedding = self.encoder.encode_batch(voiced.unsqueeze(0)).squeeze().float()
            norm = float(torch.linalg.vector_norm(embedding))
            if not math.isfinite(norm) or norm <= 0:
                raise RuntimeError("ECAPA returned an invalid embedding")
            embedding = embedding / norm
        return {
            "speech": True,
            "speechSeconds": round(speech_samples / TARGET_RATE, 3),
            "processingMs": round((time.perf_counter() - started) * 1000, 1),
            "embedding": [round(float(value), 7) for value in embedding.tolist()],
        }


models = Models()


class Handler(BaseHTTPRequestHandler):
    server_version = "WallDeckSpeaker/1"

    def log_message(self, message, *args):
        print(f"{self.address_string()} {message % args}", flush=True)

    def send_json(self, status: int, body: dict):
        payload = json.dumps(body, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(payload)))
        self.send_header("cache-control", "no-store")
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        if self.path != "/health":
            self.send_json(404, {"error": "not found"})
            return
        self.send_json(200 if models.ready else 503, {
            "status": "ok" if models.ready else "loading",
            "engine": "silero-ecapa",
            "modelReady": models.ready,
            "modelLoadMs": models.loaded_at,
            "torchThreads": torch.get_num_threads(),
        })

    def do_POST(self):
        if self.path != "/v1/analyze":
            self.send_json(404, {"error": "not found"})
            return
        if not models.ready:
            self.send_json(503, {"error": "models are loading"})
            return
        try:
            length = int(self.headers.get("content-length", "0"))
            sample_rate = int(self.headers.get("x-sample-rate", "24000"))
            if length <= 0 or length > MAX_BODY_BYTES or length % 2 != 0:
                raise ValueError("invalid PCM body length")
            if sample_rate < 8_000 or sample_rate > 48_000:
                raise ValueError("invalid sample rate")
            pcm = self.rfile.read(length)
            if len(pcm) != length:
                raise ValueError("incomplete PCM body")
            self.send_json(200, models.analyze(pcm, sample_rate))
        except ValueError as error:
            self.send_json(400, {"error": str(error)})
        except Exception as error:
            self.send_json(500, {"error": str(error)})


if __name__ == "__main__":
    models.load()
    print(json.dumps({"event": "models-ready", "loadMs": models.loaded_at}), flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
