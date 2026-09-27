"""
NEURALVISION // INFERENCE ENGINE
Decoupled three-stage pipeline:

  CaptureWorker  ──►  frame_buffer  ──►  InferenceWorker  ──►  telemetry_queue
       (thread)                              (thread)

The UI / WebSocket layer reads from telemetry_queue — never blocks inference.
"""

import time
import queue
import threading
import collections
from dataclasses import dataclass, field
from typing import Optional, List

import numpy as np

from core.config import InferenceConfig
from core.logging import get_logger
from models.base_model import VisionModel

logger = get_logger("inference.engine")


# ─── Data Structures ─────────────────────────────────────────────────────────

@dataclass
class TelemetryPacket:
    timestamp: float
    frame_id: int
    fps: float
    inference_latency_ms: float
    preprocessing_ms: float
    postprocessing_ms: float
    capture_ms: float
    confidence: float
    class_name: str
    class_idx: int
    all_scores: list
    device: str
    model: str
    dropped_frames: int
    buffer_size: int
    total_processed: int
    is_demo: bool = False


@dataclass
class EngineStats:
    running: bool = False
    total_processed: int = 0
    total_dropped: int = 0
    fps_history: list = field(default_factory=list)
    latency_history: list = field(default_factory=list)


# ─── Capture Worker ───────────────────────────────────────────────────────────

class CaptureWorker(threading.Thread):
    """
    Continuously reads frames from VideoCapture into a bounded queue.
    Drops frames when inference falls behind (back-pressure safety).
    """

    def __init__(
        self,
        cfg: InferenceConfig,
        frame_buffer: queue.Queue,
        stop_event: threading.Event,
    ):
        super().__init__(daemon=True, name="CaptureWorker")
        self.cfg = cfg
        self.frame_buffer = frame_buffer
        self.stop_event = stop_event
        self._cap = None
        self._frame_count = 0
        self._dropped = 0

    def run(self):
        import cv2
        source = self.cfg.video_source or self.cfg.camera_index
        logger.info(f"Opening video source: {source}")
        self._cap = cv2.VideoCapture(source)

        if not self._cap.isOpened():
            logger.warning(
                f"Cannot open source '{source}' — switching to synthetic frames"
            )
            self._run_synthetic()
            return

        skip = 0
        while not self.stop_event.is_set():
            t0 = time.perf_counter()
            ok, frame = self._cap.read()
            capture_ms = (time.perf_counter() - t0) * 1000

            if not ok:
                logger.warning("End of stream / capture failure — looping")
                self._cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                continue

            if self.cfg.frame_skip > 0:
                skip += 1
                if skip % (self.cfg.frame_skip + 1) != 0:
                    continue

            self._frame_count += 1
            item = (self._frame_count, frame, capture_ms)

            try:
                self.frame_buffer.put_nowait(item)
            except queue.Full:
                self._dropped += 1

        self._cap.release()
        logger.info("CaptureWorker stopped")

    def _run_synthetic(self):
        """Generate random frames when no camera is available."""
        logger.info("Synthetic frame generator active")
        while not self.stop_event.is_set():
            t0 = time.perf_counter()
            frame = np.random.randint(0, 256, (480, 640, 3), dtype=np.uint8)
            capture_ms = (time.perf_counter() - t0) * 1000
            self._frame_count += 1
            item = (self._frame_count, frame, capture_ms)
            try:
                self.frame_buffer.put_nowait(item)
            except queue.Full:
                self._dropped += 1
            time.sleep(1 / 30)   # synthetic ~30 FPS cap

    @property
    def dropped(self) -> int:
        return self._dropped


# ─── Inference Worker ─────────────────────────────────────────────────────────

class InferenceWorker(threading.Thread):
    """
    Pulls frames from frame_buffer, runs the full model pipeline,
    writes TelemetryPackets to telemetry_queue.
    """

    _FPS_WINDOW = 30    # rolling window for FPS calculation

    def __init__(
        self,
        model: VisionModel,
        cfg: InferenceConfig,
        frame_buffer: queue.Queue,
        telemetry_queue: queue.Queue,
        capture_worker: CaptureWorker,
        stop_event: threading.Event,
    ):
        super().__init__(daemon=True, name="InferenceWorker")
        self.model = model
        self.cfg = cfg
        self.frame_buffer = frame_buffer
        self.telemetry_queue = telemetry_queue
        self.capture_worker = capture_worker
        self.stop_event = stop_event

        self._processed = 0
        self._timestamps = collections.deque(maxlen=self._FPS_WINDOW)

    def run(self):
        logger.info(f"InferenceWorker started — model: {self.model.name}")
        while not self.stop_event.is_set():
            try:
                frame_id, frame, capture_ms = self.frame_buffer.get(timeout=0.5)
            except queue.Empty:
                continue

            packet = self._process(frame_id, frame, capture_ms)
            self._processed += 1

            try:
                self.telemetry_queue.put_nowait(packet)
            except queue.Full:
                # Discard old telemetry — always keep latest
                try:
                    self.telemetry_queue.get_nowait()
                    self.telemetry_queue.put_nowait(packet)
                except queue.Empty:
                    pass

        logger.info("InferenceWorker stopped")

    def _process(self, frame_id: int, frame: np.ndarray, capture_ms: float) -> TelemetryPacket:
        # ── Preprocessing ────────────────────────────────────────────────────
        t_pre = time.perf_counter()
        tensor = self.model.preprocess(frame)
        preprocessing_ms = (time.perf_counter() - t_pre) * 1000

        # ── Inference ────────────────────────────────────────────────────────
        t_inf = time.perf_counter()
        raw = self.model.predict(tensor)
        inference_latency_ms = (time.perf_counter() - t_inf) * 1000

        # ── Postprocessing ───────────────────────────────────────────────────
        t_post = time.perf_counter()
        result = self.model.postprocess(raw)
        postprocessing_ms = (time.perf_counter() - t_post) * 1000

        # ── FPS calculation ──────────────────────────────────────────────────
        now = time.perf_counter()
        self._timestamps.append(now)
        if len(self._timestamps) >= 2:
            elapsed = self._timestamps[-1] - self._timestamps[0]
            fps = (len(self._timestamps) - 1) / elapsed if elapsed > 0 else 0.0
        else:
            fps = 0.0

        return TelemetryPacket(
            timestamp=time.time(),
            frame_id=frame_id,
            fps=round(fps, 2),
            inference_latency_ms=round(inference_latency_ms, 2),
            preprocessing_ms=round(preprocessing_ms, 2),
            postprocessing_ms=round(postprocessing_ms, 2),
            capture_ms=round(capture_ms, 2),
            confidence=round(result["confidence"], 4),
            class_name=result["class_name"],
            class_idx=result["class_idx"],
            all_scores=result["all_scores"],
            device=self.cfg.device,
            model=self.model.name,
            dropped_frames=self.capture_worker.dropped,
            buffer_size=self.frame_buffer.qsize(),
            total_processed=self._processed,
            is_demo=isinstance(self.model.__class__.__name__, str)
            and "Dummy" in self.model.__class__.__name__,
        )


# ─── Engine ───────────────────────────────────────────────────────────────────

class InferenceEngine:
    """
    Top-level orchestrator: manages both workers and exposes the telemetry queue.
    """

    FRAME_BUFFER_SIZE = 8
    TELEMETRY_BUFFER_SIZE = 64

    def __init__(self, model: VisionModel, cfg: InferenceConfig):
        self.model = model
        self.cfg = cfg

        self._stop_event = threading.Event()
        self._frame_buffer: queue.Queue = queue.Queue(maxsize=self.FRAME_BUFFER_SIZE)
        self.telemetry_queue: queue.Queue = queue.Queue(maxsize=self.TELEMETRY_BUFFER_SIZE)

        self._capture_worker: Optional[CaptureWorker] = None
        self._inference_worker: Optional[InferenceWorker] = None
        self.stats = EngineStats()

    def start(self):
        if self.stats.running:
            logger.warning("Engine already running")
            return

        self._stop_event.clear()

        self._capture_worker = CaptureWorker(
            cfg=self.cfg,
            frame_buffer=self._frame_buffer,
            stop_event=self._stop_event,
        )
        self._inference_worker = InferenceWorker(
            model=self.model,
            cfg=self.cfg,
            frame_buffer=self._frame_buffer,
            telemetry_queue=self.telemetry_queue,
            capture_worker=self._capture_worker,
            stop_event=self._stop_event,
        )

        self._capture_worker.start()
        self._inference_worker.start()
        self.stats.running = True
        logger.info("InferenceEngine started")

    def stop(self):
        self._stop_event.set()
        if self._capture_worker:
            self._capture_worker.join(timeout=2)
        if self._inference_worker:
            self._inference_worker.join(timeout=2)
        self.stats.running = False
        logger.info("InferenceEngine stopped")

    def latest_packet(self) -> Optional[TelemetryPacket]:
        """Non-blocking peek at latest telemetry."""
        try:
            return self.telemetry_queue.get_nowait()
        except queue.Empty:
            return None
