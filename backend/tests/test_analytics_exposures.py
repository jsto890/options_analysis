from math import isclose

from app.analytics.exposures import compute_exposures


def test_compute_exposures_matches_formula_definition():
    quotes = [
        {
            "strike": 430.0,
            "model_delta": 0.5,
            "model_gamma": 0.01,
            "model_vega": 0.2,
            "open_interest": 100,
            "volume": 50,
        }
    ]
    result = compute_exposures(quotes, spot=100.0)

    strike = result[430.0]
    assert isclose(strike.oi.dex or 0.0, 500000.0, rel_tol=1e-12)
    assert isclose(strike.oi.gex or 0.0, 10000.0, rel_tol=1e-12)
    assert isclose(strike.oi.vex or 0.0, 20.0, rel_tol=1e-12)

    assert isclose(strike.vol.dex or 0.0, 250000.0, rel_tol=1e-12)
    assert isclose(strike.vol.gex or 0.0, 5000.0, rel_tol=1e-12)
    assert isclose(strike.vol.vex or 0.0, 10.0, rel_tol=1e-12)
