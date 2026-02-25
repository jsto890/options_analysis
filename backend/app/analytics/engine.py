from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.analytics.exposures import compute_exposures
from app.analytics.iv_surface import IVFitResult, fit_iv_curve
from app.analytics.msi_mtc import MSIResult, MTCSelection, compute_msi, select_mtc


@dataclass(frozen=True)
class AnalyticsOutput:
    iv_fit: IVFitResult
    exposures_by_strike: dict
    msi: list[MSIResult]
    mtc: MTCSelection


def run_analytics(contract_quotes: list[dict[str, Any]], spot: float, config: dict[str, Any]) -> AnalyticsOutput:
    iv_fit = fit_iv_curve(
        contract_quotes,
        spot=spot,
        min_fit_points=int(config.get("min_fit_points", 8)),
    )

    enriched_quotes = []
    for quote in contract_quotes:
        q = dict(quote)
        contract_id = q.get("contract_id")
        if contract_id in iv_fit.residual_by_contract:
            q["iv_residual"] = iv_fit.residual_by_contract[contract_id]
        enriched_quotes.append(q)

    exposures_by_strike = compute_exposures(enriched_quotes, spot=spot)
    msi = compute_msi(
        exposures_by_strike,
        spot=spot,
        msi_bandwidth_pct=float(config.get("msi_bandwidth_pct", 0.0075)),
    )

    mtc = select_mtc(
        enriched_quotes,
        delta_band_min=float(config.get("delta_band_min", 0.30)),
        delta_band_max=float(config.get("delta_band_max", 0.65)),
        max_spread_pct=float(config.get("max_spread_pct", 0.12)),
        max_stale_ms=int(config.get("max_stale_ms", 1500)),
        iv_residual_scale=float(config.get("iv_residual_scale", 0.015)),
    )

    return AnalyticsOutput(
        iv_fit=iv_fit,
        exposures_by_strike=exposures_by_strike,
        msi=msi,
        mtc=mtc,
    )
