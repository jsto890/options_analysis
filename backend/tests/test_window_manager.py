from app.ibkr.window_manager import StrikeWindowManager


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
