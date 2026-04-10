import type { BridgeResult } from "../protocol/error-envelope.js";

export type DelegatedCliCommand = {
  command: string;
  args: string[];
};

export function buildDelegatedCliCommand(input: DelegatedCliCommand): BridgeResult<DelegatedCliCommand> {
  if (!input.command || input.command.trim().length === 0) {
    return {
      ok: false,
      error: {
        code: "bridge.cli.invalid_command",
        message: "command is required for delegated CLI bridge payload",
      },
    };
  }

  return { ok: true, value: input };
}
