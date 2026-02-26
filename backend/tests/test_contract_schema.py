import json
from pathlib import Path


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def load_repo_json(filename: str) -> dict:
    root = repo_root()
    candidates = [
        root / filename,
        root / "documents" / filename,
    ]

    for path in candidates:
        if path.exists():
            return json.loads(path.read_text())

    joined = ", ".join(str(path) for path in candidates)
    raise FileNotFoundError(f"None of the candidate paths exist: {joined}")


def test_openapi_version_and_per_dollar_fields():
    data = load_repo_json("openapi.json")
    assert data["openapi"] == "3.1.0"

    per_dollar = data["components"]["schemas"]["PerDollarGreeks"]
    assert per_dollar["required"] == [
        "gamma_per_dollar",
        "vega_per_dollar",
        "theta_per_dollar",
    ]


def test_websocket_schema_exists_and_envelopes():
    schema = load_repo_json("websocket_schema.json")
    assert schema["$schema"] == "https://json-schema.org/draft/2020-12/schema"

    kinds = {
        branch["allOf"][1]["properties"]["type"]["const"]
        for branch in schema["oneOf"]
    }
    assert kinds == {"snapshot", "delta", "heartbeat"}

    per_dollar = schema["$defs"]["perDollarGreeks"]
    assert set(per_dollar["required"]) == {
        "gamma_per_dollar",
        "vega_per_dollar",
        "theta_per_dollar",
    }


def test_default_config_matches_schema_shape():
    cfg = load_repo_json("config.default.json")
    assert "filename" not in cfg
    required_keys = {
        "update_interval_ms",
        "window_strikes_each_side",
        "roll_threshold_strikes",
        "max_spread_pct",
        "min_bid_size",
        "min_ask_size",
        "max_stale_ms",
        "min_fit_points",
        "delta_band_min",
        "delta_band_max",
        "msi_bandwidth_pct",
        "gex_band_pct",
        "persistence_updates",
        "persistence_fraction",
        "iv_residual_scale",
        "iv_imbalance_threshold",
        "min_mid_for_extremes",
        "max_subscriptions_soft_limit",
    }
    assert set(cfg) == required_keys
