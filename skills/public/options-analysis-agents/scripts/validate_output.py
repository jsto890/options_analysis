#!/usr/bin/env python3
import json, sys, os

REQUIRED_TOP = [
    "task_id", "as_of", "underlying", "spot", "strategy",
    "legs", "metrics", "assumptions", "scenarios", "confidence"
]

ERR = 0

def fail(msg):
    global ERR
    ERR += 1
    print(f"ERROR: {msg}")

def ensure_type(obj, key, typ):
    if key not in obj:
        fail(f"Missing key: {key}")
        return False
    if not isinstance(obj[key], typ):
        fail(f"Wrong type for {key}: expected {typ.__name__}")
        return False
    return True

def validate_legs(legs):
    if not isinstance(legs, list) or len(legs) == 0:
        fail("legs must be a non-empty array")
        return
    for i, leg in enumerate(legs):
        if not isinstance(leg, dict):
            fail(f"leg[{i}] must be an object")
            continue
        for k in ["side", "type", "strike", "expiry", "quantity"]:
            if k not in leg:
                fail(f"leg[{i}] missing {k}")
        if "side" in leg and leg["side"] not in ("long", "short"):
            fail(f"leg[{i}].side must be 'long' or 'short'")
        if "type" in leg and leg["type"] not in ("call", "put"):
            fail(f"leg[{i}].type must be 'call' or 'put'")
        if "strike" in leg and not isinstance(leg["strike"], (int, float)):
            fail(f"leg[{i}].strike must be number")
        if "quantity" in leg and not isinstance(leg["quantity"], (int, float)):
            fail(f"leg[{i}].quantity must be number")


def validate_metrics(m):
    if not isinstance(m, dict):
        fail("metrics must be object")
        return
    for k in ["cost", "max_loss", "max_profit", "breakevens", "greeks"]:
        if k not in m:
            fail(f"metrics missing {k}")
    if "breakevens" in m and not isinstance(m["breakevens"], list):
        fail("metrics.breakevens must be array")
    g = m.get("greeks", {})
    if not isinstance(g, dict):
        fail("metrics.greeks must be object")
    for k in ["delta", "gamma", "theta", "vega"]:
        if k not in g:
            fail(f"metrics.greeks missing {k}")
    # Basic sanity ranges (not strict)
    if isinstance(g.get("delta"), (int, float)):
        if g["delta"] < -1.5 or g["delta"] > 1.5:
            fail("delta out of reasonable bounds [-1.5, 1.5]")


def validate_scenarios(s):
    if not isinstance(s, list) or len(s) == 0:
        fail("scenarios must be a non-empty array")
        return
    for i, sc in enumerate(s):
        if not isinstance(sc, dict):
            fail(f"scenarios[{i}] must be object")
            continue
        for k in ["date", "spot", "pnl"]:
            if k not in sc:
                fail(f"scenarios[{i}] missing {k}")


def main():
    if len(sys.argv) != 2:
        print("Usage: validate_output.py <path/to/analysis_result.json>")
        sys.exit(2)
    path = sys.argv[1]
    if not os.path.exists(path):
        print(f"File not found: {path}")
        sys.exit(2)
    with open(path, "r") as f:
        try:
            data = json.load(f)
        except Exception as e:
            print(f"Invalid JSON: {e}")
            sys.exit(2)
    for k in REQUIRED_TOP:
        if k not in data:
            fail(f"Missing top-level key: {k}")
    ensure_type(data, "task_id", str)
    ensure_type(data, "as_of", str)
    ensure_type(data, "underlying", str)
    ensure_type(data, "spot", (int, float))
    ensure_type(data, "strategy", str)
    validate_legs(data.get("legs"))
    validate_metrics(data.get("metrics"))
    if not isinstance(data.get("assumptions"), list):
        fail("assumptions must be array")
    validate_scenarios(data.get("scenarios"))
    if not isinstance(data.get("confidence"), (int, float)):
        fail("confidence must be number in [0,1]")
    else:
        c = data["confidence"]
        if c < 0 or c > 1:
            fail("confidence out of [0,1]")
    if ERR:
        print(f"Validation FAILED with {ERR} error(s)")
        sys.exit(1)
    else:
        print("Validation OK")
        sys.exit(0)

if __name__ == "__main__":
    main()
