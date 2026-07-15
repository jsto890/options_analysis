from __future__ import annotations

from ib_insync.contract import Contract, Index, Stock

SYMBOL_META: dict[str, dict] = {
    "SPY": {"kind": "stock", "exchange": "SMART"},
    "QQQ": {"kind": "stock", "exchange": "SMART"},
    "IWM": {"kind": "stock", "exchange": "SMART"},
    "DIA": {"kind": "stock", "exchange": "SMART"},
    "SPX": {"kind": "index", "exchange": "CBOE", "trading_class": "SPXW"},
    "NDX": {"kind": "index", "exchange": "NASDAQ", "trading_class": "NDXP"},
    "RUT": {"kind": "index", "exchange": "RUSSELL", "trading_class": "RUTW"},
    "DJX": {"kind": "index", "exchange": "CBOE", "trading_class": "DJX"},
}


def build_underlying(symbol: str) -> Contract:
    sym = symbol.upper()
    meta = SYMBOL_META[sym]  # KeyError on unknown is intentional
    if meta["kind"] == "index":
        return Index(sym, meta["exchange"], "USD")
    return Stock(sym, meta["exchange"], "USD")


def is_index(symbol: str) -> bool:
    meta = SYMBOL_META.get(symbol.upper())
    return bool(meta and meta["kind"] == "index")


def option_trading_class(symbol: str) -> str | None:
    meta = SYMBOL_META.get(symbol.upper())
    if not meta:
        return None
    return meta.get("trading_class")
