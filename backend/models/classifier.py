"""
NEURALVISION // DUMMY CLASSIFIER
A fast, dependency-free classifier that fulfils the VisionModel contract
and drives the telemetry pipeline without requiring a real model file.

Replace with ONNXClassifier / TFLiteClassifier / PyTorchClassifier when ready.
"""

import time
import random
import numpy as np
from typing import Any, Dict, List

from models.base_model import VisionModel


class DummyClassifier(VisionModel):
    """
    Synthetic classifier for development / demo mode.
    Simulates realistic inference timing and class probabilities.
    NOT a trained model — clearly marked throughout.
    """

    _CLASSES: List[str] = [
        "background",
        "person",
        "vehicle",
        "animal",
        "object",
    ]

    def __init__(self, classes: List[str] = None):
        self._classes = classes or self._CLASSES
        self._loaded = False
        self._call_count = 0
        # Slowly drift the dominant class to simulate a real stream
        self._drift_state = [1.0 / len(self._classes)] * len(self._classes)

    # ─── Abstract properties ────────────────────────────────────────────────
    @property
    def name(self) -> str:
        return "DummyClassifier"

    @property
    def version(self) -> str:
        return "0.1.0-dev"

    @property
    def input_size(self):
        return (224, 224)

    @property
    def num_classes(self) -> int:
        return len(self._classes)

    @property
    def class_names(self) -> List[str]:
        return self._classes

    @property
    def precision(self) -> str:
        return "FP32"

    @property
    def is_loaded(self) -> bool:
        return self._loaded

    # ─── Lifecycle ──────────────────────────────────────────────────────────
    def load(self) -> None:
        # Simulate a short load delay
        time.sleep(0.1)
        self._loaded = True

    # ─── Pipeline ───────────────────────────────────────────────────────────
    def preprocess(self, frame: np.ndarray) -> np.ndarray:
        """Resize + normalise BGR frame to (1, 224, 224, 3) float32."""
        import cv2
        resized = cv2.resize(frame, self.input_size)
        rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)
        normalised = rgb.astype(np.float32) / 255.0
        return np.expand_dims(normalised, axis=0)

    def predict(self, tensor: np.ndarray) -> np.ndarray:
        """
        Synthetic prediction — adds realistic noise + slow drift.
        Returns raw scores (not normalised).
        """
        # Simulate compute time proportional to tensor size
        time.sleep(random.uniform(0.005, 0.018))
        self._call_count += 1

        n = self.num_classes
        # Slowly drift probabilities
        pivot = self._call_count // 120 % n
        base = np.full(n, 0.05)
        base[pivot] = 0.70 + random.gauss(0, 0.05)
        noise = np.random.dirichlet(np.ones(n) * 3) * 0.25
        raw = base + noise
        # Softmax
        e = np.exp(raw - raw.max())
        return e / e.sum()

    def postprocess(self, raw_output: np.ndarray) -> Dict[str, Any]:
        scores = raw_output.tolist()
        idx = int(np.argmax(raw_output))
        return {
            "class_idx": idx,
            "class_name": self._classes[idx],
            "confidence": float(raw_output[idx]),
            "all_scores": scores,
        }

    def metadata(self) -> Dict[str, Any]:
        base = super().metadata()
        base["note"] = "DEMO — synthetic classifier, not a trained model"
        return base
