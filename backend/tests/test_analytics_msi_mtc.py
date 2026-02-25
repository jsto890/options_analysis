from app.analytics.exposures import ExposureTriple, StrikeExposure
from app.analytics.msi_mtc import compute_msi, select_mtc


def test_msi_returns_top_three_strikes_by_score():
    exposures = {
        428.0: StrikeExposure(oi=ExposureTriple(dex=0.0, gex=2000.0, vex=0.0), vol=ExposureTriple(None, None, None)),
        430.0: StrikeExposure(oi=ExposureTriple(dex=0.0, gex=8000.0, vex=0.0), vol=ExposureTriple(None, None, None)),
        432.0: StrikeExposure(oi=ExposureTriple(dex=0.0, gex=6000.0, vex=0.0), vol=ExposureTriple(None, None, None)),
        434.0: StrikeExposure(oi=ExposureTriple(dex=0.0, gex=1000.0, vex=0.0), vol=ExposureTriple(None, None, None)),
    }

    result = compute_msi(exposures, spot=430.0, msi_bandwidth_pct=0.01)
    assert len(result) == 3
    assert result[0].strike == 430.0
    assert result[1].strike == 432.0


def test_msi_top_strike_stable_under_small_perturbations():
    base = {
        428.0: StrikeExposure(oi=ExposureTriple(dex=0.0, gex=2000.0, vex=0.0), vol=ExposureTriple(None, None, None)),
        430.0: StrikeExposure(oi=ExposureTriple(dex=0.0, gex=8000.0, vex=0.0), vol=ExposureTriple(None, None, None)),
        432.0: StrikeExposure(oi=ExposureTriple(dex=0.0, gex=6000.0, vex=0.0), vol=ExposureTriple(None, None, None)),
        434.0: StrikeExposure(oi=ExposureTriple(dex=0.0, gex=1000.0, vex=0.0), vol=ExposureTriple(None, None, None)),
    }
    perturbed = {
        k: StrikeExposure(
            oi=ExposureTriple(
                dex=0.0,
                gex=(v.oi.gex or 0.0) * (1.0 + (0.01 if k == 432.0 else -0.01)),
                vex=0.0,
            ),
            vol=ExposureTriple(None, None, None),
        )
        for k, v in base.items()
    }

    baseline = compute_msi(base, spot=430.0, msi_bandwidth_pct=0.01)
    noisy = compute_msi(perturbed, spot=430.0, msi_bandwidth_pct=0.01)
    assert baseline[0].strike == 430.0
    assert noisy[0].strike == 430.0
    assert {item.strike for item in baseline} == {item.strike for item in noisy}


def test_mtc_never_selects_illiquid_or_out_of_band_delta_contracts():
    quotes = [
        {
            "contract_id": "bad-call",
            "right": "C",
            "liquid": False,
            "spread_pct": 0.01,
            "stale_ms": 100,
            "delta": 0.45,
            "gamma_per_dollar": 1.0,
            "vega_per_dollar": 1.0,
            "theta_per_dollar": 0.0,
            "iv_residual": -0.02,
        },
        {
            "contract_id": "good-call",
            "right": "C",
            "liquid": True,
            "spread_pct": 0.03,
            "stale_ms": 200,
            "delta": 0.40,
            "gamma_per_dollar": 0.02,
            "vega_per_dollar": 0.1,
            "theta_per_dollar": 0.02,
            "iv_residual": -0.01,
        },
        {
            "contract_id": "bad-put-delta",
            "right": "P",
            "liquid": True,
            "spread_pct": 0.01,
            "stale_ms": 100,
            "delta": -0.10,
            "gamma_per_dollar": 1.0,
            "vega_per_dollar": 1.0,
            "theta_per_dollar": 0.0,
            "iv_residual": -0.02,
        },
        {
            "contract_id": "good-put",
            "right": "P",
            "liquid": True,
            "spread_pct": 0.02,
            "stale_ms": 150,
            "delta": -0.50,
            "gamma_per_dollar": 0.015,
            "vega_per_dollar": 0.08,
            "theta_per_dollar": 0.01,
            "iv_residual": -0.012,
        },
    ]

    selected = select_mtc(
        quotes,
        delta_band_min=0.30,
        delta_band_max=0.65,
        max_spread_pct=0.12,
        max_stale_ms=1500,
        iv_residual_scale=0.015,
    )

    assert selected.best_call is not None
    assert selected.best_put is not None
    assert selected.best_call.contract_id == "good-call"
    assert selected.best_put.contract_id == "good-put"
    assert selected.best_call.tradable_score > 0.0
    assert selected.best_put.tradable_score > 0.0
    assert selected.best_call.rationale.gate_liquid is True
    assert selected.best_call.rationale.gate_delta_band is True
    assert selected.best_put.rationale.delta_abs == 0.5
