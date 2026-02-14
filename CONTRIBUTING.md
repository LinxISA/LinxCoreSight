# Contributing

Thanks for contributing to LinxCoreSight.

## Development Setup

Prereqs:

- Node.js 18+ (Node 20 recommended)
- npm

Install:

```bash
git clone https://github.com/zhoubot/LinxCoreSight.git
cd LinxCoreSight
npm install
```

Run (renderer dev server):

```bash
npm run dev
```

Run (Electron dev flow):

```bash
npm run electron:dev
```

Typecheck:

```bash
npm run typecheck
```

## Toolchains

LinxCoreSight can use bundled toolchains under `toolchains/` or fall back to your home directory.
See `toolchains/README.md`.

## Pull Requests

- Keep PRs focused (one change per PR).
- Prefer adding a short reproduction/verification note to the PR description.
- Ensure `npm run typecheck` passes.
