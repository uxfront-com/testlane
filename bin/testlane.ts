#!/usr/bin/env node
import { main } from "../src/main.ts";

let code: number;
try {
  code = await main(process.argv.slice(2));
} catch (error) {
  // main() should never reject; this is a last-resort guard.
  console.error(`error(E_INTERNAL): ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
process.exit(code);
