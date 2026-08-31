"""
scan_engine.py
==============
The actual "brain" of Spectrum Sentinel.

This file has NOTHING to do with the website — it is pure logic:
given a spectrum (some frequency bands, some of them "hot" i.e. likely
to carry a threat signal), it simulates two scanning strategies and
returns the results as plain Python dictionaries.

app.py imports these functions and exposes them over the web.
"""

import random


def build_environment(num_bands, num_hotspots, hotspot_prob, baseline_prob, seed):
    """Pick which bands are hotspots and assign a signal probability
    to every band."""
    rng = random.Random(seed)
    num_hotspots = min(num_hotspots, num_bands)
    hotspots = rng.sample(range(num_bands), num_hotspots)
    probs = [baseline_prob] * num_bands
    for h in hotspots:
        probs[h] = hotspot_prob
    return hotspots, probs


def _signals_at_step(probs, rng):
    return [rng.random() < p for p in probs]


def sequential_scan(num_bands, num_steps, probs, seed):
    """Baseline strategy: scan band 0, 1, 2, ... in a fixed loop."""
    rng = random.Random(seed)
    pointer = 0
    detections = []
    first_seen = {}
    cumulative = []
    scan_history = []
    hit_history = []
    count = 0

    for t in range(num_steps):
        signals = _signals_at_step(probs, rng)
        band = pointer % num_bands
        pointer += 1

        hit = bool(signals[band])
        if hit:
            count += 1
            detections.append({"step": t, "band": band})
            if band not in first_seen:
                first_seen[band] = t

        cumulative.append(count)
        scan_history.append(band)
        hit_history.append(hit)

    return {
        "detections": detections,
        "first_seen": first_seen,
        "cumulative": cumulative,
        "scan_history": scan_history,
        "hit_history": hit_history,
    }


def smart_scan(num_bands, num_steps, probs, epsilon, seed):
    """Adaptive strategy: score every band from what has been found so
    far, mostly scan the best-scoring band, but explore randomly at
    rate epsilon so nothing is permanently ignored."""
    rng = random.Random(seed + 1)
    scores = [1.0] * num_bands
    detections = []
    first_seen = {}
    cumulative = []
    scan_history = []
    hit_history = []
    count = 0

    for t in range(num_steps):
        signals = _signals_at_step(probs, rng)

        if rng.random() < epsilon:
            band = rng.randrange(num_bands)          # explore
        else:
            band = scores.index(max(scores))           # exploit

        hit = bool(signals[band])
        if hit:
            count += 1
            scores[band] += 1
            detections.append({"step": t, "band": band})
            if band not in first_seen:
                first_seen[band] = t
        else:
            scores[band] *= 0.985

        cumulative.append(count)
        scan_history.append(band)
        hit_history.append(hit)

    return {
        "detections": detections,
        "first_seen": first_seen,
        "cumulative": cumulative,
        "scan_history": scan_history,
        "hit_history": hit_history,
    }


def average_delay(first_seen, hotspots):
    delays = [first_seen[h] for h in hotspots if h in first_seen]
    if not delays:
        return None
    return round(sum(delays) / len(delays), 1)


def run_simulation(num_bands, num_steps, num_hotspots, hotspot_prob,
                    baseline_prob, epsilon, seed=42):
    """One call that runs everything and returns a single result
    dictionary — this is what app.py calls."""
    hotspots, probs = build_environment(
        num_bands, num_hotspots, hotspot_prob, baseline_prob, seed
    )
    seq = sequential_scan(num_bands, num_steps, probs, seed)
    smart = smart_scan(num_bands, num_steps, probs, epsilon, seed)

    seq_count = len(seq["detections"])
    smart_count = len(smart["detections"])
    improvement = (
        round((smart_count - seq_count) / seq_count * 100, 1)
        if seq_count else 0
    )

    return {
        "hotspots": sorted(hotspots),
        "num_bands": num_bands,
        "num_steps": num_steps,
        "sequential": {
            "scan_history": seq["scan_history"],
            "hit_history": seq["hit_history"],
            "cumulative": seq["cumulative"],
            "detections": seq_count,
            "avg_delay": average_delay(seq["first_seen"], hotspots),
        },
        "smart": {
            "scan_history": smart["scan_history"],
            "hit_history": smart["hit_history"],
            "cumulative": smart["cumulative"],
            "detections": smart_count,
            "avg_delay": average_delay(smart["first_seen"], hotspots),
        },
        "improvement_pct": improvement,
    }
