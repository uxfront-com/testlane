#!/usr/bin/env node
import { main } from "../src/main.ts";

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error) => {
    // main() should never reject; this is a last-resort guard.
    console.error(`error(E_INTERNAL): ${error?.message ?? String(error)}`);
    process.exit(1);
  },
);
