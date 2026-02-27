import asyncio
import os
from contextlib import suppress

import pytest

ib_insync = pytest.importorskip("ib_insync")
from ib_insync import client as ib_client
from ib_insync import connection as ib_connection
from app.ibkr.config import IBKRConfig
from app.ibkr.connector import IBKRConnector, ReadOnlyViolation


class FakeIB:
    def __init__(
        self,
        *,
        in_use_ids: set[int] | None = None,
        cancelled_ids: set[int] | None = None,
        refused_ports: set[int] | None = None,
    ):
        self._connected = False
        self.in_use_ids = in_use_ids or set()
        self.cancelled_ids = cancelled_ids or set()
        self.refused_ports = refused_ports or set()
        self.attempted_client_ids: list[int] = []
        self.attempted_ports: list[int] = []
        self.attempted_pairs: list[tuple[int, int]] = []
        self.market_data_type_calls: list[int] = []

    async def connectAsync(self, host: str, port: int, clientId: int, timeout: int) -> None:
        _ = (host, port, timeout)
        self.attempted_client_ids.append(clientId)
        self.attempted_ports.append(port)
        self.attempted_pairs.append((port, clientId))
        if port in self.refused_ports:
            raise ConnectionRefusedError("Connect call failed")
        if clientId in self.cancelled_ids:
            raise asyncio.CancelledError("Error 326, reqId -1: Unable to connect as the client id is already in use.")
        if clientId in self.in_use_ids:
            raise RuntimeError("Error 326, reqId -1: Unable to connect as the client id is already in use.")
        self._connected = True

    def reqMarketDataType(self, kind: int) -> None:
        self.market_data_type_calls.append(kind)

    def isConnected(self) -> bool:
        return self._connected

    def disconnect(self) -> None:
        self._connected = False


def test_ib_insync_can_instantiate_client():
    ib = ib_insync.IB()
    try:
        assert isinstance(ib, ib_insync.IB)
    finally:
        with suppress(Exception):
            ib.disconnect()


@pytest.mark.skipif(
    os.getenv("ENABLE_IB_GATEWAY_TESTS") != "1",
    reason="requires running IB Gateway/TWS at 127.0.0.1:4002",
)
def test_ib_insync_live_connection():
    ib = ib_insync.IB()
    client_id = int(os.getenv("IBKR_CLIENT_ID", "19"))
    try:
        ib.connect("127.0.0.1", 4002, clientId=client_id)
        assert ib.isConnected()
        assert ib.client.serverVersion() > 0
    finally:
        with suppress(Exception):
            ib.disconnect()


def test_connector_read_only_blocks_order_calls():
    connector = IBKRConnector(IBKRConfig(read_only=True))
    with pytest.raises(ReadOnlyViolation):
        connector.ib.placeOrder(None, None)


def test_connector_does_not_expose_account_summary_cache():
    connector = IBKRConnector(IBKRConfig(read_only=True))
    assert not hasattr(connector, "account_info")


def test_connector_disconnect_restores_ib_loop_hooks():
    connector = IBKRConnector(IBKRConfig(read_only=True))
    loop = asyncio.new_event_loop()
    try:
        async def _bind_once():
            with connector._bound_ib_loop():
                assert ib_connection.getLoop() is asyncio.get_running_loop()

        loop.run_until_complete(_bind_once())
        assert ib_connection.getLoop() is loop
        assert ib_client.getLoop() is loop

        loop.run_until_complete(connector.disconnect())
        assert ib_connection.getLoop is connector._original_connection_get_loop
        assert ib_client.getLoop is connector._original_client_get_loop
    finally:
        loop.close()


def test_connector_retries_with_next_client_id_when_configured_id_is_in_use():
    connector = IBKRConnector(IBKRConfig(read_only=False, client_id=19))
    fake_ib = FakeIB(in_use_ids={19})
    connector.ib = fake_ib  # type: ignore[assignment]
    connector._reset_ib_client = lambda: None  # type: ignore[method-assign]

    connected = asyncio.run(connector.connect(paper=False))

    assert connected is True
    assert connector.active_client_id == 20
    assert fake_ib.attempted_client_ids == [19, 20]
    assert fake_ib.market_data_type_calls == [1]


def test_connector_stops_retrying_after_ten_in_use_client_ids():
    connector = IBKRConnector(IBKRConfig(read_only=False, client_id=19))
    fake_ib = FakeIB(in_use_ids={19, 20, 21, 22, 23, 24, 25, 26, 27, 28})
    connector.ib = fake_ib  # type: ignore[assignment]
    connector._reset_ib_client = lambda: None  # type: ignore[method-assign]

    connected = asyncio.run(connector.connect(paper=False))

    assert connected is False
    assert fake_ib.attempted_pairs == [
        (4001, 19),
        (4001, 20),
        (4001, 21),
        (4001, 22),
        (4001, 23),
        (4001, 24),
        (4001, 25),
        (4001, 26),
        (4001, 27),
        (4001, 28),
        (7496, 19),
        (7496, 20),
        (7496, 21),
        (7496, 22),
        (7496, 23),
        (7496, 24),
        (7496, 25),
        (7496, 26),
        (7496, 27),
        (7496, 28),
    ]


def test_connector_retries_when_connect_raises_cancelled_error_for_in_use_client_id():
    connector = IBKRConnector(IBKRConfig(read_only=False, client_id=19))
    fake_ib = FakeIB(cancelled_ids={19})
    connector.ib = fake_ib  # type: ignore[assignment]
    connector._reset_ib_client = lambda: None  # type: ignore[method-assign]

    connected = asyncio.run(connector.connect(paper=False))

    assert connected is True
    assert connector.active_client_id == 20
    assert fake_ib.attempted_client_ids == [19, 20]


def test_connector_falls_back_to_tws_live_port_when_gateway_live_port_is_refused():
    connector = IBKRConnector(
        IBKRConfig(read_only=False, client_id=19, host="127.0.0.1", live_port=4001, paper_port=4002)
    )
    fake_ib = FakeIB(refused_ports={4001})
    connector.ib = fake_ib  # type: ignore[assignment]
    connector._reset_ib_client = lambda: None  # type: ignore[method-assign]

    connected = asyncio.run(connector.connect(paper=False))

    assert connected is True
    assert fake_ib.attempted_pairs[0] == (4001, 19)
    assert fake_ib.attempted_pairs[1] == (7496, 19)
