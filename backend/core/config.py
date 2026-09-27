"""
NEURALVISION // CORE CONFIG
Centralized configuration — modify here or via environment variables.
"""

import os
from dataclasses import dataclass, field
from typing import Optional, Tuple


@dataclass
class InferenceConfig:
    # Image preprocessing
    image_size: Tuple[int, int] = (224, 224)
    normalize: bool = True
    color_mode: str = "RGB"            # RGB | BGR | GRAY
    frame_skip: int = 0               # 0 = process every frame
    confidence_threshold: float = 0.50

    # Camera / video source
    camera_index: int = 0
    video_source: Optional[str] = None  # path to a file overrides camera

    # Inference worker
    max_buffer_size: int = 16
    inference_timeout_ms: float = 100.0

    # Model
    model_name: str = os.getenv("NV_MODEL_NAME", "DummyClassifier")
    model_path: Optional[str] = os.getenv("NV_MODEL_PATH", None)
    model_version: str = os.getenv("NV_MODEL_VERSION", "0.1.0")
    device: str = os.getenv("NV_DEVICE", "CPU")

    # Classes (comma-separated env or default list)
    _classes_env: str = os.getenv(
        "NV_CLASSES",
        "background,person,vehicle,animal,object"
    )

    @property
    def classes(self):
        return [c.strip() for c in self._classes_env.split(",")]


@dataclass
class ServerConfig:
    host: str = os.getenv("NV_HOST", "0.0.0.0")
    port: int = int(os.getenv("NV_PORT", "8000"))
    cors_origins: list = field(default_factory=lambda: ["*"])
    log_level: str = os.getenv("NV_LOG_LEVEL", "info")
    ws_path: str = "/ws/telemetry"


@dataclass
class BenchmarkConfig:
    warmup_frames: int = 50
    benchmark_frames: int = 5000
    output_path: str = "benchmark_results.json"


# Singletons
inference_config = InferenceConfig()
server_config = ServerConfig()
benchmark_config = BenchmarkConfig()
