# LinxCoreSight CLI

Command-line interface for LinxCoreSight.

This CLI is intended for:

- scaffolding simple LinxISA projects
- running basic build/run workflows
- launching IDE-centric actions from the terminal

## Install (local development)

```bash
cd LinxCoreSight/cli
npm install
npm run build
node ./dist/index.js --help
```

## Binary name

- Primary: `linxcoresight`
- Legacy alias: `januscore` (kept for compatibility)

## Project config file

- Primary: `linxcoresight.json`
- Legacy: `januscore.json` (accepted when opening an existing project)

## Commands (v1)

The CLI provides these top-level groups:

- `project` (create/open/list)
- `build` (build/clean/rebuild)
- `run` (run/debug/simulate)
- `visualize` (schematic/pipeview/trace/waveform)
- `file` (new/open/list)
- `config` (get/set/list)
- `agent` (basic automation hooks)
- `doctor` / `version` / `help`

Some subcommands are placeholders in v1 and may print simulated output while the IDE integration is refined.
