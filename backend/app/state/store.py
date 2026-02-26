from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.schemas import Config, StateSnapshot, Summary, UnderlyingSpot


@dataclass(frozen=True)
class DeltaEnvelopePayload:
    underlying_patch: dict[str, Any]
    summary_patch: dict[str, Any]
    row_patches: list[dict[str, Any]]


class RuntimeStore:
    """Holds mutable runtime snapshot and computes websocket deltas."""

    def __init__(self, snapshot: StateSnapshot):
        self.snapshot = snapshot
        self._last_spot = snapshot.underlying.spot.model_dump()
        self._last_summary = snapshot.summary.model_dump()
        self._last_rows_by_strike = {row.strike: row.model_dump() for row in snapshot.rows}
        self._force_next_delta = False

    def force_delta(self) -> None:
        self._force_next_delta = True

    def sync_baseline(self) -> None:
        """Aligns the internal diff baseline with the current snapshot without emitting a delta."""
        self._last_spot = self.snapshot.underlying.spot.model_dump()
        self._last_summary = self.snapshot.summary.model_dump()
        self._last_rows_by_strike = {row.strike: row.model_dump() for row in self.snapshot.rows}
        self._force_next_delta = False

    def update_config(self, config: Config) -> None:
        self.snapshot.config = config
        self._force_next_delta = True

    def update_underlying_spot(self, spot: UnderlyingSpot) -> None:
        self.snapshot.underlying.spot = spot

    def update_summary(self, summary: Summary) -> None:
        self.snapshot.summary = summary

    def derive_summary_defaults(self) -> None:
        # Placeholder derived values until analytics/runtime integration is complete.
        window = self.snapshot.config.window_strikes_each_side
        pin_risk = float(max(0, min(100, window * 2)))
        self.snapshot.summary.pin_risk = pin_risk

        if self.snapshot.summary.msi_strikes:
            spot = self.snapshot.underlying.spot.mid
            if spot and spot > 0:
                nearest = min(abs(k - spot) / spot for k in self.snapshot.summary.msi_strikes)
                self.snapshot.summary.nearest_msi_distance_pct = nearest
        elif not self.snapshot.rows:
            self.snapshot.summary.nearest_msi_distance_pct = None

    def compute_delta(self) -> DeltaEnvelopePayload | None:
        current = self.snapshot
        underlying_patch: dict[str, Any] = {}
        current_spot = current.underlying.spot.model_dump()
        if current_spot != self._last_spot:
            underlying_patch["spot"] = current_spot

        summary_patch: dict[str, Any] = {}
        current_summary = current.summary.model_dump()
        for key, value in current_summary.items():
            if self._last_summary.get(key) != value:
                summary_patch[key] = value

        current_rows_by_strike: dict[float, dict[str, Any]] = {}
        row_patches: list[dict[str, Any]] = []
        for row in current.rows:
            row_dump = row.model_dump()
            current_rows_by_strike[row.strike] = row_dump
            if self._last_rows_by_strike.get(row.strike) != row_dump:
                row_patches.append(row_dump)

        if not self._force_next_delta and not underlying_patch and not summary_patch and not row_patches:
            return None

        self._last_spot = current_spot
        self._last_summary = current_summary
        self._last_rows_by_strike = current_rows_by_strike
        self._force_next_delta = False

        return DeltaEnvelopePayload(
            underlying_patch=underlying_patch,
            summary_patch=summary_patch,
            row_patches=row_patches,
        )
