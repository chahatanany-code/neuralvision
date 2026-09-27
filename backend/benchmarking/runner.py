# -*- coding: utf-8 -*-
"""
NEURALVISION // BENCHMARKING UTILITY
Run inference for a defined duration and produce percentile statistics.
Tail latency (P95, P99) is reported — averages alone are insufficient
for characterising real-time system performance.

Usage:
    python -m benchmarking.runner --frames 5000 --warmup 50
"""

import argparse
import json
import statistics
import time
from pathlib import Path

from core.config import benchmark_config, inference_config
from core.logging import get_logger
from models.model_config import load_model

logger = get_logger("benchmarking.runner")


def percentile(data: list, p: float) -> float:
    """Simple percentile calculation (no scipy dependency)."""
    sorted_data = sorted(data)
    k = (len(sorted_data) - 1) * p / 100
    f = int(k)
    c = f + 1
    if c >= len(sorted_data):
        return sorted_data[f]
    return sorted_data[f] + (sorted_data[c] - sorted_data[f]) * (k - f)


def run_benchmark(
    model_name: str,
    warmup_frames: int,
    benchmark_frames: int,
    output_path: str,
):
    import numpy as np

    logger.info(f"Loading model: {model_name}")
    model = load_model(model_name)

    # Synthetic frames — benchmark is about inference, not capture
    dummy_frame = np.random.randint(0, 256, (480, 640, 3), dtype=np.uint8)

    # ── Warmup ───────────────────────────────────────────────────────────────
    logger.info(f"Warmup: {warmup_frames} frames")
    for _ in range(warmup_frames):
        tensor = model.preprocess(dummy_frame)
        raw = model.predict(tensor)
        model.postprocess(raw)

    # ── Benchmark ────────────────────────────────────────────────────────────
    logger.info(f"Benchmark: {benchmark_frames} frames")
    latencies = []
    pre_times = []
    post_times = []
    wall_start = time.perf_counter()

    for _ in range(benchmark_frames):
        t_pre = time.perf_counter()
        tensor = model.preprocess(dummy_frame)
        pre_times.append((time.perf_counter() - t_pre) * 1000)

        t_inf = time.perf_counter()
        raw = model.predict(tensor)
        latencies.append((time.perf_counter() - t_inf) * 1000)

        t_post = time.perf_counter()
        model.postprocess(raw)
        post_times.append((time.perf_counter() - t_post) * 1000)

    wall_elapsed = time.perf_counter() - wall_start
    avg_fps = benchmark_frames / wall_elapsed

    results = {
        "model": model_name,
        "frames": benchmark_frames,
        "wall_time_s": round(wall_elapsed, 3),
        "avg_fps": round(avg_fps, 2),
        "inference": {
            "avg_ms": round(statistics.mean(latencies), 3),
            "median_ms": round(statistics.median(latencies), 3),
            "p95_ms": round(percentile(latencies, 95), 3),
            "p99_ms": round(percentile(latencies, 99), 3),
            "min_ms": round(min(latencies), 3),
            "max_ms": round(max(latencies), 3),
            "stdev_ms": round(statistics.stdev(latencies), 3),
        },
        "preprocessing": {
            "avg_ms": round(statistics.mean(pre_times), 3),
            "p95_ms": round(percentile(pre_times, 95), 3),
        },
        "postprocessing": {
            "avg_ms": round(statistics.mean(post_times), 3),
            "p95_ms": round(percentile(post_times, 95), 3),
        },
    }

    # ── Print summary ────────────────────────────────────────────────────────
    print("\n" + "═" * 48)
    print("  NEURALVISION // BENCHMARK RESULT")
    print("═" * 48)
    print(f"  Model        : {model_name}")
    print(f"  Frames       : {benchmark_frames}")
    print(f"  Wall time    : {results['wall_time_s']} s")
    print(f"  Avg FPS      : {results['avg_fps']}")
    print()
    print("  INFERENCE LATENCY")
    inf = results["inference"]
    print(f"    Avg        : {inf['avg_ms']} ms")
    print(f"    Median     : {inf['median_ms']} ms")
    print(f"    P95        : {inf['p95_ms']} ms")
    print(f"    P99        : {inf['p99_ms']} ms")
    print(f"    Min        : {inf['min_ms']} ms")
    print(f"    Max        : {inf['max_ms']} ms")
    print()
    print(f"  PREPROCESSING  avg {results['preprocessing']['avg_ms']} ms")
    print(f"  POSTPROCESSING avg {results['postprocessing']['avg_ms']} ms")
    print("═" * 48 + "\n")

    # ── Save JSON ────────────────────────────────────────────────────────────
    out = Path(output_path)
    out.write_text(json.dumps(results, indent=2))
    logger.info(f"Results saved to {out.resolve()}")
    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="NEURALVISION Benchmark")
    parser.add_argument("--model", default=inference_config.model_name)
    parser.add_argument("--warmup", type=int, default=benchmark_config.warmup_frames)
    parser.add_argument("--frames", type=int, default=benchmark_config.benchmark_frames)
    parser.add_argument("--output", default=benchmark_config.output_path)
    args = parser.parse_args()

    run_benchmark(args.model, args.warmup, args.frames, args.output)
