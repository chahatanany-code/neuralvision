# NEURALVISION

**Real-Time Edge Computer Vision & Multi-Class Inference**

> *I engineered a real-time computer vision pipeline where machine learning, edge optimization, asynchronous inference, backend streaming, and reactive visualization operate as one system.*

---

## Overview

NEURALVISION is a modular, engineering-focused real-time computer vision platform. It captures frames from a camera or video source, runs neural-network inference, and streams live telemetry to a web dashboard — all in a decoupled, non-blocking pipeline.

```
CAMERA / VIDEO
     │
     ▼
FRAME CAPTURE (CaptureWorker)
     │
     ▼
FRAME BUFFER (bounded queue)
     │
     ▼
INFERENCE (InferenceWorker)
     │
     ├── classification
     ├── confidence
     ├── latency metrics
     └── telemetry packet
              │
              ▼
       FASTAPI BACKEND
              │
              ▼
    WEBSOCKET /ws/telemetry
              │
              ▼
     WEB DASHBOARD (HTML/JS)
```

---

## Architecture

The system is split into three independently deployable layers:

| Layer     | Technology         | Responsibility                               |
|-----------|--------------------|----------------------------------------------|
| **ML**    | Python + NumPy     | Model abstraction, preprocessing, inference  |
| **API**   | FastAPI + Uvicorn  | REST endpoints, WebSocket telemetry stream   |
| **UI**    | HTML/JS/Three.js   | Live dashboard, WebGL viz, GSAP animations   |

---

## Features

- ✅ Decoupled 3-stage pipeline: Capture → Inference → Telemetry
- ✅ Bounded frame buffer with back-pressure (drops frames, never blocks)
- ✅ Configurable frame skipping and preprocessing
- ✅ WebSocket live telemetry at ~30 Hz
- ✅ Automatic demo mode when backend is offline
- ✅ Three.js particle background with mouse parallax
- ✅ Neural network signal propagation visualization
- ✅ Chart.js live FPS and latency charts
- ✅ Latency breakdown: capture / preprocess / inference / postprocess
- ✅ Class distribution tracker
- ✅ Frame buffer monitor
- ✅ Architecture hover-tooltips
- ✅ GSAP scroll animations
- ✅ Benchmarking runner with P95/P99 percentile metrics
- ✅ Swappable model backend (factory + registry pattern)
- ✅ Full OpenAPI docs at `/docs`

---

## Tech Stack

**Backend**
- Python 3.10+
- FastAPI + Uvicorn
- OpenCV (opencv-python-headless)
- NumPy
- Pydantic v2

**Frontend**
- Vanilla HTML + CSS + JS (no build step)
- Three.js r128
- GSAP 3 + ScrollTrigger
- Chart.js 4

---

## Project Structure

```
neuralvision/
│
├── frontend/
│   ├── index.html          ← single-page app entry
│   └── src/
│       ├── style.css       ← full design system
│       └── app.js          ← Three.js · NN canvas · WS · Charts · GSAP
│
├── backend/
│   ├── main.py             ← FastAPI app entry point
│   ├── requirements.txt
│   │
│   ├── api/
│   │   └── routes.py       ← REST endpoints with Pydantic schemas
│   │
│   ├── core/
│   │   ├── config.py       ← all configuration (env-overridable)
│   │   └── logging.py      ← structured colour logger
│   │
│   ├── inference/
│   │   └── engine.py       ← CaptureWorker · InferenceWorker · Engine
│   │
│   ├── models/
│   │   ├── base_model.py   ← VisionModel abstract interface
│   │   ├── classifier.py   ← DummyClassifier (development model)
│   │   └── model_config.py ← factory / registry
│   │
│   ├── telemetry/
│   │   └── websocket.py    ← ConnectionManager + broadcast loop
│   │
│   └── benchmarking/
│       └── runner.py       ← P50/P95/P99 benchmark utility
│
├── model/
│   ├── training/           ← training scripts (add your own)
│   ├── evaluation/         ← evaluation scripts (add your own)
│   └── exported/           ← ONNX / TFLite / SavedModel exports
│
├── docs/
├── .env.example
└── README.md
```

---

## Installation

### Prerequisites

- Python 3.10+
- pip
- A modern browser (Chrome / Firefox / Edge)

No Node.js required — the frontend is pure HTML/JS.

### Backend Setup

```bash
cd backend
pip install -r requirements.txt
```

### Configuration

Copy the environment template:

```bash
cp .env.example .env
```

Edit `.env`:

```env
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000/ws/telemetry

# Optional overrides
NV_MODEL_NAME=DummyClassifier
NV_DEVICE=CPU
NV_CLASSES=background,person,vehicle,animal,object
NV_CONFIDENCE_THRESHOLD=0.5
```

---

## Running the System

### 1. Start the backend

```bash
cd backend
python main.py
```

Or with uvicorn directly:

```bash
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 2. Open the dashboard

Open `frontend/index.html` in your browser.

The dashboard will automatically connect to the WebSocket at `ws://localhost:8000/ws/telemetry`.

If the backend is offline, it switches to **SIMULATION MODE** automatically. When the backend comes back online, it reconnects and switches to **LIVE** mode.

### 3. Camera configuration

By default NEURALVISION uses `cv2.VideoCapture(0)` (your primary webcam).

To use a video file:

```env
NV_VIDEO_SOURCE=path/to/video.mp4
```

If no camera is available, the system generates **synthetic random frames** so the inference pipeline continues to function.

---

## API Documentation

With the backend running, visit:

```
http://localhost:8000/docs
```

### Endpoints

| Method | Path                      | Description                       |
|--------|---------------------------|-----------------------------------|
| GET    | `/api/v1/health`          | System health + engine status     |
| GET    | `/api/v1/model`           | Model metadata                    |
| GET    | `/api/v1/metrics`         | Frame counts, drops               |
| GET    | `/api/v1/config`          | Current inference configuration   |
| PATCH  | `/api/v1/config`          | Update threshold / frame-skip     |
| GET    | `/api/v1/predict/latest`  | Latest inference result (polling) |
| WS     | `/ws/telemetry`           | Real-time telemetry stream        |

---

## WebSocket Protocol

Connect to `ws://localhost:8000/ws/telemetry`.

You will receive JSON messages at up to ~30 Hz:

**Telemetry packet:**

```json
{
  "event": "telemetry",
  "timestamp": 1700000000.0,
  "frame_id": 1284,
  "fps": 28.4,
  "inference_latency_ms": 14.2,
  "preprocessing_ms": 2.1,
  "postprocessing_ms": 0.4,
  "capture_ms": 3.3,
  "confidence": 0.847,
  "class_name": "person",
  "class_idx": 1,
  "all_scores": [0.03, 0.847, 0.07, 0.02, 0.033],
  "device": "CPU",
  "model": "DummyClassifier",
  "dropped_frames": 0,
  "buffer_size": 2,
  "total_processed": 1284,
  "is_demo": false
}
```

**Heartbeat packet** (when no inference data is ready):

```json
{
  "event": "heartbeat",
  "timestamp": 1700000000.0,
  "engine_running": true
}
```

---

## Adding a Real Model

1. Create a new class in `backend/models/` that inherits `VisionModel`:

```python
from models.base_model import VisionModel

class MyONNXClassifier(VisionModel):
    def load(self): ...
    def preprocess(self, frame): ...
    def predict(self, tensor): ...
    def postprocess(self, raw): ...
    # implement all abstract properties
```

2. Register it in `backend/models/model_config.py`:

```python
_REGISTRY = {
    "DummyClassifier": DummyClassifier,
    "MyONNXClassifier": MyONNXClassifier,   # ← add here
}
```

3. Set `NV_MODEL_NAME=MyONNXClassifier` in your `.env`.

No other code changes needed.

---

## Benchmarking

NEURALVISION includes a benchmarking utility that reports **percentile latency** — not just averages, because tail latency matters for real-time systems.

```bash
cd backend
python -m benchmarking.runner --model DummyClassifier --frames 5000 --warmup 50
```

Example output:

```
════════════════════════════════════════════════
  NEURALVISION // BENCHMARK RESULT
════════════════════════════════════════════════
  Model        : DummyClassifier
  Frames       : 5000
  Wall time    : 62.4 s
  Avg FPS      : 80.1

  INFERENCE LATENCY
    Avg        : 11.2 ms
    Median     : 10.8 ms
    P95        : 18.4 ms
    P99        : 22.1 ms
    Min        :  5.1 ms
    Max        : 31.7 ms

  PREPROCESSING  avg 2.1 ms
  POSTPROCESSING avg 0.3 ms
════════════════════════════════════════════════
```

To measure on a real model replace `DummyClassifier` with your registered model name.

### Metrics to measure

| Metric          | Command flag / config                |
|-----------------|--------------------------------------|
| Inference P95   | `--frames 5000`                      |
| FPS             | Measured during benchmark wall time  |
| Memory          | Use `psutil` / OS monitor externally |
| Dropped frames  | `/api/v1/metrics` endpoint           |
| CPU utilization | OS monitor or `psutil` script        |

---

## Configuration Reference

All values in `backend/core/config.py` can be overridden with environment variables:

| Env Variable          | Default        | Description                   |
|-----------------------|----------------|-------------------------------|
| `NV_MODEL_NAME`       | DummyClassifier| Model registry key            |
| `NV_MODEL_PATH`       | None           | Path to weights file          |
| `NV_MODEL_VERSION`    | 0.1.0          | Model version tag             |
| `NV_DEVICE`           | CPU            | CPU / CUDA / CoreML           |
| `NV_CLASSES`          | background,... | Comma-separated class list    |
| `NV_HOST`             | 0.0.0.0        | Server bind address           |
| `NV_PORT`             | 8000           | Server port                   |
| `NV_LOG_LEVEL`        | info           | Logging verbosity             |

---

## Future Improvements (Roadmap)

| # | Feature                   | Status      |
|---|---------------------------|-------------|
| 1 | Lightweight CNN           | In Progress |
| 2 | Model Quantization        | Planned     |
| 3 | ONNX / TFLite Export      | Planned     |
| 4 | GPU Acceleration          | Planned     |
| 5 | Edge Device Deployment    | Planned     |
| 6 | Multi-Camera Inference    | Planned     |
| 7 | Object Detection          | Planned     |
| 8 | Anomaly Detection         | Planned     |
| 9 | Remote Telemetry          | Planned     |
|10 | Edge ↔ Cloud Hybrid       | Planned     |

---

## Security Notes

- No credentials are stored in code — all secrets via environment variables
- CORS is open by default (`*`) — restrict `NV_CORS_ORIGINS` in production
- WebSocket payloads are Pydantic-validated on the backend
- No internal file paths are exposed via the API

---

## License

MIT — see LICENSE file.

---

*NEURALVISION // BUILD 0.1 // EDGE INFERENCE ENGINE*
