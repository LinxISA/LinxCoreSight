# LinxTrace v1 (Consumer View)

LinxCoreSight consumes LinxTrace v1 emitted by LinxCore tools.

## Required Inputs

- `*.linxtrace.jsonl` (event stream)
- `*.linxtrace.meta.json` (schema sidecar)

## Strict Validation

Viewer load is aborted when any of the following is true:

- `format != linxtrace.v1`
- `contract_id` mismatch vs stage/lane/row schema
- unknown event type
- unknown stage/lane token in `OCC`
- unknown `row_id` reference
- no `OCC` records

CLI checks:

- `node /Users/zhoubot/LinxCoreSight/scripts/linxtrace_cli.js schema-check <trace>`
- `node /Users/zhoubot/LinxCoreSight/scripts/linxtrace_cli.js lint <trace>`
- `node /Users/zhoubot/LinxCoreSight/scripts/linxtrace_cli.js first-failure <trace>`
- `node /Users/zhoubot/LinxCoreSight/scripts/linxtrace_cli.js render-check <trace>`

## Rendering Model

- Draw only explicit occupancy records (`OCC`) at `(cycle, row, stage, lane)`.
- Do not infer stage transitions or pipeline ordering.
- Use labels from `LABEL` events and row defaults from `row_catalog`.
- For large traces, use virtualized scroll + viewport queries; avoid full-height canvas assumptions.

## Debug-First Policy

When there is a rendering mismatch:
1. Run `schema-check` + `lint`.
2. Run `first-failure` to find the first broken record.
3. Run `render-check` to validate renderer constraints.
4. Only then inspect UI handlers (pan/zoom/hover/tabs).
