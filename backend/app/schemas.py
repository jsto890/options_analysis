from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


WallType = Literal["none", "call_wall", "put_wall"]


class UnderlyingSpot(BaseModel):
    bid: float | None = None
    ask: float | None = None
    last: float | None = None
    mid: float | None = None
    ts_ms: int = 0


class PerDollarGreeks(BaseModel):
    gamma_per_dollar: float | None = None
    vega_per_dollar: float | None = None
    theta_per_dollar: float | None = None


class MtcRationale(BaseModel):
    liquidity_score: float
    cheap_iv_score: float
    efficiency_score: float
    stability_score: float
    tradable_score: float
    gate_liquid: bool
    gate_delta_band: bool
    notes: list[str] = Field(default_factory=list)


class ContractBlock(BaseModel):
    contract_id: str
    mid: float | None = None
    iv: float | None = None
    iv_residual: float | None = None
    delta: float | None = None
    gamma: float | None = None
    vega: float | None = None
    theta: float | None = None
    spread_pct: float | None = None
    volume: int | None = None
    oi: int | None = None
    liquid: bool = False
    stale_ms: int = 0
    per_dollar: PerDollarGreeks = Field(default_factory=PerDollarGreeks)
    mtc_score: float | None = None
    mtc_rationale: MtcRationale | None = None


class ExposureTriple(BaseModel):
    dex: float | None = None
    gex: float | None = None
    vex: float | None = None


class StrikeExposures(BaseModel):
    oi: ExposureTriple = Field(default_factory=ExposureTriple)
    vol: ExposureTriple = Field(default_factory=ExposureTriple)


class RowFlags(BaseModel):
    is_msi: bool = False
    wall_type: WallType = "none"


class StrikeRow(BaseModel):
    strike: float
    msi_score: float | None = None
    flags: RowFlags = Field(default_factory=RowFlags)
    call: ContractBlock
    put: ContractBlock
    exposures: StrikeExposures = Field(default_factory=StrikeExposures)


class Summary(BaseModel):
    net_gex_band: float | None = None
    pin_risk: float = 0.0
    msi_strikes: list[float] = Field(default_factory=list)
    mtc_call_contract_id: str | None = None
    mtc_put_contract_id: str | None = None
    nearest_msi_distance_pct: float | None = None


class Config(BaseModel):
    update_interval_ms: int = 500
    window_strikes_each_side: int = 20
    roll_threshold_strikes: int = 2
    max_spread_pct: float = 0.12
    min_bid_size: int = 10
    min_ask_size: int = 10
    max_stale_ms: int = 1500
    min_fit_points: int = 8
    delta_band_min: float = 0.30
    delta_band_max: float = 0.65
    msi_bandwidth_pct: float = 0.0075
    gex_band_pct: float = 0.0075
    persistence_updates: int = 10
    persistence_fraction: float = 0.7
    iv_residual_scale: float = 0.015
    iv_imbalance_threshold: float = -0.01
    min_mid_for_extremes: float = 0.05
    max_subscriptions_soft_limit: int = 95


class ConfigUpdate(BaseModel):
    update_interval_ms: int | None = None
    window_strikes_each_side: int | None = None
    roll_threshold_strikes: int | None = None
    max_spread_pct: float | None = None
    min_bid_size: int | None = None
    min_ask_size: int | None = None
    max_stale_ms: int | None = None
    min_fit_points: int | None = None
    delta_band_min: float | None = None
    delta_band_max: float | None = None
    msi_bandwidth_pct: float | None = None
    gex_band_pct: float | None = None
    persistence_updates: int | None = None
    persistence_fraction: float | None = None
    iv_residual_scale: float | None = None
    iv_imbalance_threshold: float | None = None
    min_mid_for_extremes: float | None = None
    max_subscriptions_soft_limit: int | None = None


class UnderlyingState(BaseModel):
    symbol: str = "QQQ"
    expiry: str = ""
    spot: UnderlyingSpot = Field(default_factory=UnderlyingSpot)


class StateSnapshot(BaseModel):
    underlying: UnderlyingState
    config: Config
    summary: Summary
    rows: list[StrikeRow] = Field(default_factory=list)


class HealthResponse(BaseModel):
    ok: bool
    server_ts_ms: int
    ibkr_connected: bool
    subscriptions: int


class EnvelopeBase(BaseModel):
    type: Literal["snapshot", "delta", "heartbeat"]
    schema_version: Literal[1] = 1
    ts_ms: int


class SnapshotPayload(BaseModel):
    underlying: UnderlyingState
    config: Config
    summary: Summary
    rows: list[StrikeRow] = Field(default_factory=list)


class DeltaPayload(BaseModel):
    underlying_patch: dict = Field(default_factory=dict)
    summary_patch: dict = Field(default_factory=dict)
    row_patches: list[dict] = Field(default_factory=list)


class HeartbeatPayload(BaseModel):
    server_ts_ms: int
    ibkr_connected: bool
    subscriptions: int


def build_default_snapshot(config: Config) -> StateSnapshot:
    return StateSnapshot(
        underlying=UnderlyingState(),
        config=config,
        summary=Summary(),
        rows=[],
    )
