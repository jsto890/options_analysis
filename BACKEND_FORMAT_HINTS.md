# BACKEND_FORMAT_HINTS.md
These are optional hints. Backend still sends numeric values.
Frontend applies UI_FORMATTING.md.

1. All numeric values sent over websocket should be raw floats and ints.
2. Do not pre format numbers as strings.
3. Ensure nulls are null, not NaN.
4. Clamp values where specified:
   1. iv clamped to [0.01, 5.0]
5. Ensure spread_pct is a fraction, not percent.
6. Ensure iv and iv_residual are decimals, not percent.
7. Always include stale_ms as integer.
8. Always include liquid as boolean.
9. Always include ts_ms in envelopes.

End of BACKEND_FORMAT_HINTS.md