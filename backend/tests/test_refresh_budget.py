from __future__ import annotations

from time import perf_counter

from app.schemas import Config, ContractBlock, StrikeRow, build_default_snapshot
from app.state.store import RuntimeStore


def test_runtime_delta_compute_budget_under_50ms():
    snapshot = build_default_snapshot(config=Config())
    snapshot.rows = [
        StrikeRow(
            strike=410.0 + idx,
            call=ContractBlock(contract_id=f"c-{idx}", mid=1.0),
            put=ContractBlock(contract_id=f"p-{idx}", mid=1.0),
        )
        for idx in range(120)
    ]
    store = RuntimeStore(snapshot)

    elapsed_ms: list[float] = []
    for idx in range(200):
        row = store.snapshot.rows[idx % len(store.snapshot.rows)]
        row.call.mid = (row.call.mid or 1.0) + 0.01
        started = perf_counter()
        delta = store.compute_delta()
        elapsed_ms.append((perf_counter() - started) * 1000.0)
        assert delta is not None

    p95 = sorted(elapsed_ms)[int(len(elapsed_ms) * 0.95)]
    assert p95 < 50.0
