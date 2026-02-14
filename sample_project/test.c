// LinxCoreSight Sample Project
// A simple LinxISA test program

#include <stdint.h>

// UART addresses for QEMU emulation
#define UART_BASE     0x10000000
#define EXIT_REG      0x10000004
#define UART_DR       (*(volatile uint32_t *)(UART_BASE + 0x00))
#define EXIT_CODE     (*(volatile uint32_t *)(EXIT_REG))

// Exit using the EXIT register
static inline void linx_exit(int code) {
    EXIT_CODE = code;
    // Infinite loop to prevent continuing
    while(1) {}
}

// Output a character to UART
static inline void uart_putc(char c) {
    UART_DR = (uint32_t)(unsigned char)c;
}

// Output a string
static inline void uart_puts(const char *s) {
    while (*s) {
        uart_putc(*s++);
    }
}

// Output a decimal number
static inline void uart_putdec(uint64_t v) {
    char buf[32];
    int i = 0;
    
    if (v == 0) {
        uart_putc('0');
        return;
    }
    
    while (v > 0) {
        buf[i++] = '0' + (v % 10);
        v /= 10;
    }
    
    while (i > 0) {
        uart_putc(buf[--i]);
    }
}

// Entry point must be _start for QEMU
void _start(void) {
    uart_puts("=================================\r\n");
    uart_puts("  LinxCoreSight Test Program\r\n");
    uart_puts("=================================\r\n\r\n");
    
    // Test 1: Basic arithmetic
    uart_puts("Test 1: Basic Arithmetic\r\n");
    int a = 42;
    int b = 10;
    int sum = a + b;
    int diff = a - b;
    int prod = a * b;
    int quot = a / b;
    
    uart_puts("  42 + 10 = ");
    uart_putdec(sum);
    uart_puts("\r\n");
    
    uart_puts("  42 - 10 = ");
    uart_putdec(diff);
    uart_puts("\r\n");
    
    uart_puts("  42 * 10 = ");
    uart_putdec(prod);
    uart_puts("\r\n");
    
    uart_puts("  42 / 10 = ");
    uart_putdec(quot);
    uart_puts("\r\n\r\n");
    
    // Test 2: Loops
    uart_puts("Test 2: Loop (count 1 to 5)\r\n  ");
    for (int i = 1; i <= 5; i++) {
        uart_putdec(i);
        uart_puts(" ");
    }
    uart_puts("\r\n\r\n");
    
    // Test 3: Memory access
    uart_puts("Test 3: Array operations\r\n");
    int arr[5] = {10, 20, 30, 40, 50};
    int total = 0;
    for (int i = 0; i < 5; i++) {
        total += arr[i];
    }
    uart_puts("  Sum of array: ");
    uart_putdec(total);
    uart_puts("\r\n\r\n");
    
    uart_puts("=================================\r\n");
    uart_puts("  All tests completed!\r\n");
    uart_puts("=================================\r\n");
    
    // Exit with EBREAK
    linx_exit(0);
}
