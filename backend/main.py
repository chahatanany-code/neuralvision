"""
NEURALVISION // MAIN
FastAPI application entry point.

Start with:
    uvicorn main:app --host 0.0.0.0 --port 8000 --reload

Or:
    python main.py
"""

import sys
import os

# Ensure backend/ is on the path
sys.path.insert(0, os.path.dirname(__file__))

from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware

from core.config import inference_config, server_config
from core.logging import get_logger
from api.routes import router, set_engine
from inference.engine import InferenceEngine
from models.model_config import load_model
from telemetry.websocket import telemetry_endpoint

logger = get_logger("main")

# ─── Global state ────────────────────────────────────────────────────────────
_engine: InferenceEngine = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _engine

    logger.info("NEURALVISION starting up…")

    # Load model
    logger.info(f"Loading model: {inference_config.model_name}")
    try:
        model = load_model(
            inference_config.model_name,
            classes=inference_config.classes,
        )
        logger.info(f"Model ready: {model.name} v{model.version}")
    except Exception as e:
        logger.error(f"Model load failed: {e} — system will run in degraded state")
        model = None

    # Create + start engine
    if model:
        _engine = InferenceEngine(model=model, cfg=inference_config)
        _engine.start()
        set_engine(_engine, model)

    logger.info("NEURALVISION ONLINE")
    yield

    # Shutdown
    logger.info("Shutting down…")
    if _engine:
        _engine.stop()
    logger.info("Goodbye.")


# ─── App ─────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="NEURALVISION API",
    description="Real-Time Edge Computer Vision & Inference Telemetry",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS — allows the local dev frontend to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=server_config.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# REST routes
app.include_router(router, prefix="/api/v1")


# WebSocket telemetry
@app.websocket(server_config.ws_path)
async def ws_telemetry(websocket: WebSocket):
    if _engine is None:
        await websocket.close(code=1011, reason="Engine not running")
        return
    await telemetry_endpoint(websocket, _engine)


# ─── Dev runner ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=server_config.host,
        port=server_config.port,
        log_level=server_config.log_level,
        reload=False,
    )
