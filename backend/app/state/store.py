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
        self._last_sent = snapshot.model_copy(deep=True)
        self._force_next_delta = False

    def force_delta(self) -> None:
        self._force_next_delta = True

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
        prev = self._last_sent

        underlying_patch: dict[str, Any] = {}
        if current.underlying.spot.model_dump() != prev.underlying.spot.model_dump():
            underlying_patch["spot"] = current.underlying.spot.model_dump()

        summary_patch: dict[str, Any] = {}
        current_summary = current.summary.model_dump()
        prev_summary = prev.summary.model_dump()
        for key, value in current_summary.items():
            if prev_summary.get(key) != value:
                summary_patch[key] = value

        prev_by_strike = {row.strike: row for row in prev.rows}
        row_patches: list[dict[str, Any]] = []
        for row in current.rows:
            prev_row = prev_by_strike.get(row.strike)
            row_dump = row.model_dump()
            if prev_row is None or prev_row.model_dump() != row_dump:
                row_patches.append(row_dump)

        if not self._force_next_delta and not underlying_patch and not summary_patch and not row_patches:
            return None

        self._last_sent = current.model_copy(deep=True)
        self._force_next_delta = False

        return DeltaEnvelopePayload(
            underlying_patch=underlying_patch,
            summary_patch=summary_patch,
            row_patches=row_patches,
        )
