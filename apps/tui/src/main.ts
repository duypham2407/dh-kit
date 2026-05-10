import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { createTuiApp, type TuiAppClient } from "./app.js";

type QuestionLoop = {
  question: (query: string) => Promise<string>;
  close: () => void;
};

export type TuiRuntimeOptions = {
  serverUrl: string;
  client: TuiAppClient;
  input?: TuiInput;
  output?: {
    write: (chunk: string) => unknown;
  };
  createQuestionLoop?: (input: TuiInput, output: { write: (chunk: string) => unknown }) => QuestionLoop;
};

export type TuiInput = Partial<NodeJS.ReadableStream> & {
  isTTY?: boolean;
};

export async function runTui(options: TuiRuntimeOptions): Promise<void> {
  const input = options.input ?? stdin;
  const output = options.output ?? stdout;
  const app = createTuiApp({ serverUrl: options.serverUrl, client: options.client });

  await app.attach();
  output.write(`${app.render()}\n`);

  if (!input.isTTY || app.getState().status === "read_only") return;

  const rl = options.createQuestionLoop
    ? options.createQuestionLoop(input, output)
    : createInterface({
      input: input as NodeJS.ReadableStream,
      output: output as NodeJS.WritableStream,
    });

  try {
    while (true) {
      const line = await rl.question("> ");
      if (isExitCommand(line)) break;
      await handleInputLine(app, line);
      output.write(`\n${app.render()}\n`);
    }
  } finally {
    rl.close();
  }
}

function isExitCommand(line: string): boolean {
  const trimmed = line.trim();
  return trimmed === "/quit" || trimmed === "/exit" || trimmed === ":q";
}

async function handleInputLine(app: ReturnType<typeof createTuiApp>, line: string): Promise<void> {
  const trimmed = line.trim();
  if (trimmed === "/approve") {
    await app.respondPermission("allow");
    return;
  }
  if (trimmed === "/deny" || trimmed.startsWith("/deny ")) {
    const reason = trimmed.slice("/deny".length).trim();
    await app.respondPermission("deny", reason || undefined);
    return;
  }
  await app.submitPrompt(line);
}
