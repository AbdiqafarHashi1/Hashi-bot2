declare module "node:assert/strict" { function assert(value: unknown, message?: string): asserts value; namespace assert { function equal(actual: unknown, expected: unknown, message?: string): void; } export default assert; }
declare module "node:fs" { export function readFileSync(path: string, encoding: string): string; export function readdirSync(path: string): string[]; export function statSync(path: string): { isDirectory(): boolean }; }
declare module "node:path" { export function join(...parts: string[]): string; }
