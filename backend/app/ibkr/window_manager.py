from __future__ import annotations

from dataclasses import dataclass


def infer_strike_step(strikes: list[float]) -> float:
    """Infer the chain's strike increment from actual listed strikes.

    Takes the median of consecutive differences across sorted unique
    strikes. Fewer than two distinct strikes gives no usable spacing, so
    this falls back to 1.0 (the ETF-style default).
    """
    unique_sorted = sorted(set(strikes))
    if len(unique_sorted) < 2:
        return 1.0
    diffs = sorted(b - a for a, b in zip(unique_sorted, unique_sorted[1:]))
    return diffs[len(diffs) // 2]


@dataclass(frozen=True)
class WindowPlan:
    target_strikes: list[float]
    add_strikes: list[float]
    remove_strikes: list[float]
    strike_step: float = 1.0


class StrikeWindowManager:
    """Computes target strike windows and paced roll plans."""

    def __init__(self, strikes_each_side: int = 20, roll_threshold_strikes: int = 2):
        self.strikes_each_side = max(1, strikes_each_side)
        self.roll_threshold_strikes = max(1, roll_threshold_strikes)

    @staticmethod
    def nearest_index(strikes: list[float], spot: float) -> int:
        if not strikes:
            return 0
        return min(range(len(strikes)), key=lambda idx: abs(strikes[idx] - spot))

    def target_window(self, all_strikes: list[float], spot: float) -> list[float]:
        if not all_strikes:
            return []
        ordered = sorted(all_strikes)
        atm = self.nearest_index(ordered, spot)
        desired = min(len(ordered), (2 * self.strikes_each_side) + 1)
        start = max(0, atm - self.strikes_each_side)
        end = min(len(ordered), start + desired)
        start = max(0, end - desired)
        return ordered[start:end]

    def should_roll(self, current_window: list[float], all_strikes: list[float], spot: float) -> bool:
        if not current_window or not all_strikes:
            return True

        ordered = sorted(all_strikes)
        current_atm = self.nearest_index(sorted(current_window), spot)
        target_atm = self.nearest_index(ordered, spot)
        return abs(target_atm - current_atm) >= self.roll_threshold_strikes

    def plan_roll(
        self,
        current_window: list[float],
        all_strikes: list[float],
        spot: float,
    ) -> WindowPlan:
        target = self.target_window(all_strikes, spot)
        current_set = set(current_window)
        target_set = set(target)

        add_strikes = sorted(target_set - current_set)
        remove_strikes = sorted(current_set - target_set)

        return WindowPlan(
            target_strikes=target,
            add_strikes=add_strikes,
            remove_strikes=remove_strikes,
            strike_step=infer_strike_step(all_strikes),
        )
