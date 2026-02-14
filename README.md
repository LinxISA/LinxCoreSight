# LinxCoreSight

LinxCoreSight is a desktop IDE for LinxISA development with QEMU emulation, pyCircuit simulation, and hardware visualization.

## Features

- **Code Editor**: Monaco-based editor with LinxISA syntax highlighting and IntelliSense
- **Compiler Integration**: One-click compilation with Linx Compiler
- **QEMU Emulation**: Run and debug your code using QEMU for LinxISA
- **Pipeline Visualization**: Interactive pipeview showing instruction pipeline stages
- **Execution Trace**: Detailed trace view with register state
- **Wakeup Chains**: Visualize instruction dependencies and wakeup chains
- **Hierarchical Schematics**: Interactive circuit schematic viewer for Linx core designs
- **Serial Monitor**: Connect to hardware via serial port

## Installation

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build
```

## Technology Stack

- **Frontend**: React 18 + TypeScript + Vite
- **State Management**: Zustand
- **Code Editor**: Monaco Editor
- **Visualization**: D3.js, Cytoscape.js
- **Backend**: Electron
- **Styling**: TailwindCSS

## Project Structure

```
LinxCoreSight/
├── electron/           # Electron main process
│   ├── main.ts       # Main process entry
│   └── preload.ts   # Preload script
├── src/
│   ├── components/   # React components
│   │   ├── Editor/  # Code editor
│   │   ├── Layout/  # Layout components
│   │   ├── Panels/  # Visualization panels
│   │   ├── Toolbar/ # Toolbar
│   │   └── Monitor/ # Serial monitor
│   ├── store/       # Zustand stores
│   ├── styles/      # Global styles
│   └── types/       # TypeScript types
├── package.json
├── vite.config.ts
└── tailwind.config.js
```

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| New File | Ctrl+N |
| Open File | Ctrl+O |
| Save | Ctrl+S |
| Compile | F5 |
| Run | F6 |
| Debug | F7 |
| Stop | Shift+F5 |

## Color Theme

The IDE features a dark theme inspired by Turing Complete game with a circuit/tech aesthetic:

- **Background**: Deep navy black (#0a0e14)
- **Accent Cyan**: Active elements (#00d9ff)
- **Accent Green**: Success/connected (#00ff88)
- **Accent Orange**: Warnings/run (#ff6b35)
- **Accent Purple**: Branches/special (#a855f7)

## Development

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Package as application
npm run build:vite
```

## License

BSD-3-Clause
