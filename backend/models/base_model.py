"""
NEURALVISION // BASE MODEL INTERFACE
All concrete models must implement VisionModel.
Swap models by changing the factory — nothing else changes.
"""

from abc import ABC, abstractmethod
from typing import Any, Dict, Optional
import numpy as np


class VisionModel(ABC):
    """
    Abstract contract every NEURALVISION model must satisfy.
    """

    @property
    @abstractmethod
    def name(self) -> str:
        """Human-readable model name."""

    @property
    @abstractmethod
    def version(self) -> str:
        """Model version string."""

    @property
    @abstractmethod
    def input_size(self):
        """(H, W) expected input size."""

    @property
    @abstractmethod
    def num_classes(self) -> int:
        """Number of output classes."""

    @property
    @abstractmethod
    def class_names(self):
        """Ordered list of class names."""

    @property
    @abstractmethod
    def precision(self) -> str:
        """FP32 | FP16 | INT8"""

    @property
    @abstractmethod
    def is_loaded(self) -> bool:
        """True after load() succeeds."""

    @abstractmethod
    def load(self) -> None:
        """Load model weights / graph into memory."""

    @abstractmethod
    def preprocess(self, frame: np.ndarray) -> np.ndarray:
        """Convert raw BGR frame → model input tensor."""

    @abstractmethod
    def predict(self, tensor: np.ndarray) -> np.ndarray:
        """Run raw inference. Returns raw logits / probabilities."""

    @abstractmethod
    def postprocess(self, raw_output: np.ndarray) -> Dict[str, Any]:
        """
        Convert raw output → structured dict:
            {
              "class_idx": int,
              "class_name": str,
              "confidence": float,
              "all_scores": list[float],
            }
        """

    def metadata(self) -> Dict[str, Any]:
        """Return model metadata for the /model endpoint."""
        return {
            "name": self.name,
            "version": self.version,
            "input_size": list(self.input_size),
            "num_classes": self.num_classes,
            "class_names": list(self.class_names),
            "precision": self.precision,
            "is_loaded": self.is_loaded,
            "device": "CPU",
        }
