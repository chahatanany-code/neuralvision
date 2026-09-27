"""
NEURALVISION // MODEL FACTORY
Central registry. Add new model classes here — the rest of the system
picks them up automatically via load_model().
"""

from typing import Dict, Type
from models.base_model import VisionModel
from models.classifier import DummyClassifier

# ─── Registry ────────────────────────────────────────────────────────────────
_REGISTRY: Dict[str, Type[VisionModel]] = {
    "DummyClassifier": DummyClassifier,
    # "ONNXClassifier": ONNXClassifier,       # add when ready
    # "TFLiteClassifier": TFLiteClassifier,   # add when ready
    # "MobileNetV2": MobileNetV2Classifier,   # add when ready
}


def load_model(name: str, **kwargs) -> VisionModel:
    """
    Instantiate and load a model by registry name.
    Raises ValueError for unknown names.
    """
    if name not in _REGISTRY:
        available = ", ".join(_REGISTRY.keys())
        raise ValueError(
            f"Unknown model '{name}'. Available: {available}"
        )
    model = _REGISTRY[name](**kwargs)
    model.load()
    return model


def list_models():
    return list(_REGISTRY.keys())
