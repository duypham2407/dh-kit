import { runCli } from "./commands/root.js";

const exitCode = await runCli(process.argv.slice(2), process.cwd());
process.exitCode = exitCode;
