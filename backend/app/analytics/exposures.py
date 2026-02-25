from __future__ import annotations

from dataclasses import dataclass
from typing import TypedDict


class ExposureQuote(TypedDict, total=False):
    strike: float
    model_delta: float | None
    model_gamma: float | None
    model_vega: float | None
    open_interest: int | None
    volume: int | None


@dataclass(frozen=True)
class ExposureTriple:
    dex: float | None
    gex: float | None
    vex: float | None


@dataclass(frozen=True)
class StrikeExposure:
    oi: ExposureTriple
    vol: ExposureTriple


def _empty_acc() -> dict[str, float]:
    return {"dex": 0.0, "gex": 0.0, "vex": 0.0}


def compute_exposures(
    option_quotes: list[ExposureQuote],
    spot: float,
    multiplier: int = 100,
) -> dict[float, StrikeExposure]:
    if spot <= 0:
        return {}

    strike_acc: dict[float, dict[str, dict[str, float]]] = {}

    for quote in option_quotes:
        strike = float(quote.get("strike", 0.0))
        if strike <= 0:
            continue

        delta = quote.get("model_delta")
        gamma = quote.get("model_gamma")
        vega = quote.get("model_vega")
        if delta is None or gamma is None or vega is None:
            continue

        strike_entry = strike_acc.setdefault(strike, {"oi": _empty_acc(), "vol": _empty_acc()})

        for bucket, weight_name in (("oi", "open_interest"), ("vol", "volume")):
            raw_weight = quote.get(weight_name)
            if raw_weight is None or raw_weight <= 0:
                continue
            weight = float(raw_weight)

            strike_entry[bucket]["dex"] += delta * spot * multiplier * weight
            strike_entry[bucket]["gex"] += gamma * spot * spot * 0.01 * multiplier * weight
            strike_entry[bucket]["vex"] += vega * 0.01 * multiplier * weight

    output: dict[float, StrikeExposure] = {}
    for strike, acc in strike_acc.items():
        output[strike] = StrikeExposure(
            oi=ExposureTriple(
                dex=acc["oi"]["dex"],
                gex=acc["oi"]["gex"],
                vex=acc["oi"]["vex"],
            ),
            vol=ExposureTriple(
                dex=acc["vol"]["dex"],
                gex=acc["vol"]["gex"],
                vex=acc["vol"]["vex"],
            ),
        )

    return output
