from __future__ import annotations

from dataclasses import dataclass
from math import log
from typing import Iterable, TypedDict


class IVQuote(TypedDict, total=False):
    contract_id: str
    strike: float
    right: str
    model_iv: float | None
    liquid: bool


@dataclass(frozen=True)
class IVCoefficients:
    a: float
    b: float
    c: float


@dataclass(frozen=True)
class IVFitResult:
    coefficients_by_right: dict[str, IVCoefficients | None]
    residual_by_contract: dict[str, float | None]


def _solve_3x3(matrix: list[list[float]], vector: list[float]) -> tuple[float, float, float] | None:
    # Gaussian elimination with partial pivoting for a 3x3 system.
    a = [row[:] + [vector[i]] for i, row in enumerate(matrix)]

    for i in range(3):
        pivot = max(range(i, 3), key=lambda r: abs(a[r][i]))
        if abs(a[pivot][i]) < 1e-12:
            return None
        if pivot != i:
            a[i], a[pivot] = a[pivot], a[i]

        scale = a[i][i]
        for c in range(i, 4):
            a[i][c] /= scale

        for r in range(3):
            if r == i:
                continue
            factor = a[r][i]
            for c in range(i, 4):
                a[r][c] -= factor * a[i][c]

    return (a[0][3], a[1][3], a[2][3])


def _fit_quadratic(points: Iterable[tuple[float, float]]) -> IVCoefficients | None:
    xs: list[float] = []
    ys: list[float] = []
    for x, y in points:
        xs.append(x)
        ys.append(y)

    n = len(xs)
    if n < 3:
        return None

    sx = sum(xs)
    sx2 = sum(x * x for x in xs)
    sx3 = sum(x * x * x for x in xs)
    sx4 = sum(x * x * x * x for x in xs)
    sy = sum(ys)
    sxy = sum(x * y for x, y in zip(xs, ys))
    sx2y = sum((x * x) * y for x, y in zip(xs, ys))

    matrix = [
        [float(n), sx, sx2],
        [sx, sx2, sx3],
        [sx2, sx3, sx4],
    ]
    vector = [sy, sxy, sx2y]

    solved = _solve_3x3(matrix, vector)
    if solved is None:
        return None

    a, b, c = solved
    return IVCoefficients(a=a, b=b, c=c)


def fit_iv_curve(option_quotes: list[IVQuote], spot: float, min_fit_points: int = 8) -> IVFitResult:
    if spot <= 0:
        return IVFitResult(coefficients_by_right={"C": None, "P": None}, residual_by_contract={})

    coefficients_by_right: dict[str, IVCoefficients | None] = {"C": None, "P": None}
    residual_by_contract: dict[str, float | None] = {}

    for right in ("C", "P"):
        fit_points: list[tuple[float, float]] = []
        right_quotes: list[IVQuote] = []

        for quote in option_quotes:
            if quote.get("right") != right:
                continue
            right_quotes.append(quote)

            iv = quote.get("model_iv")
            if not quote.get("liquid", False) or iv is None:
                continue
            if iv < 0.01 or iv > 5.0:
                continue

            strike = float(quote.get("strike", 0.0))
            if strike <= 0:
                continue

            x = log(strike / spot)
            fit_points.append((x, iv))

        if len(fit_points) >= min_fit_points:
            coefficients_by_right[right] = _fit_quadratic(fit_points)

        coeffs = coefficients_by_right[right]
        for quote in right_quotes:
            contract_id = str(quote.get("contract_id", ""))
            iv = quote.get("model_iv")
            strike = float(quote.get("strike", 0.0))
            if not contract_id or iv is None or strike <= 0 or coeffs is None:
                residual_by_contract[contract_id] = None
                continue

            x = log(strike / spot)
            fitted = coeffs.a + coeffs.b * x + coeffs.c * x * x
            residual_by_contract[contract_id] = iv - fitted

    return IVFitResult(coefficients_by_right=coefficients_by_right, residual_by_contract=residual_by_contract)
