# FRONTEND_RENDER_CHECKLIST.md
Before shipping v1, verify:

1. Column widths are fixed and table does not shift.
2. Numerals do not jitter. Use tabular numerals.
3. Null fields are rendered as middle dot in ladder.
4. Stale contracts display muted and show S flag.
5. Illiquid contracts never show IV imbalance or extreme greek highlights.
6. MSI row highlight appears only for top 3 MSI strikes.
7. MTC badge appears for exactly one call and one put.
8. Copy contract string matches spec exactly.
9. Playback file renders identically to live messages.
10. At 500 ms cadence, CPU stays stable and UI remains responsive.

End of checklist