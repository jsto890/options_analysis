from app.analytics.engine import run_analytics


def test_engine_runs_deterministically_and_returns_shapes():
    quotes = [
        {
            "contract_id": "c1",
            "right": "C",
            "strike": 430.0,
            "model_iv": 0.20,
            "liquid": True,
            "model_delta": 0.42,
            "model_gamma": 0.01,
            "model_vega": 0.12,
            "open_interest": 100,
            "volume": 50,
            "spread_pct": 0.03,
            "stale_ms": 100,
            "delta": 0.42,
            "gamma_per_dollar": 0.02,
            "vega_per_dollar": 0.10,
            "theta_per_dollar": 0.02,
        },
        {
            "contract_id": "p1",
            "right": "P",
            "strike": 430.0,
            "model_iv": 0.22,
            "liquid": True,
            "model_delta": -0.40,
            "model_gamma": 0.011,
            "model_vega": 0.11,
            "open_interest": 90,
            "volume": 40,
            "spread_pct": 0.02,
            "stale_ms": 80,
            "delta": -0.40,
            "gamma_per_dollar": 0.021,
            "vega_per_dollar": 0.09,
            "theta_per_dollar": 0.015,
        },
    ]

    output = run_analytics(
        quotes,
        spot=430.0,
        config={
            "min_fit_points": 8,
            "msi_bandwidth_pct": 0.0075,
            "delta_band_min": 0.30,
            "delta_band_max": 0.65,
            "max_spread_pct": 0.12,
            "max_stale_ms": 1500,
            "iv_residual_scale": 0.015,
            "persistence_updates": 2,
            "persistence_fraction": 0.5,
            "iv_imbalance_threshold": -0.01,
        },
    )

    assert isinstance(output.exposures_by_strike, dict)
    assert output.mtc.best_call is not None
    assert output.mtc.best_put is not None
    assert output.residual_history_by_contract
    assert output.residual_persistence_by_contract
