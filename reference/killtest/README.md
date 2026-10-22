# Kill-test reference code (Python, 22 Oct 2026)

Copied from `youcam-hackathon/killtest`. These are the working originals to port to TypeScript, not app code.

- `youcam_client.py`: upload (`/s2s/v2.0/file`), task create (never auto-retried), poll to success/error, ledger with a unit cap, cache by input hash, balance (`/s2s/v1.0/client/credit`), feature cost. Reads `.env` from its own folder and `inputs/` paths as in the kill test.
- `brow_composite.py`: paste only the brows from a makeup-vto result back onto the original (MediaPipe brow landmarks, feathered mask, global shift removed), plus the sRGB to CIELAB and L* patch measurement.
- `report_and_measure.py`: report and summary builder, percentiles, verdict rules.

Results behind every claim: `docs/api-truth-table.md`.
