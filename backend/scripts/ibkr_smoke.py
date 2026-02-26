from __future__ import annotations

import argparse
import asyncio

from ib_insync import util

from app.ibkr.config import IBKRConfig
from app.ibkr.connector import IBKRConnector


async def run(symbol: str, include_option: bool, paper: bool) -> int:
    cfg = IBKRConfig.from_env()
    connector = IBKRConnector(cfg)

    if not await connector.connect(paper=paper):
        print("connect: FAIL")
        return 1

    print("connect: OK")
    stock = await connector.subscribe_underlying_stream(symbol)
    await asyncio.sleep(2)
    if stock is None:
        print("stock stream: FAIL")
        await connector.disconnect()
        return 1

    print(
        "stock stream: OK",
        {
            "symbol": symbol,
            "last": stock.last,
            "bid": stock.bid,
            "ask": stock.ask,
            "close": stock.close,
        },
    )

    if include_option:
        chain = await connector.get_option_chain(symbol=symbol, min_dte=0, max_dte=1)
        if not chain:
            print("option chain: FAIL")
            await connector.disconnect()
            return 1

        reference = stock.mid if getattr(stock, "mid", None) else stock.last
        if reference is None:
            reference = stock.close
        if reference is None:
            reference = 0.0

        candidate = min(chain, key=lambda c: abs(float(c.strike) - float(reference)))
        qualified = await connector.qualify_contracts([candidate])
        option_contract = qualified[0] if qualified else candidate
        ticker = await connector.subscribe_option_stream(option_contract)
        await asyncio.sleep(2)
        print(
            "option stream:",
            "OK" if ticker else "FAIL",
            {
                "contract": str(option_contract),
                "last": getattr(ticker, "last", None) if ticker else None,
                "bid": getattr(ticker, "bid", None) if ticker else None,
                "ask": getattr(ticker, "ask", None) if ticker else None,
            },
        )

    await connector.disconnect()
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--symbol", default="QQQ")
    parser.add_argument("--with-option", action="store_true")
    parser.add_argument("--live", action="store_true")
    args = parser.parse_args()
    return util.run(run(args.symbol, args.with_option, paper=not args.live))


if __name__ == "__main__":
    raise SystemExit(main())
