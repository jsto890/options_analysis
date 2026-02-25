import json
from pathlib import Path


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def test_openapi_version_and_per_dollar_fields():
    data = json.loads((repo_root() / "openapi.json").read_text())
    assert data["openapi"] == "3.1.0"

    per_dollar = data["components"]["schemas"]["PerDollarGreeks"]
    assert per_dollar["required"] == [
        "gamma_per_dollar",
        "vega_per_dollar",
        "theta_per_dollar",
    ]


def test_websocket_schema_exists_and_envelopes():
    schema = json.loads((repo_root() / "websocket_schema.json").read_text())
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
    cfg = json.loads((repo_root() / "config.default.json").read_text())
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
