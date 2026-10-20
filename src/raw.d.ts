declare module '*.md?raw' { const text: string; export default text; }
declare module '*.sql?raw' { const text: string; export default text; }
declare module '*.wasm?url' { const url: string; export default url; }
