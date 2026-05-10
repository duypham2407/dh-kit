import type { ModelCatalogReport } from "../../../../packages/shared/src/types/provider.js";
import { loadModelCatalog } from "../../../../packages/providers/src/config/provider-config-loader.js";

type ModelsDeps = {
  listModels: (repoRoot: string, input: { providerId?: string; refresh?: boolean; verbose?: boolean }) => Promise<ModelCatalogReport>;
};

const defaultDeps: ModelsDeps = { listModels: loadModelCatalog };

export async function runModelsCommand(args: string[], repoRoot: string, deps: ModelsDeps = defaultDeps): Promise<number> {
  try {
    const json = args.includes("--json");
    const providerId = args.find((arg) => !arg.startsWith("--"));
    const report = await deps.listModels(repoRoot, {
      providerId,
      refresh: args.includes("--refresh"),
      verbose: args.includes("--verbose"),
    });
    process.stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : `${renderModels(report)}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    return 1;
  }
}

function renderModels(report: ModelCatalogReport): string {
  if (report.models.length === 0) return "no models";
  return report.models
    .map((model) => {
      const details = [
        model.status ? `status=${model.status}` : undefined,
        model.releaseDate ? `release=${model.releaseDate}` : undefined,
      ].filter(Boolean);
      return `${model.providerId}/${model.modelId}  ${model.name}${details.length ? `  ${details.join(" ")}` : ""}`;
    })
    .join("\n");
}
