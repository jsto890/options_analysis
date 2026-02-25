from math import isclose, log

from app.analytics.iv_surface import fit_iv_curve


def _quote(contract_id: str, strike: float, right: str, iv: float, liquid: bool = True):
    return {
        "contract_id": contract_id,
        "strike": strike,
        "right": right,
        "model_iv": iv,
        "liquid": liquid,
    }


def test_fit_iv_curve_returns_none_when_insufficient_points():
    quotes = [
        _quote("c1", 99, "C", 0.21),
        _quote("c2", 100, "C", 0.22),
        _quote("c3", 101, "C", 0.23),
    ]

    result = fit_iv_curve(quotes, spot=100.0, min_fit_points=8)
    assert result.coefficients_by_right["C"] is None
    assert result.residual_by_contract["c1"] is None


def test_fit_iv_curve_quadratic_residuals_are_stable():
    spot = 100.0
    quotes = []
    for strike in (90, 92, 94, 96, 98, 100, 102, 104, 106, 108, 110):
        x = log(strike / spot)
        iv = 0.30 + (0.05 * x) + (0.10 * x * x)
        quotes.append(_quote(f"c{strike}", strike, "C", iv))

    result = fit_iv_curve(quotes, spot=spot, min_fit_points=8)
    coeff = result.coefficients_by_right["C"]
    assert coeff is not None
    for strike in (90, 100, 110):
        rid = f"c{strike}"
        residual = result.residual_by_contract[rid]
        assert residual is not None
        assert isclose(residual, 0.0, abs_tol=1e-9)
