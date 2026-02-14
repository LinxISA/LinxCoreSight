# LinxCoreSight Sample Project

This is a sample LinxISA project for testing the LinxCoreSight IDE.

## Project Structure

```
sample_project/
├── test.c       # Main test program in C
└── (generated)  # build outputs are intentionally not tracked
```

## Writing LinxISA Programs

### Entry Point

Your program must use `_start` as the entry point (not `main`):

```c
void _start(void) {
    // Your code here
    linx_exit(0);  // Exit when done
}
```

### UART Output

Use UART at address `0x10000000` for output:

```c
#define UART_BASE  0x10000000
#define UART_DR    (*(volatile uint32_t *)(UART_BASE + 0x00))

static inline void uart_putc(char c) {
    UART_DR = (uint32_t)(unsigned char)c;
}
```

### Exiting

Use the EXIT register at `0x10000004` to terminate:

```c
#define EXIT_REG   0x10000004
#define EXIT_CODE  (*(volatile uint32_t *)(EXIT_REG))

static inline void linx_exit(int code) {
    EXIT_CODE = code;
    while(1) {}  // Prevent continuing
}
```

### Compilation Flags

```bash
clang -target linx64-linx-none-elf -O2 -ffreestanding -fno-builtin -nostdlib -c test.c -o test.o
ld.lld -r test.o -o test
```

### Running in QEMU

```bash
qemu-system-linx64 -machine virt -nographic -kernel test -dtb <path-to-dtb> -m 512M
```

## LinxISA Assembly Features

The generated assembly shows unique LinxISA features:
- **Compressed instructions**: `c.movi`, `c.addi`, `c.movr`
- **Tail calls**: `addtpc` (add to program counter)
- **Predicate execution**: `C.BSTART`, `C.BSTART.STD`
- **Tile operations**: `hl.lui`, `hl.*` prefix for tile operations

## Example Output

When run in QEMU:

```
=================================
  LinxCoreSight Test Program
=================================

Test 1: Basic Arithmetic
  42 + 10 = 52
  42 - 10 = 32
  42 * 10 = 420
  42 / 10 = 4

Test 2: Loop (count 1 to 5)
  1 2 3 4 5 

Test 3: Array operations
  Sum of array: 150

=================================
  All tests completed!
=================================
```
