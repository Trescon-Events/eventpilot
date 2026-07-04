// Gemini orchestration layer (PRD §6.3, §7.4), ported as-is. The AI clarifies,
// classifies, and plans; deterministic processing stays in the Python worker.
import { getConfig } from "./env";
import { OPERATION_KINDS, type Operation } from "./operations";
import type { Json } from "../db/schema";

export type ModelTier = "fast" | "balanced" | "advanced";

export const MODELS: Record<ModelTier, string> = {
  fast: "gemini-2.5-flash-lite",
  balanced: "gemini-2.5-flash",
  advanced: "gemini-2.5-pro",
};

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

type GeminiSchema = {
  type: "OBJECT" | "ARRAY" | "STRING" | "NUMBER" | "INTEGER" | "BOOLEAN";
  properties?: Record<string, GeminiSchema>;
  items?: GeminiSchema;
  required?: string[];
  enum?: string[];
  description?: string;
};

export interface GeminiCall<T> {
  result: T;
  tokens: number;
}

async function generateJson<T>(
  tier: ModelTier,
  systemInstruction: string,
  userPrompt: string,
  responseSchema: GeminiSchema,
): Promise<GeminiCall<T>> {
  const apiKey = getConfig().GEMINI_API_KEY;
  if (!apiKey) throw new Error("SMARTEXCEL_GEMINI_API_KEY is not configured.");

  const res = await fetch(`${ENDPOINT}/${MODELS[tier]}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemInstruction }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
        responseSchema,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini request failed (${res.status}): ${body.slice(0, 500)}`);
  }

  const body = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: { totalTokenCount?: number };
  };
  const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned an empty response.");
  return { result: JSON.parse(text) as T, tokens: body.usageMetadata?.totalTokenCount ?? 0 };
}

export interface FileContext {
  fileName: string;
  sheets?: string[];
  headers?: string[];
  sampleRows?: string[][];
  userNotes: string[];
}

export interface ComplexityResult {
  complexity: "simple" | "complex";
  rationale: string;
}

export interface ClarifyingQuestion {
  question: string;
  options: string[];
  allowOther: boolean;
}

export type NextQuestionResult = { done: true } | { done: false; question: ClarifyingQuestion };

export interface StructuredUnderstanding {
  goal: string;
  operations: string[];
  assumptions: string[];
  outputExpectation: string;
  [key: string]: Json;
}

export interface AnsweredQuestion {
  question: string;
  answer: string;
}

const MAX_CLARIFYING_QUESTIONS = 5;

function describeContext(ctx: FileContext): string {
  const lines = [`File: ${ctx.fileName}`];
  if (ctx.sheets?.length) lines.push(`Sheets: ${ctx.sheets.join(", ")}`);
  if (ctx.headers?.length) lines.push(`Columns: ${ctx.headers.join(", ")}`);
  if (ctx.sampleRows?.length) {
    lines.push(`Sample rows:\n${ctx.sampleRows.slice(0, 5).map((r) => r.join(" | ")).join("\n")}`);
  }
  if (ctx.userNotes.length) lines.push(`User said:\n${ctx.userNotes.join("\n")}`);
  return lines.join("\n");
}

const ASSISTANT_ROLE =
  "You are SmartExcel, an assistant that helps non-technical business users run " +
  "spreadsheet and document-to-spreadsheet operations (cleaning, mapping, dedupe, " +
  "restructuring, extraction, formulas, export-ready output). Be precise and avoid " +
  "over-questioning when intent is already clear.";

export function classifyComplexity(ctx: FileContext): Promise<GeminiCall<ComplexityResult>> {
  return generateJson<ComplexityResult>(
    "fast",
    ASSISTANT_ROLE,
    `Decide whether this spreadsheet job is "simple" (intent is unambiguous, run directly) ` +
      `or "complex" (needs clarification before planning).\n\n${describeContext(ctx)}`,
    {
      type: "OBJECT",
      properties: {
        complexity: { type: "STRING", enum: ["simple", "complex"] },
        rationale: { type: "STRING" },
      },
      required: ["complexity", "rationale"],
    },
  );
}

export function nextQuestion(
  ctx: FileContext,
  answered: AnsweredQuestion[],
): Promise<GeminiCall<NextQuestionResult>> {
  if (answered.length >= MAX_CLARIFYING_QUESTIONS) {
    return Promise.resolve({ result: { done: true }, tokens: 0 });
  }
  const history = answered.length
    ? `Already answered:\n${answered.map((a) => `Q: ${a.question}\nA: ${a.answer}`).join("\n\n")}`
    : "No questions answered yet.";
  return generateJson<NextQuestionResult>(
    "fast",
    ASSISTANT_ROLE,
    `Ask the SINGLE most useful next clarifying question, or finish if you have enough to ` +
      `plan. Prefer 2-4 predefined options. Set done=true when no further clarification is ` +
      `needed.\n\n${describeContext(ctx)}\n\n${history}`,
    {
      type: "OBJECT",
      properties: {
        done: { type: "BOOLEAN" },
        question: {
          type: "OBJECT",
          properties: {
            question: { type: "STRING" },
            options: { type: "ARRAY", items: { type: "STRING" } },
            allowOther: { type: "BOOLEAN" },
          },
          required: ["question", "options", "allowOther"],
        },
      },
      required: ["done"],
    },
  );
}

export interface ExecutionPlanDraft {
  summary: string;
  steps: string[];
  expectedOutput: string;
  risks: string;
  operations: Operation[];
}

export function buildPlan(
  understanding: StructuredUnderstanding,
  columns: string[] = [],
  feedback: string[] = [],
  sampleRows: string[][] = [],
): Promise<GeminiCall<ExecutionPlanDraft>> {
  const notes = feedback.length ? `\n\nUser feedback to incorporate:\n${feedback.join("\n")}` : "";
  const cols = columns.length ? `\n\nActual columns in the file: ${columns.join(", ")}` : "";
  const sample = sampleRows.length
    ? `\n\nFirst few rows of the file (so you can spot data-quality issues without guessing):\n` +
      sampleRows.slice(0, 5).map((r) => r.slice(0, columns.length).join(" | ")).join("\n")
    : "";
  return generateJson<ExecutionPlanDraft>(
    "balanced",
    ASSISTANT_ROLE,
    `Produce a user-friendly execution plan for this understood job. "steps" are concrete, ` +
      `ordered, plain-language descriptions for a non-technical user. "operations" is the ` +
      `machine-executable version of those steps.\n\n` +
      `### How to choose operations\n` +
      `For **trivial structural changes** (rename a column, drop columns, sort by column, ` +
      `simple filter, fill missing with a single value), use the named ops: ` +
      `${OPERATION_KINDS.filter((k) => k !== "custom_transform").join(", ")}. ` +
      `These are deterministic and fast. Reference real column names exactly. Omit fields ` +
      `that don't apply.\n\n` +
      `For **anything else** — value-level reformatting (phones, dates, IDs), conditional ` +
      `logic, lookups, computations across columns, building new columns from existing ones, ` +
      `parsing/extracting from strings — emit **ONE \`custom_transform\` op** that does the ` +
      `entire job in a single self-contained Python snippet. Do NOT chain regex_replace ops ` +
      `after a custom_transform: build the result inside the custom_transform itself. The ` +
      `chain-of-tiny-ops approach is fragile (one wrong column name and the whole pipeline ` +
      `silently breaks).\n\n` +
      `### custom_transform — what you can write\n` +
      `Fields: \`description\` (one short sentence the user will read) and \`expression\` ` +
      `(Python that mutates \`df\` in place). The expression runs in a sandboxed exec with:\n` +
      `  - \`df\` (the pandas DataFrame), \`pd\` (pandas), \`re\` (Python regex)\n` +
      `  - Builtins: len, range, min, max, sum, abs, round, divmod, pow, str, int, float, ` +
      `bool, list, tuple, dict, set, frozenset, bytes, bytearray, enumerate, zip, map, ` +
      `filter, sorted, reversed, any, all, next, iter, isinstance, type, repr, format, ` +
      `chr, ord, hex, oct, bin, print\n` +
      `  - Language features: assignment, augmented assignment, f-strings, list/dict/set ` +
      `comprehensions, generator expressions, lambdas, local functions (\`def\`), if/else, ` +
      `for/while loops, try/except, raise. Walrus (\`:=\`) is allowed.\n` +
      `  - Forbidden: import, exec, eval, compile, open, getattr/setattr/hasattr (use dot ` +
      `access), underscore-prefixed attributes (\`__class__\`, \`_x\`), global/nonlocal, ` +
      `yield/await, with, class, match.\n` +
      `Prefer vectorized pandas (\`.str.replace\`, \`.apply\`, arithmetic between columns) ` +
      `over per-row loops when both work.\n\n` +
      `### One critical Python formatting rule\n` +
      `When you write a multi-line \`def\` function, **every statement in the body must be on ` +
      `its own line**, with real newlines and consistent indentation. Do NOT squash the body ` +
      `onto a single line with spaces. The validator rejects squashed function bodies.\n` +
      `When a per-cell transform fits in a single expression, **prefer a lambda over a def** ` +
      `— lambdas can never be accidentally squashed. Example:\n` +
      `  GOOD: df['x'] = df['y'].astype(str).apply(lambda s: s.encode('latin1', errors='ignore').decode('utf-8', errors='ignore') if 'Ø' in s else s)\n` +
      `  RISKY: def fix(s): ...; df['x'] = df['y'].apply(fix)   # if the body collapses to one line it will fail to parse\n\n` +
      `### Worked example — international phone formatting to E.164\n` +
      `Input rows look like \`'+971 4 259 9442\` (with leading apostrophe as Excel ` +
      `text-prefix), country in a separate column.\n\n` +
      `description: "Build a 'Formatted Phone Number' column in E.164 format using the ` +
      `country column to pick the dialing prefix."\n` +
      `expression: |\n` +
      `  PREFIX = {'US': '1', 'UNITED STATES': '1', 'AE': '971', 'UNITED ARAB EMIRATES': '971', ` +
      `'GB': '44', 'UNITED KINGDOM': '44', 'IN': '91', 'INDIA': '91', 'CA': '1', ` +
      `'CANADA': '1', 'AU': '61', 'AUSTRALIA': '61', 'DE': '49', 'GERMANY': '49', ` +
      `'FR': '33', 'FRANCE': '33', 'SG': '65', 'SINGAPORE': '65'}\n` +
      `  def fmt(phone, country):\n` +
      `      if not isinstance(phone, str) or phone.strip().lower() in ('', 'nan'):\n` +
      `          return ''\n` +
      `      digits = re.sub(r'[^0-9]', '', phone)\n` +
      `      if not digits:\n` +
      `          return ''\n` +
      `      key = (country or '').strip().upper()\n` +
      `      prefix = PREFIX.get(key) or next((p for k, p in PREFIX.items() if k in key), '')\n` +
      `      if prefix and digits.startswith(prefix):\n` +
      `          return f'+{digits}'\n` +
      `      if prefix:\n` +
      `          return f'+{prefix}{digits}'\n` +
      `      return f'+{digits}'\n` +
      `  df['Formatted Phone Number'] = df.apply(lambda r: fmt(r.get('Phone Number'), ` +
      `r.get('Contact Country') or r.get('Country')), axis=1)\n\n` +
      `That single op does the whole job: handles missing values, strips formatting, looks ` +
      `up the country prefix, prepends '+', and writes the new column. ` +
      `**Emit it as ONE custom_transform — not as a custom + a chain of regex_replace ops.**\n\n` +
      `### More examples\n` +
      `  description: "Combine first and last name into 'full_name'"\n` +
      `  expression: "df['full_name'] = df['first_name'].fillna('') + ' ' + df['last_name'].fillna('')"\n\n` +
      `  description: "Tag rows over $10,000 as 'high_value'"\n` +
      `  expression: "df['tier'] = df['amount'].astype(float).apply(lambda v: 'high_value' if v > 10000 else 'standard')"\n\n` +
      `${JSON.stringify(understanding)}${cols}${sample}${notes}`,
    {
      type: "OBJECT",
      properties: {
        summary: { type: "STRING" },
        steps: { type: "ARRAY", items: { type: "STRING" } },
        expectedOutput: { type: "STRING" },
        risks: { type: "STRING" },
        operations: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              op: { type: "STRING", enum: OPERATION_KINDS },
              columns: { type: "ARRAY", items: { type: "STRING" } },
              from: { type: "STRING" },
              to: { type: "STRING" },
              column: { type: "STRING" },
              value: { type: "STRING" },
              order: { type: "STRING", enum: ["asc", "desc"] },
              style: { type: "STRING", enum: ["snake", "title"] },
              pattern: { type: "STRING" },
              replacement: { type: "STRING" },
              description: { type: "STRING" },
              expression: { type: "STRING" },
            },
            required: ["op"],
          },
        },
      },
      required: ["summary", "steps", "expectedOutput", "risks", "operations"],
    },
  );
}

export type ChatTurnResult =
  | { mode: "refine"; understanding: StructuredUnderstanding; reply: string }
  | { mode: "reply"; reply: string };

interface ChatTurnPayload {
  mode: "refine" | "reply";
  reply: string;
  understanding?: StructuredUnderstanding;
}

export async function chatTurn(
  ctx: FileContext,
  current: StructuredUnderstanding | null,
  recentDialog: Array<{ role: "user" | "assistant" | "system"; content: string }>,
): Promise<GeminiCall<ChatTurnResult>> {
  const tail = recentDialog.slice(-12);
  const dialog = tail
    .map((m) => `${m.role === "user" ? "USER" : m.role === "assistant" ? "ASSISTANT" : "SYSTEM"}: ${m.content}`)
    .join("\n\n");
  const understandingBlock = current
    ? `\n\nCurrent understanding:\n${JSON.stringify(current, null, 2)}`
    : "\n\n(No structured understanding yet.)";

  const { result, tokens } = await generateJson<ChatTurnPayload>(
    "fast",
    ASSISTANT_ROLE,
    `Decide how to respond to the user's latest message in this spreadsheet job.\n\n` +
      `Two response modes:\n` +
      `  • mode="refine" — the user is changing WHAT we should do (new requirement, ` +
      `correction to the plan, different output format, additional column, etc.). ` +
      `Output an UPDATED structured understanding plus a short reply confirming the ` +
      `change in plain language. Keep the reply 1-3 sentences — describe what changed, ` +
      `don't dump the full understanding back to the user.\n` +
      `  • mode="reply" — the user is asking a QUESTION, requesting suggestions/analysis, ` +
      `or making conversation ("what else needs fixing?", "explain column X", "is this ` +
      `safe?", "thanks"). Do NOT update the understanding. Just answer naturally based on ` +
      `the file context + dialog.\n\n` +
      `For analysis/suggestion questions ("what else needs fixing?"), look at the column ` +
      `names + sample rows and call out concrete data-quality issues you can see: mixed ` +
      `capitalization, leading apostrophes (Excel text-prefix), inconsistent formatting, ` +
      `obvious duplicates, missing values in key columns, untrimmed whitespace, mixed ` +
      `URL schemes (http vs https), etc. Use a short bullet list. End by offering to add ` +
      `the fixes to the plan if the user wants — that's a "refine" the user can request ` +
      `next.\n\n` +
      `Stay grounded. If you don't know, say so. Never invent data that isn't in the ` +
      `sample rows.\n\n` +
      `You do NOT execute jobs — you only update the plan. The user runs the sample ` +
      `themselves by clicking Run sample in the preview pane. So:\n` +
      `  • Never claim "the sample is ready" or "I've fixed it" or "I've re-run it". ` +
      `Nothing has run since the last "Sample ready..." system message in the dialog.\n` +
      `  • If the user asks "is it ready?" / "can I run it now?", tell them to click ` +
      `Run sample to try the latest plan.\n` +
      `  • If the most recent "Sample ready..." line contains "Skipped" or "Disallowed" ` +
      `or "Syntax error" or "invalid pattern", the previous attempt FAILED — say so ` +
      `directly, explain in plain language what went wrong, and (in refine mode) update ` +
      `the understanding so the next plan generation can fix it.\n\n` +
      `${describeContext(ctx)}${understandingBlock}\n\nRecent dialog:\n${dialog}`,
    {
      type: "OBJECT",
      properties: {
        mode: { type: "STRING", enum: ["refine", "reply"] },
        reply: { type: "STRING" },
        understanding: {
          type: "OBJECT",
          properties: {
            goal: { type: "STRING" },
            operations: { type: "ARRAY", items: { type: "STRING" } },
            assumptions: { type: "ARRAY", items: { type: "STRING" } },
            outputExpectation: { type: "STRING" },
          },
        },
      },
      required: ["mode", "reply"],
    },
  );

  if (result.mode === "refine") {
    if (!result.understanding) {
      return { result: { mode: "reply", reply: result.reply }, tokens };
    }
    return { result: { mode: "refine", understanding: result.understanding, reply: result.reply }, tokens };
  }
  return { result: { mode: "reply", reply: result.reply }, tokens };
}

export function buildStructuredUnderstanding(
  ctx: FileContext,
  answered: AnsweredQuestion[],
): Promise<GeminiCall<StructuredUnderstanding>> {
  const history = answered.length
    ? answered.map((a) => `Q: ${a.question}\nA: ${a.answer}`).join("\n\n")
    : "No clarifications were needed.";
  return generateJson<StructuredUnderstanding>(
    "fast",
    ASSISTANT_ROLE,
    `Produce a structured understanding of the job from the context and answers. ` +
      `This is the durable interpretation of intent, not chat.\n\n` +
      `While you're at it, scan the sample rows for common data-quality issues that the ` +
      `user almost certainly wants fixed even if they didn't explicitly mention them. Add ` +
      `these to "assumptions" as concrete items (e.g. "Will decode UTF-8 mojibake in ` +
      `'Company Address' (Ø´Ø§Ø±Ø¹ → شارع)"). Look specifically for:\n` +
      `  • Mojibake / wrong encoding: Ø×Ù sequences, Ã©, Ã¨, â€™, etc.\n` +
      `  • Leading apostrophes from Excel text-prefix in phone/ID columns: '+971...\n` +
      `  • Untrimmed whitespace, mixed capitalization in name/title columns\n` +
      `  • Inconsistent URL schemes (http vs https), trailing slashes\n` +
      `  • Mixed date/phone/currency formats\n` +
      `Only flag what you can actually see in the sample rows — don't speculate.\n\n` +
      `${describeContext(ctx)}\n\n${history}`,
    {
      type: "OBJECT",
      properties: {
        goal: { type: "STRING" },
        operations: { type: "ARRAY", items: { type: "STRING" } },
        assumptions: { type: "ARRAY", items: { type: "STRING" } },
        outputExpectation: { type: "STRING" },
      },
      required: ["goal", "operations", "assumptions", "outputExpectation"],
    },
  );
}
