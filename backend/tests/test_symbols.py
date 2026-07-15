from ib_insync.contract import Index, Stock

from app.ibkr.symbols import (
    SYMBOL_META,
    build_underlying,
    is_index,
    option_trading_class,
)


def test_meta_covers_all_eight_symbols_in_order():
    assert list(SYMBOL_META) == [
        "SPY", "QQQ", "IWM", "DIA", "SPX", "NDX", "RUT", "DJX",
    ]


def test_build_underlying_stock():
    c = build_underlying("QQQ")
    assert isinstance(c, Stock)
    assert (c.symbol, c.exchange, c.currency) == ("QQQ", "SMART", "USD")


def test_build_underlying_index_exchanges():
    spx = build_underlying("SPX")
    assert isinstance(spx, Index)
    assert (spx.symbol, spx.exchange, spx.currency) == ("SPX", "CBOE", "USD")
    assert build_underlying("NDX").exchange == "NASDAQ"
    assert build_underlying("RUT").exchange == "RUSSELL"
    assert build_underlying("DJX").exchange == "CBOE"


def test_build_underlying_uppercases_and_rejects_unknown():
    assert build_underlying("spx").symbol == "SPX"
    import pytest
    with pytest.raises(KeyError):
        build_underlying("TSLA")


def test_is_index_and_trading_class():
    assert is_index("SPX") and not is_index("SPY")
    assert option_trading_class("SPX") == "SPXW"
    assert option_trading_class("NDX") == "NDXP"
    assert option_trading_class("RUT") == "RUTW"
    assert option_trading_class("DJX") == "DJX"
    assert option_trading_class("QQQ") is None
