"""
NEURALVISION // API ROUTES
FastAPI router — all endpoints validated with Pydantic schemas.
"""

import time
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from core.config import inference_config
from core.logging import get_logger

logger = get_logger("api.routes")

router = APIRouter()


# ─── Shared state (injected at startup) ───────────────────────────────────────
# These are set by main.py after engine creation.
_engine = None
_model = None


def set_engine(engine, model):
    global _engine, _model
    _engine = engine
    _model = model


# ─── Schemas ─────────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str
    engine_running: bool
    timestamp: float


class ModelResponse(BaseModel):
    name: str
    version: str
    input_size: list
    num_classes: int
    class_names: list
    precision: str
    is_loaded: bool
    device: str
    note: Optional[str] = None


class MetricsResponse(BaseModel):
    total_processed: int
    total_dropped: int
    engine_running: bool
    buffer_size: int


class ConfigUpdateRequest(BaseModel):
    confidence_threshold: Optional[float] = Field(None, ge=0.0, le=1.0)
    frame_skip: Optional[int] = Field(None, ge=0, le=10)


class ConfigResponse(BaseModel):
    image_size: list
    normalize: bool
    color_mode: str
    frame_skip: int
    confidence_threshold: float
    model_name: str
    model_version: str
    device: str
    classes: list


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/health", response_model=HealthResponse, tags=["system"])
async def health():
    return HealthResponse(
        status="ok",
        engine_running=_engine.stats.running if _engine else False,
        timestamp=time.time(),
    )


@router.get("/model", response_model=ModelResponse, tags=["model"])
async def model_info():
    if _model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    return ModelResponse(**_model.metadata())


@router.get("/metrics", response_model=MetricsResponse, tags=["system"])
async def metrics():
    if _engine is None:
        raise HTTPException(status_code=503, detail="Engine not running")
    return MetricsResponse(
        total_processed=_engine._inference_worker._processed
        if _engine._inference_worker
        else 0,
        total_dropped=_engine._capture_worker.dropped
        if _engine._capture_worker
        else 0,
        engine_running=_engine.stats.running,
        buffer_size=_engine._frame_buffer.qsize() if _engine else 0,
    )


@router.get("/config", response_model=ConfigResponse, tags=["system"])
async def get_config():
    cfg = inference_config
    return ConfigResponse(
        image_size=list(cfg.image_size),
        normalize=cfg.normalize,
        color_mode=cfg.color_mode,
        frame_skip=cfg.frame_skip,
        confidence_threshold=cfg.confidence_threshold,
        model_name=cfg.model_name,
        model_version=cfg.model_version,
        device=cfg.device,
        classes=cfg.classes,
    )


@router.patch("/config", response_model=ConfigResponse, tags=["system"])
async def update_config(body: ConfigUpdateRequest):
    cfg = inference_config
    if body.confidence_threshold is not None:
        cfg.confidence_threshold = body.confidence_threshold
        logger.info(f"confidence_threshold → {cfg.confidence_threshold}")
    if body.frame_skip is not None:
        cfg.frame_skip = body.frame_skip
        logger.info(f"frame_skip → {cfg.frame_skip}")
    return await get_config()


@router.get("/predict/latest", tags=["inference"])
async def predict_latest():
    """Return the most recent inference result (non-streaming)."""
    if _engine is None:
        raise HTTPException(status_code=503, detail="Engine not running")
    packet = _engine.latest_packet()
    if packet is None:
        raise HTTPException(status_code=204, detail="No data yet")
    from dataclasses import asdict
    return asdict(packet)
