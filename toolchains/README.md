# Toolchains Directory

This directory should contain the LinxISA toolchain binaries for bundling with LinxCoreSight.

## Required Directory Structure

Place your toolchains in the following structure:

```
toolchains/
├── qemu/
│   └── build-linx/
│       └── qemu-system-linx64       # QEMU for LinxISA
├── llvm-project/
│   └── build-linxisa-clang/
│       └── bin/
│           ├── clang                 # C Compiler
│           ├── clang++               # C++ Compiler
│           └── ld.lld                # Linker
├── pyCircuit/                        # pyCircuit (optional)
└── linxisa/                          # LinxISA libraries (optional)
```

## Setting Up Bundled Toolchains

1. Create the required directory structure above
2. Copy or symlink your toolchain binaries
3. Rebuild the application

For development, you can also use the toolchains in your home directory:
- QEMU: `~/qemu/build-linx/qemu-system-linx64`
- Clang: `~/llvm-project/build-linxisa-clang/bin/clang`
- LLD: `~/llvm-project/build-linxisa-clang/bin/ld.lld`

The IDE will automatically detect bundled toolchains first, then fall back to your home directory.
