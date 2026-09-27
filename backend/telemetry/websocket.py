"""
NEURALVISION // WEBSOCKET TELEMETRY
Streams TelemetryPackets from the inference engine to all connected browsers.
Uses a background asyncio task — never blocks inference workers.
"""

import asyncio
import json
import time
from dataclasses import asdict
from typing import Set

from fastapi import WebSocket, WebSocketDisconnect
from core.logging import get_logger

logger = get_logger("telemetry.websocket")


class ConnectionManager:
    """Manages the set of active WebSocket connections."""

    def __init__(self):
        self.active: Set[WebSocket] = set()

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.add(ws)
        logger.info(f"WS connected — {len(self.active)} total")

    def disconnect(self, ws: WebSocket):
        self.active.discard(ws)
        logger.info(f"WS disconnected — {len(self.active)} remaining")

    async def broadcast(self, payload: dict):
        if not self.active:
            return
        text = json.dumps(payload, default=str)
        dead = set()
        for ws in list(self.active):
            try:
                await ws.send_text(text)
            except Exception:
                dead.add(ws)
        self.active -= dead


manager = ConnectionManager()


async def telemetry_endpoint(websocket: WebSocket, engine):
    """
    FastAPI WebSocket endpoint.
    Pulls from the engine's telemetry_queue and broadcasts.
    Falls back to a heartbeat packet when no inference data is ready.
    """
    await manager.connect(websocket)
    try:
        while True:
            packet = engine.latest_packet()
            if packet is not None:
                payload = asdict(packet)
                payload["event"] = "telemetry"
            else:
                # Heartbeat — keeps the connection alive
                payload = {
                    "event": "heartbeat",
                    "timestamp": time.time(),
                    "engine_running": engine.stats.running,
                }
            await manager.broadcast(payload)
            await asyncio.sleep(0.033)   # ~30 updates/sec max
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WS error: {e}")
        manager.disconnect(websocket)
