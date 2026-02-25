from __future__ import annotations

from dataclasses import dataclass
from math import exp
from typing import Literal, TypedDict

from app.analytics.exposures import StrikeExposure


class MTCQuote(TypedDict, total=False):
    contract_id: str
    right: str
    liquid: bool
    spread_pct: float | None
    stale_ms: int | None
    delta: float | None
    gamma_per_dollar: float | None
    vega_per_dollar: float | None
    theta_per_dollar: float | None
    iv_residual: float | None
    spread_std: float | None
    residual_std: float | None


@dataclass(frozen=True)
class MTCRationale:
    gate_liquid: bool
    gate_delta_band: bool
    spread_pct: float | None
    stale_ms: float
    delta_abs: float | None
    iv_residual: float | None
    liquidity_score: float
    cheap_iv_score: float
    efficiency_score: float
    stability_score: float


@dataclass(frozen=True)
class MTCScored:
    contract_id: str
    right: Literal["C", "P"]
    tradable_score: float
    liquidity_score: float
    cheap_iv_score: float
    efficiency_score: float
    stability_score: float
    gate_liquid: bool
    gate_delta_band: bool
    rationale: MTCRationale


@dataclass(frozen=True)
class MTCSelection:
    best_call: MTCScored | None
    best_put: MTCScored | None


@dataclass(frozen=True)
class MSIResult:
    strike: float
    msi_score: float
    wall_type: Literal["none", "call_wall", "put_wall"]
    distance_pct: float


def clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(value, maximum))


def compute_msi(
    strike_exposures: dict[float, StrikeExposure],
    spot: float,
    msi_bandwidth_pct: float = 0.0075,
    top_n: int = 3,
    epsilon: float = 1e-9,
    call_gex_by_strike: dict[float, float] | None = None,
    put_gex_by_strike: dict[float, float] | None = None,
) -> list[MSIResult]:
    if spot <= 0 or not strike_exposures:
        return []

    strikes = sorted(strike_exposures)
    gex = {k: float(strike_exposures[k].oi.gex or 0.0) for k in strikes}

    results: list[MSIResult] = []
    for idx, strike in enumerate(strikes):
        this_gex = abs(gex[strike])
        lower = abs(gex[strikes[idx - 1]]) if idx > 0 else 0.0
        upper = abs(gex[strikes[idx + 1]]) if idx + 1 < len(strikes) else 0.0

        distance_pct = abs(strike - spot) / spot
        proximity = exp(-distance_pct / max(msi_bandwidth_pct, epsilon))
        concentration = this_gex / (lower + this_gex + upper + epsilon)
        score = this_gex * proximity * concentration

        wall_type: Literal["none", "call_wall", "put_wall"] = "none"
        if call_gex_by_strike is not None and put_gex_by_strike is not None:
            c = abs(float(call_gex_by_strike.get(strike, 0.0)))
            p = abs(float(put_gex_by_strike.get(strike, 0.0)))
            wall_type = "call_wall" if c >= p else "put_wall"

        results.append(MSIResult(strike=strike, msi_score=score, wall_type=wall_type, distance_pct=distance_pct))

    return sorted(results, key=lambda r: r.msi_score, reverse=True)[:top_n]


def select_mtc(
    quotes: list[MTCQuote],
    *,
    delta_band_min: float,
    delta_band_max: float,
    max_spread_pct: float,
    max_stale_ms: int,
    iv_residual_scale: float,
    gamma_per_dollar_scale: float = 0.02,
    vega_per_dollar_scale: float = 0.10,
    theta_per_dollar_scale: float = 0.20,
    spread_std_scale: float = 0.03,
    residual_std_scale: float = 0.01,
) -> MTCSelection:
    calls: list[MTCScored] = []
    puts: list[MTCScored] = []

    for q in quotes:
        contract_id = str(q.get("contract_id", ""))
        right = str(q.get("right", "")).upper()
        if right not in {"C", "P"} or not contract_id:
            continue

        liquid = bool(q.get("liquid", False))
        delta = q.get("delta")
        gate_delta_band = delta is not None and delta_band_min <= abs(delta) <= delta_band_max

        spread_pct = q.get("spread_pct")
        stale_ms = float(q.get("stale_ms", max_stale_ms + 1))

        liquidity_score = 0.0
        if spread_pct is not None:
            ls1 = clamp(1.0 - (spread_pct / max(max_spread_pct, 1e-9)), 0.0, 1.0)
            ls2 = clamp(1.0 - (stale_ms / max(max_stale_ms, 1)), 0.0, 1.0)
            liquidity_score = ls1 * ls2

        iv_residual = q.get("iv_residual")
        if iv_residual is None:
            cheap_iv_score = 0.0
        else:
            cheap_iv_score = clamp((0.0 - iv_residual) / max(iv_residual_scale, 1e-9), 0.0, 1.0)

        gp = clamp((q.get("gamma_per_dollar") or 0.0) / max(gamma_per_dollar_scale, 1e-9), 0.0, 1.0)
        vp = clamp((q.get("vega_per_dollar") or 0.0) / max(vega_per_dollar_scale, 1e-9), 0.0, 1.0)
        tp = clamp((q.get("theta_per_dollar") or 0.0) / max(theta_per_dollar_scale, 1e-9), 0.0, 1.0)
        efficiency_score = clamp(gp + vp - tp, 0.0, 1.0)

        spread_std = q.get("spread_std")
        residual_std = q.get("residual_std")
        spread_stability = 1.0 if spread_std is None else clamp(1.0 - spread_std / max(spread_std_scale, 1e-9), 0.0, 1.0)
        residual_stability = (
            1.0
            if residual_std is None
            else clamp(1.0 - residual_std / max(residual_std_scale, 1e-9), 0.0, 1.0)
        )
        stability_score = spread_stability * residual_stability

        tradable_score = (
            liquidity_score
            * (0.5 + 0.5 * cheap_iv_score)
            * (0.5 + 0.5 * efficiency_score)
            * stability_score
        )

        # Hard gates remain mandatory even with high component scores.
        if not liquid or not gate_delta_band:
            tradable_score = 0.0

        scored = MTCScored(
            contract_id=contract_id,
            right=right,
            tradable_score=tradable_score,
            liquidity_score=liquidity_score,
            cheap_iv_score=cheap_iv_score,
            efficiency_score=efficiency_score,
            stability_score=stability_score,
            gate_liquid=liquid,
            gate_delta_band=gate_delta_band,
            rationale=MTCRationale(
                gate_liquid=liquid,
                gate_delta_band=gate_delta_band,
                spread_pct=spread_pct,
                stale_ms=stale_ms,
                delta_abs=abs(delta) if delta is not None else None,
                iv_residual=iv_residual,
                liquidity_score=liquidity_score,
                cheap_iv_score=cheap_iv_score,
                efficiency_score=efficiency_score,
                stability_score=stability_score,
            ),
        )

        if right == "C":
            calls.append(scored)
        else:
            puts.append(scored)

    best_call = max(calls, key=lambda s: s.tradable_score, default=None)
    best_put = max(puts, key=lambda s: s.tradable_score, default=None)
    return MTCSelection(best_call=best_call, best_put=best_put)
