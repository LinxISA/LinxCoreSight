# LinxCoreSight CLI

Command-line interface for LinxCoreSight project scaffolding, diagnostics, and developer workflows.

## Install (Local)

```bash
cd /Users/zhoubot/LinxCoreSight/cli
npm install
npm run build
node ./dist/index.js --help
```

## Binary Names

- Primary: `linxcoresight`
- Legacy alias: `januscore`

## Project Config Files

- Primary: `linxcoresight.json`
- Legacy compatibility: `januscore.json`

## Project Templates

```bash
linxcoresight project create myproj -t empty
linxcoresight project create coremark-demo -t coremark
linxcoresight project create dhrystone-demo -t dhrystone
linxcoresight project create drystone-demo -t drystone   # alias -> dhrystone
```

Prepared benchmark templates copy:

- template scaffold from `/Users/zhoubot/LinxCoreSight/templates/prepared/...`
- benchmark sources from `/Users/zhoubot/LinxCoreSight/third_party/benchmarks/...`

## Doctor

`doctor` now performs real checks for local toolchain binaries and versions.

```bash
linxcoresight doctor
linxcoresight doctor --smoke
```

Checks include:

- `clang`
- `clang++`
- `ld.lld`
- `qemu-system-linx64`
- `pyc-compile`
- `linx-isa` root

`--smoke` additionally runs a small compile + QEMU startup probe.

## Notes

Some command groups are still placeholder-oriented while IDE integration is refined, but project templating and diagnostics are functional.
