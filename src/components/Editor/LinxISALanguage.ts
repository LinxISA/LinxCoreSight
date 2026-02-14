/**
 * LinxISA Language Definition for Monaco Editor
 * Custom syntax highlighting for LinxISA assembly language
 */

import * as monaco from 'monaco-editor';

// LinxISA instruction mnemonics
const INSTRUCTIONS = [
  // Arithmetic
  'add', 'sub', 'addi', 'subi', 'addw', 'subw', 'addiw',
  // Logical  
  'and', 'or', 'xor', 'andi', 'ori', 'xori', 'andw', 'orw', 'xorw', 'not',
  // Shift
  'sll', 'srl', 'sra', 'slli', 'srli', 'srai', 'sllw', 'srlw', 'sraw',
  // Memory - Store
  'sb', 'sh', 'sw', 'sd', 'sbi', 'shi', 'swi', 'sdi',
  // Memory - Load
  'lb', 'lh', 'lw', 'ld', 'lbu', 'lhu', 'lwu', 'ldu', 'lbi', 'lhi', 'lwi', 'ldi',
  // Multiply/Divide
  'mul', 'mulh', 'mulhu', 'mulhsu', 'div', 'divu', 'rem', 'remu',
  'mulw', 'divw', 'divuw', 'remw', 'remuw',
  // Compare
  'cmp.eq', 'cmp.ne', 'cmp.lt', 'cmp.ltu', 'cmp.le', 'cmp.leu', 'cmp.gt', 'cmp.gtu', 'cmp.ge', 'cmp.geu',
  // Conditional Set
  'setc.eq', 'setc.ne', 'setc.lt', 'setc.le', 'setc.ge', 'setc.gt',
  'setc.ltu', 'setc.leu', 'setc.geu', 'setc.gtu',
  'setc.eqi', 'setc.neqi', 'setc.lti', 'setc.gei', 'setc.gti', 'setc.ltui', 'setc.geui',
  // Conditional Select
  'csel', 'cseli', 'cselli',
  // Branch Control
  'C.BSTART', 'C.BSTOP', 'C.BSTART.STD', 'BSTART.STD', 'BSTOP',
  // Function Entry/Exit
  'FENTRY', 'FEXIT', 'FRET', 'FRET.STK',
  // Compressed Instructions
  'c.add', 'c.sub', 'c.and', 'c.or', 'c.xor',
  'c.movr', 'c.movi', 'c.mov',
  'c.addi', 'c.addiw',
  'c.lw', 'c.ld', 'c.lwi', 'c.ldi',
  'c.sw', 'c.sd', 'c.swi', 'c.sdi',
  'c.lb', 'c.lh', 'c.sb', 'c.sh',
  'c.lbu', 'c.lhu', 'c.lwu',
  'c.slli', 'c.srli', 'c.srai',
  'c.sll', 'c.srl', 'c.sra',
  'c.j', 'c.jr', 'c.jal', 'c.jalr',
  'c.beq', 'c.bne', 'c.blt', 'c.bge',
  'c.ebreak', 'c.ecall', 'c.ret',
  // System
  'ebreak', 'ecall', 'eret', 'wfi',
  'csrr', 'csrw', 'csrs', 'csrc', 'csrrw', 'csrrs', 'csrrc',
  // Control Transfer
  'j', 'jal', 'jr', 'jalr', 'jalr.zero',
  // High/Low
  'lui', 'auipc', 'hl.lui', 'hl.auipc',
];

// LinxISA registers
const REGISTERS = [
  // Standard
  'zero', 'x0', 'ra', 'x1', 'sp', 'x2', 'gp', 'x3', 'tp', 'x4', 'fp', 'x8',
  's0', 'x8', 's1', 'x9', 's2', 'x10', 's3', 'x11', 's4', 'x12', 's5', 'x13',
  's6', 'x14', 's7', 'x15', 's8', 'x16', 's9', 'x17', 's10', 'x18', 's11', 'x19',
  'a0', 'x10', 'a1', 'x11', 'a2', 'x12', 'a3', 'x13', 'a4', 'x14', 'a5', 'x15',
  'a6', 'x16', 'a7', 'x17', 't0', 'x5', 't1', 'x6', 't2', 'x7', 't3', 'x28',
  't4', 'x29', 't5', 'x30', 't6', 'x31',
  // Temporary/Vector lane registers
  'u0', 'u1', 'u2', 'u3',
  't0#1', 't1#1', 't2#1', 't3#1', 't4#1', 't5#1', 't6#1',
  'u0#1', 'u1#1', 'u2#1', 'u3#1',
];

// Pseudo-instructions
const PSEUDO = [
  'ret', 'la', 'li', 'mv', 'not', 'neg', 'negw',
  'sext.w', 'zext.w', 'sext.h', 'zext.h', 'sext.b', 'zext.b',
  'seqz', 'snez', 'sltz', 'sgtz',
  'beqz', 'bnez', 'blez', 'bgez', 'bltz', 'bgtz',
  'bgt', 'ble', 'bgtu', 'bleu',
  'call', 'tail', 'nop',
];

// Common C library functions for LinxISA
const C_FUNCTIONS = [
  // Memory
  { name: 'malloc', detail: 'Allocate memory', insert: 'malloc(${1:size})' },
  { name: 'free', detail: 'Free memory', insert: 'free(${1:ptr})' },
  { name: 'memset', detail: 'Fill memory', insert: 'memset(${1:dest}, ${2:value}, ${3:count})' },
  { name: 'memcpy', detail: 'Copy memory', insert: 'memcpy(${1:dest}, ${2:src}, ${3:count})' },
  // String
  { name: 'strlen', detail: 'String length', insert: 'strlen(${1:s})' },
  { name: 'strcmp', detail: 'Compare strings', insert: 'strcmp(${1:s1}, ${2:s2})' },
  { name: 'strcpy', detail: 'Copy string', insert: 'strcpy(${1:dest}, ${2:src})' },
  // I/O (LinxISA UART)
  { name: 'putchar', detail: 'Write character to UART', insert: 'putchar(${1:c})' },
  { name: 'puts', detail: 'Write string to UART', insert: 'puts(${1:s})' },
  { name: 'printf', detail: 'Formatted output to UART', insert: 'printf("${1:format}", ${2:args})' },
  { name: 'getchar', detail: 'Read character from UART', insert: 'getchar()' },
  // Exit
  { name: 'exit', detail: 'Terminate program', insert: 'exit(${1:code})' },
  // Utility
  { name: '_start', detail: 'Program entry point', insert: 'void _start() {\n\t$0\n}' },
  { name: 'main', detail: 'Main function', insert: 'int main(int argc, char **argv) {\n\t$0\n}' },
];

// Directives
const DIRECTIVES = [
  '.section', '.text', '.data', '.rodata', '.bss',
  '.global', '.local', '.weak',
  '.word', '.half', '.byte', '.dword', '.quad',
  '.asciz', '.string', '.ascii',
  '.align', '.balign', '.p2align', '.space', '.skip',
  '.type', '.size', '.ident', '.globl',
  '.macro', '.endm', '.rept', '.endr',
];

// LinxISA specific syntax
const SPECIAL_SYNTAX = [
  '->',   // Destination arrow
  '#',    // Lane specifier
  '[]',   // Memory brackets
  ',',    // Separator
];

export function registerLinxISALanguage() {
  // Register the language
  monaco.languages.register({ id: 'linxisa' });

  // Set language configuration
  monaco.languages.setLanguageConfiguration('linxisa', {
    comments: {
      lineComment: '#',
      blockComment: ['/*', '*/']
    },
    brackets: [
      ['[', ']'],
      ['{', '}'],
      ['(', ')'],
    ],
    autoClosingPairs: [
      { open: '[', close: ']' },
      { open: '{', close: '}' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
    surroundingPairs: [
      { open: '[', close: ']' },
      { open: '{', close: '}' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
    indentationRules: {
      increaseIndentPattern: /^\s*(?:C\.BSTART|FENTRY|label|loop|if|else|then)\b.*$/,
      decreaseIndentPattern: /^\s*(?:C\.BSTOP|FEXIT|FRET|end)\b.*$/,
    },
  });

  // Define tokens
  monaco.languages.setMonarchTokensProvider('linxisa', {
    tokenizer: {
      root: [
        // Comments
        [/#.*$/, 'comment'],
        [/\/\*/, 'comment', '@comment'],

        // Labels
        [/^[a-zA-Z_][a-zA-Z0-9_]*:/, 'tag'],

        // Directives
        [/\.[a-zA-Z_][a-zA-Z0-9_]*/, 'keyword.directive'],

        // Destination arrow (->)
        [/->/, 'delimiter'],

        // Lane specifier (#N)
        [/#\d+/, 'number'],

        // Registers (including lane registers like t0#1)
        [/\b(?:zero|ra|sp|gp|tp|fp|a[0-7]|s[0-9]|t[0-6]|u[0-3]|[xs]\d+)(?:#\d+)?\b/, 'variable'],

        // Instructions:#\d+
        [/\b(?:C\.[A-Z][A-Za-z0-9_]*|F(?:ENTRY|EXIT|RET|RET\.STK)|BSTART\.STD|BSTOP|hl\.[a-z]+|cmp\.[a-z]+|setc\.[a-z]+|csel(?:i)?)\b/, 'keyword'],
        [/\b(?:add|sub|addi|subi|addw|subw|addiw|and|or|xor|andi|ori|xori|andw|orw|xorw|not|sll|srl|sra|slli|srli|srai|sllw|srlw|sraw)\b/, 'keyword'],
        [/\b(?:sb|sh|sw|sd|sbi|shi|swi|sdi|lb|lh|lw|ld|lbu|lhu|lwu|lbi|lhi|lwi|ldi)\b/, 'keyword'],
        [/\b(?:mul|mulh|mulhu|mulhsu|div|divu|rem|remu|mulw|divw|divuw|remw|remuw)\b/, 'keyword'],
        [/\b(?:ebreak|ecall|eret|wfi|csrr|csrw|csrs|csrc|csrrw|csrrs|csrrc)\b/, 'keyword'],
        [/\b(?:j|jal|jr|jalr)\b/, 'keyword'],

        // Pseudo-instructions
        [/\b(?:ret|la|li|mv|not|neg|negw|sext\.[bwh]|zext\.[bwh]|seqz|snez|sltz|sgtz)\b/, 'keyword.pseudo'],

        // Numbers (hex, binary, decimal)
        [/0x[0-9a-fA-F]+/, 'number.hex'],
        [/0b[01]+/, 'number.binary'],
        [/\d+/, 'number'],

        // Strings
        [/"([^"\\]|\\.)*$/, 'string.invalid'],
        [/"/, 'string', '@string'],

        // Operators
        [/[=<>!+\-*/&|^%~@]+/, 'operator'],
      ],

      comment: [
        [/[^\/*]+/, 'comment'],
        [/\*\//, 'comment', '@pop'],
        [/[\/*]/, 'comment']
      ],

      string: [
        [/[^\\"]+/, 'string'],
        [/\\./, 'string.escape'],
        [/"/, 'string', '@pop']
      ],
    },
  });

  // Register completions
  monaco.languages.registerCompletionItemProvider('linxisa', {
    provideCompletionItems: (model, position) => {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn
      };

      const suggestions: monaco.languages.CompletionItem[] = [
        // Instructions
        ...INSTRUCTIONS.map(instr => ({
          label: instr,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: instr,
          range,
          detail: 'LinxISA Instruction'
        })),
        // Registers
        ...REGISTERS.map(reg => ({
          label: reg,
          kind: monaco.languages.CompletionItemKind.Variable,
          insertText: reg,
          range,
          detail: 'Register'
        })),
        // Pseudo-instructions
        ...PSEUDO.map(pseudo => ({
          label: pseudo,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: pseudo,
          range,
          detail: 'Pseudo-instruction'
        })),
        // Directives
        ...DIRECTIVES.map(dir => ({
          label: dir,
          kind: monaco.languages.CompletionItemKind.Property,
          insertText: dir,
          range,
          detail: 'Assembler directive'
        })),
        // C Functions
        ...C_FUNCTIONS.map(fn => ({
          label: fn.name,
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: fn.insert,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
          detail: fn.detail
        })),
      ];

      return { suggestions };
    }
  });
}

// Theme colors for LinxISA
export const linxisaTheme: monaco.editor.IStandaloneThemeData = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '6A9955' },
    { token: 'keyword', foreground: '569CD6' },
    { token: 'keyword.directive', foreground: 'C586C0' },
    { token: 'keyword.pseudo', foreground: '4EC9B0' },
    { token: 'variable', foreground: '9CDCFE' },
    { token: 'number', foreground: 'B5CEA8' },
    { token: 'number.hex', foreground: 'D7BA7D' },
    { token: 'number.binary', foreground: 'D7BA7D' },
    { token: 'string', foreground: 'CE9178' },
    { token: 'tag', foreground: 'DCDCAA' },
    { token: 'delimiter', foreground: 'D4D4D4' },
    { token: 'operator', foreground: 'D4D4D4' },
  ],
  colors: {
    'editor.background': '#0a0e14',
    'editor.foreground': '#d4d4d4',
    'editorLineNumber.foreground': '#6e7681',
    'editorCursor.foreground': '#00d9ff',
    'editor.selectionBackground': '#264f78',
  }
};

export default registerLinxISALanguage;
