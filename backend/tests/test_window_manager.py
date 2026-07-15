from app.ibkr.window_manager import StrikeWindowManager, infer_strike_step


def test_infer_step_spx_five_wide():
    assert infer_strike_step([5900.0, 5905.0, 5910.0, 5915.0]) == 5.0


def test_infer_step_mixed_far_wings():
    strikes = [
        5870.0, 5895.0, 5900.0, 5905.0, 5910.0, 5915.0,
        5920.0, 5925.0, 5930.0, 5935.0, 5960.0, 5985.0,
    ]
    assert infer_strike_step(strikes) == 5.0


def test_infer_step_degenerate():
    assert infer_strike_step([100.0]) == 1.0


def test_target_window_five_wide_strikes_contains_actual_neighbors():
    manager = StrikeWindowManager(strikes_each_side=1, roll_threshold_strikes=1)
    strikes = [5895.0, 5900.0, 5905.0, 5910.0, 5915.0, 5920.0]

    window = manager.target_window(strikes, spot=5907.0)

    assert window == [5900.0, 5905.0, 5910.0]
    assert 5905.0 in window
    assert 5910.0 in window
    assert 5907.0 not in window


def test_plan_roll_carries_inferred_strike_step():
    manager = StrikeWindowManager(strikes_each_side=1, roll_threshold_strikes=1)
    strikes = [5895.0, 5900.0, 5905.0, 5910.0, 5915.0, 5920.0]

    plan = manager.plan_roll(current_window=[], all_strikes=strikes, spot=5907.0)

    assert plan.strike_step == 5.0


def test_target_window_centered_around_nearest_spot():
    manager = StrikeWindowManager(strikes_each_side=2, roll_threshold_strikes=2)
    strikes = [420.0, 421.0, 422.0, 423.0, 424.0, 425.0, 426.0]

    window = manager.target_window(strikes, spot=424.2)
    assert window == [422.0, 423.0, 424.0, 425.0, 426.0]


def test_plan_roll_returns_adds_and_removes():
    manager = StrikeWindowManager(strikes_each_side=1, roll_threshold_strikes=1)

    current = [430.0, 431.0, 432.0]
    all_strikes = [429.0, 430.0, 431.0, 432.0, 433.0]
    plan = manager.plan_roll(current_window=current, all_strikes=all_strikes, spot=432.7)

    assert plan.target_strikes == [431.0, 432.0, 433.0]
    assert plan.add_strikes == [433.0]
    assert plan.remove_strikes == [430.0]
