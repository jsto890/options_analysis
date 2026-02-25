import os
from contextlib import suppress

import pytest

ib_insync = pytest.importorskip("ib_insync")
from app.ibkr.config import IBKRConfig
from app.ibkr.connector import IBKRConnector, ReadOnlyViolation


def test_ib_insync_can_instantiate_client():
    ib = ib_insync.IB()
    try:
        assert isinstance(ib, ib_insync.IB)
    finally:
        with suppress(Exception):
            ib.disconnect()


@pytest.mark.skipif(
    os.getenv("ENABLE_IB_GATEWAY_TESTS") != "1",
    reason="requires running IB Gateway/TWS at 127.0.0.1:7497",
)
def test_ib_insync_live_connection():
    ib = ib_insync.IB()
    client_id = int(os.getenv("IBKR_CLIENT_ID", "19"))
    try:
        ib.connect("127.0.0.1", 7497, clientId=client_id)
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
