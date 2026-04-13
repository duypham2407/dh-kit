export type ParsedKnowledgeCommandArgs = {
  wantsJson: boolean;
  queryInput: string;
  resumeSessionId?: string;
  error?: string;
};

export function parseKnowledgeCommandArgs(args: string[]): ParsedKnowledgeCommandArgs {
  const wantsJson = args.includes("--json");
  const resumeFlagIndex = args.findIndex((arg) => arg === "--resume-session");

  if (resumeFlagIndex >= 0) {
    const candidate = args[resumeFlagIndex + 1]?.trim();
    if (!candidate) {
      return {
        wantsJson,
        queryInput: "",
        error: "Missing value for --resume-session.",
      };
    }
    if (candidate.startsWith("--")) {
      return {
        wantsJson,
        queryInput: "",
        error: `Invalid --resume-session value '${candidate}'.`,
      };
    }

    const filteredArgs = args.filter((arg, index) => {
      if (arg === "--json" || arg === "--resume-session") {
        return false;
      }
      return index !== resumeFlagIndex + 1;
    });

    return {
      wantsJson,
      queryInput: filteredArgs.join(" ").trim(),
      resumeSessionId: candidate,
    };
  }

  const filteredArgs = args.filter((arg) => arg !== "--json");
  return {
    wantsJson,
    queryInput: filteredArgs.join(" ").trim(),
  };
}
