import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

export async function promptForSelection<T extends { displayName: string }>(args: {
  label: string;
  options: T[];
  nonInteractiveFallback: T;
}): Promise<T> {
  if (!process.stdin.isTTY) {
    return args.nonInteractiveFallback;
  }

  const rl = readline.createInterface({ input, output });
  try {
    output.write(`${args.label}\n`);
    args.options.forEach((option, index) => {
      output.write(`  ${index + 1}. ${option.displayName}\n`);
    });

    const answer = await rl.question(`Choose 1-${args.options.length}: `);
    const index = Number.parseInt(answer.trim(), 10);
    if (!Number.isInteger(index) || index < 1 || index > args.options.length) {
      throw new Error(`Invalid selection for ${args.label.toLowerCase()}.`);
    }

    return args.options[index - 1];
  } finally {
    rl.close();
  }
}
