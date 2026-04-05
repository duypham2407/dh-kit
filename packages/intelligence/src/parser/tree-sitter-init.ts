import { createRequire } from "node:module";
import path from "node:path";

/**
 * web-tree-sitter's default export IS the Parser class itself.
 * Dynamic import returns { default: ParserClass, ... }.
 * We cannot use the static type from `typeof import("web-tree-sitter")`
 * directly because TypeScript's type for that module differs from the
 * actual CJS/WASM runtime shape.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ParserClass = any;
type Parser = { parse(source: string): SyntaxTree; setLanguage(lang: Language): void };
type Language = { load(path: string): Promise<Language> };
type SyntaxTree = {
  rootNode: TreeSitterNode;
  delete(): void;
};

/**
 * Lazy-loaded tree-sitter Parser class. We use dynamic import to avoid loading
 * the WASM runtime unless tree-sitter parsing is actually requested.
 */
let ParserCtor: ParserClass | undefined;
let initPromise: Promise<void> | undefined;

const languageCache = new Map<string, Language>();
const parserCache = new Map<string, Parser>();

/**
 * Map of file extensions / language IDs to grammar WASM file names.
 */
const GRAMMAR_MAP: Record<string, string> = {
  typescript: "tree-sitter-typescript.wasm",
  tsx: "tree-sitter-tsx.wasm",
  javascript: "tree-sitter-javascript.wasm",
  jsx: "tree-sitter-javascript.wasm",
  python: "tree-sitter-python.wasm",
  rust: "tree-sitter-rust.wasm",
  go: "tree-sitter-go.wasm",
  java: "tree-sitter-java.wasm",
  ruby: "tree-sitter-ruby.wasm",
  css: "tree-sitter-css.wasm",
  html: "tree-sitter-html.wasm",
  json: "tree-sitter-json.wasm",
  yaml: "tree-sitter-yaml.wasm",
  bash: "tree-sitter-bash.wasm",
  c: "tree-sitter-c.wasm",
  cpp: "tree-sitter-cpp.wasm",
  csharp: "tree-sitter-c_sharp.wasm",
  swift: "tree-sitter-swift.wasm",
  kotlin: "tree-sitter-kotlin.wasm",
  lua: "tree-sitter-lua.wasm",
  php: "tree-sitter-php.wasm",
  scala: "tree-sitter-scala.wasm",
  toml: "tree-sitter-toml.wasm",
  zig: "tree-sitter-zig.wasm",
};

/**
 * Resolve the path to the tree-sitter-wasms WASM file for a given grammar name.
 */
function resolveGrammarPath(grammarFile: string): string {
  const require = createRequire(import.meta.url);
  const wasmsDir = path.dirname(require.resolve("tree-sitter-wasms/package.json"));
  return path.join(wasmsDir, "out", grammarFile);
}

/**
 * Initialize the tree-sitter WASM runtime. Must be called once before any parsing.
 * Subsequent calls are no-ops (returns cached constructor).
 *
 * web-tree-sitter's dynamic import returns { default: ParserClass }.
 * The class has a static `.init()` method and a static `.Language` property.
 */
export async function initTreeSitter(): Promise<ParserClass> {
  if (ParserCtor) return ParserCtor;

  if (!initPromise) {
    initPromise = (async () => {
      // Dynamic import: the default export IS the Parser class
      const mod = await import("web-tree-sitter");
      const Ctor: ParserClass = mod.default ?? mod;
      // Initialize the WASM runtime
      await Ctor.init();
      ParserCtor = Ctor;
    })();
  }

  await initPromise;
  return ParserCtor!;
}

/**
 * Check whether a language is supported by our grammar set.
 */
export function isSupportedLanguage(language: string): boolean {
  return language in GRAMMAR_MAP;
}

/**
 * Get the list of all supported language IDs.
 */
export function listSupportedLanguages(): string[] {
  return Object.keys(GRAMMAR_MAP);
}

/**
 * Load a tree-sitter Language for a given language ID. Results are cached.
 */
export async function loadLanguage(language: string): Promise<Language> {
  const cached = languageCache.get(language);
  if (cached) return cached;

  const grammarFile = GRAMMAR_MAP[language];
  if (!grammarFile) {
    throw new Error(
      `Unsupported language for tree-sitter: ${language}. Supported: ${Object.keys(GRAMMAR_MAP).join(", ")}`,
    );
  }

  const Ctor = await initTreeSitter();
  const grammarPath = resolveGrammarPath(grammarFile);
  const lang = await Ctor.Language.load(grammarPath);
  languageCache.set(language, lang);
  return lang;
}

/**
 * Get (or create) a parser configured for the given language. Parsers are cached.
 */
export async function getParser(language: string): Promise<Parser> {
  const cached = parserCache.get(language);
  if (cached) return cached;

  const Ctor = await initTreeSitter();
  const lang = await loadLanguage(language);
  const parser = new Ctor();
  parser.setLanguage(lang);
  parserCache.set(language, parser);
  return parser;
}

/**
 * Parse source code for a given language. Returns the syntax tree.
 */
export async function parseSource(language: string, source: string): Promise<SyntaxTree> {
  const parser = await getParser(language);
  const tree = parser.parse(source);
  if (!tree) {
    throw new Error(`Failed to parse source for language: ${language}`);
  }
  return tree;
}

// ── Internal type for node interface ─────────────────────────────────────────

export type TreeSitterNode = {
  type: string;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  namedChildCount: number;
  namedChild(index: number): TreeSitterNode | null;
  childForFieldName(name: string): TreeSitterNode | null;
  text: string;
};
