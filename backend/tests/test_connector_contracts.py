import asyncio
from types import SimpleNamespace

import pytest

ib_insync = pytest.importorskip("ib_insync")
from ib_insync import Index, Stock

from app.ibkr.config import IBKRConfig
from app.ibkr.connector import IBKRConnector


class FakeIB:
    def __init__(self, *, chains, conid: int = 111):
        self._connected = True
        self._chains = chains
        self._conid = conid
        self.qualified_contracts: list = []

    def isConnected(self) -> bool:
        return self._connected

    async def qualifyContractsAsync(self, contract):
        self.qualified_contracts.append(contract)
        contract.conId = self._conid
        return [contract]

    async def reqSecDefOptParamsAsync(self, symbol, exchange, secType, conid):
        _ = (symbol, exchange, secType, conid)
        return self._chains


def _chain_record(trading_class: str, strikes, expirations):
    return SimpleNamespace(
        exchange="SMART",
        underlyingConId=111,
        tradingClass=trading_class,
        multiplier="100",
        expirations=expirations,
        strikes=strikes,
    )


def _make_connector(fake_ib: FakeIB) -> IBKRConnector:
    connector = IBKRConnector(IBKRConfig(read_only=True))
    connector.ib = fake_ib  # type: ignore[assignment]
    connector.connected = True
    return connector


def test_qualify_underlying_builds_index_contract():
    fake_ib = FakeIB(chains=[])
    connector = _make_connector(fake_ib)

    contract = asyncio.run(connector.qualify_underlying("SPX"))

    assert isinstance(fake_ib.qualified_contracts[0], Index)
    assert contract.secType == "IND"
    assert contract.symbol == "SPX"


def test_qualify_underlying_builds_stock_contract_for_etf():
    fake_ib = FakeIB(chains=[])
    connector = _make_connector(fake_ib)

    contract = asyncio.run(connector.qualify_underlying("QQQ"))

    assert isinstance(fake_ib.qualified_contracts[0], Stock)
    assert contract.secType == "STK"
    assert contract.symbol == "QQQ"


def test_chain_filters_to_weekly_trading_class_for_index():
    expirations = ["20260717"]
    fake_ib = FakeIB(
        chains=[
            _chain_record("SPX", strikes=[4000.0], expirations=expirations),
            _chain_record("SPXW", strikes=[5000.0, 5001.0], expirations=expirations),
        ]
    )
    connector = _make_connector(fake_ib)

    options = asyncio.run(connector.get_option_chain("SPX", min_dte=0, max_dte=365))

    assert options, "expected options to be returned"
    strikes = {opt.strike for opt in options}
    assert strikes == {5000.0, 5001.0}
    assert all(opt.tradingClass == "SPXW" for opt in options)


def test_chain_unfiltered_for_etf():
    expirations = ["20260717"]
    fake_ib = FakeIB(chains=[_chain_record("", strikes=[430.0, 431.0], expirations=expirations)])
    connector = _make_connector(fake_ib)

    options = asyncio.run(connector.get_option_chain("QQQ", min_dte=0, max_dte=365))

    assert options, "expected options to be returned"
    strikes = {opt.strike for opt in options}
    assert strikes == {430.0, 431.0}
    assert all(opt.tradingClass == "" for opt in options)
