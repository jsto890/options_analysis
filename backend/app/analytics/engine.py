from __future__ import annotations

from dataclasses import dataclass
import math
from typing import Any

from app.analytics.exposures import compute_exposures
from app.analytics.iv_surface import (
    IVFitResult,
    ResidualPersistence,
    compute_residual_persistence,
    fit_iv_curve,
    roll_residual_history,
)
from app.analytics.msi_mtc import MSIResult, MTCSelection, compute_msi, select_mtc


@dataclass(frozen=True)
class AnalyticsOutput:
    iv_fit: IVFitResult
    exposures_by_strike: dict
    msi: list[MSIResult]
    mtc: MTCSelection
    iv_imbalance_by_contract: dict[str, bool]
    extreme_greek_by_contract: dict[str, bool]
    residual_persistence_by_contract: dict[str, ResidualPersistence]
    residual_history_by_contract: dict[str, list[float | None]]


def run_analytics(
    contract_quotes: list[dict[str, Any]],
    spot: float,
    config: dict[str, Any],
    residual_history_by_contract: dict[str, list[float | None]] | None = None,
) -> AnalyticsOutput:
    persistence_updates = int(config.get("persistence_updates", 10))
    persistence_fraction = float(config.get("persistence_fraction", 0.7))
    iv_imbalance_threshold = float(config.get("iv_imbalance_threshold", -0.01))

    iv_fit = fit_iv_curve(
        contract_quotes,
        spot=spot,
        min_fit_points=int(config.get("min_fit_points", 8)),
    )
    next_history = roll_residual_history(
        iv_fit.residual_by_contract,
        residual_history_by_contract,
        persistence_updates=persistence_updates,
    )
    residual_persistence = compute_residual_persistence(
        next_history,
        persistence_updates=persistence_updates,
        persistence_fraction=persistence_fraction,
        iv_imbalance_threshold=iv_imbalance_threshold,
    )

    enriched_quotes = []
    iv_imbalance_by_contract: dict[str, bool] = {}
    for quote in contract_quotes:
        q = dict(quote)
        contract_id = q.get("contract_id")
        if contract_id in iv_fit.residual_by_contract:
            q["iv_residual"] = iv_fit.residual_by_contract[contract_id]
        rp = residual_persistence.get(str(contract_id))
        q["residual_persist_score"] = 0.0 if rp is None else rp.score
        q["iv_imbalance"] = bool(
            q.get("liquid", False)
            and q.get("iv_residual") is not None
            and q["iv_residual"] <= iv_imbalance_threshold
            and rp is not None
            and rp.is_imbalanced
        )
        iv_imbalance_by_contract[str(contract_id)] = q["iv_imbalance"]
        enriched_quotes.append(q)

    min_mid_for_extremes = float(config.get("min_mid_for_extremes", 0.05))
    gamma_candidates: list[float] = []
    for q in enriched_quotes:
        gamma_per_dollar = q.get("gamma_per_dollar")
        mid = q.get("mid")
        if (
            q.get("liquid", False)
            and gamma_per_dollar is not None
            and mid is not None
            and mid >= min_mid_for_extremes
        ):
            gamma_candidates.append(abs(float(gamma_per_dollar)))

    extreme_greek_by_contract: dict[str, bool] = {}
    quantile_threshold = 0.0
    if gamma_candidates:
        sorted_gamma = sorted(gamma_candidates)
        q_index = int(math.floor(0.9 * (len(sorted_gamma) - 1)))
        quantile_threshold = sorted_gamma[q_index]

    for q in enriched_quotes:
        contract_id = str(q.get("contract_id", ""))
        gamma_per_dollar = q.get("gamma_per_dollar")
        mid = q.get("mid")
        extreme = bool(
            contract_id
            and q.get("liquid", False)
            and gamma_per_dollar is not None
            and mid is not None
            and mid >= min_mid_for_extremes
            and abs(float(gamma_per_dollar)) >= quantile_threshold
            and quantile_threshold > 0
        )
        extreme_greek_by_contract[contract_id] = extreme

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
        iv_imbalance_by_contract=iv_imbalance_by_contract,
        extreme_greek_by_contract=extreme_greek_by_contract,
        residual_persistence_by_contract=residual_persistence,
        residual_history_by_contract=next_history,
    )
