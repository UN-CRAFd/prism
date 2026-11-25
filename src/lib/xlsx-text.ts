import { strFromU8, unzipSync } from "fflate";

// ─────────────────────────────────────────────────────────────────────────────
// Minimal .xlsx reader: turns worksheets into plain text (one line per row,
// cells separated by " | ", each prefixed with its column letter) so a model
// can read a partner's spreadsheet. Values are shown roughly as Excel displays
// them: percentages, thousands separators, fixed decimals and dates.
//
// Deliberately small and dependency-free (fflate is already used): partner
// files are untrusted input, and the common free spreadsheet package has known
// parsing vulnerabilities. Formulas are not evaluated — the cached value saved
// with the file is used, which is what Excel and Google Sheets show.
// ─────────────────────────────────────────────────────────────────────────────

export interface SheetRow {
  /** Row number as in Excel (1-based). */
  num: number;
  cells: { col: string; value: string }[];
}

export interface SheetText {
  name: string;
  hidden: boolean;
  /** One line per non-empty row: "Row 5: A: … | D: …". */
  text: string;
  rows: number;
  /** The same rows, structured (for showing the sheet as a table). */
  grid: SheetRow[];
}

const MAX_FILE_ENTRIES = 2000;
const MAX_XML_BYTES = 30 * 1024 * 1024;

function decode(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}

/** Text of all <t> runs inside an XML fragment (shared strings, inline strings). */
function runsText(xml: string): string {
  let out = "";
  for (const m of xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) out += decode(m[1]);
  // Rich-text phonetic runs (<rPh>) are not visible text.
  return out;
}

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? decode(m[1]) : null;
}

// Built-in number formats that matter for display.
const BUILTIN_FORMATS: Record<number, string> = {
  1: "0", 2: "0.00", 3: "#,##0", 4: "#,##0.00", 9: "0%", 10: "0.00%",
  14: "date", 15: "date", 16: "date", 17: "date", 22: "date",
};

function formatNumber(raw: string, code: string | undefined): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  // General: drop float noise ("2022.0" → "2022", "0.30000000000000004" → "0.3").
  if (!code || code === "General") return String(Number(n.toPrecision(15)));
  if (code === "date" || (/[dmy]/i.test(code.replace(/"[^"]*"/g, "")) && !/[#0]/.test(code))) {
    // Excel serial date (1900 system).
    const ms = Math.round((n - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? raw : d.toISOString().slice(0, 10);
  }
  const section = code.split(";")[0];
  const decimals = (section.match(/\.(0+)/)?.[1].length) ?? 0;
  const prefix = section.match(/^"([^"]*)"/)?.[1] ?? (section.startsWith("$") ? "$" : "");
  if (section.includes("%")) return `${(n * 100).toFixed(decimals)}%`;
  const grouped = section.includes(",");
  const body = grouped
    ? n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    : n.toFixed(decimals);
  return prefix + body;
}

function colIndex(ref: string): number {
  const letters = ref.match(/^[A-Z]+/)?.[0] ?? "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function colName(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

export function readXlsx(buf: Uint8Array): SheetText[] {
  let entries = 0;
  const files = unzipSync(buf, {
    filter: (f) => {
      entries++;
      if (entries > MAX_FILE_ENTRIES || f.originalSize > MAX_XML_BYTES) return false;
      return f.name.startsWith("xl/") && (f.name.endsWith(".xml") || f.name.endsWith(".rels"));
    },
  });
  const read = (name: string) => (files[name] ? strFromU8(files[name]) : "");

  const workbook = read("xl/workbook.xml");
  if (!workbook) throw new Error("Not an Excel workbook");

  // Shared strings.
  const shared: string[] = [];
  for (const m of read("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(runsText(m[1]));

  // Styles → number format per cell style index.
  const styles = read("xl/styles.xml");
  const custom: Record<number, string> = {};
  for (const m of styles.matchAll(/<numFmt\s[^>]*>/g)) {
    const id = Number(attr(m[0], "numFmtId"));
    const code = attr(m[0], "formatCode");
    if (code !== null) custom[id] = code;
  }
  const xfFormats: (string | undefined)[] = [];
  const cellXfs = styles.match(/<cellXfs[\s\S]*?<\/cellXfs>/)?.[0] ?? "";
  for (const m of cellXfs.matchAll(/<xf\s[^>]*?\/?>/g)) {
    const id = Number(attr(m[0], "numFmtId") ?? 0);
    xfFormats.push(custom[id] ?? BUILTIN_FORMATS[id]);
  }

  // Sheet name → file, via the workbook relationships.
  const rels: Record<string, string> = {};
  for (const m of read("xl/_rels/workbook.xml.rels").matchAll(/<Relationship\s[^>]*>/g)) {
    const id = attr(m[0], "Id");
    const target = attr(m[0], "Target");
    if (id && target) rels[id] = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
  }

  const sheets: SheetText[] = [];
  for (const m of workbook.matchAll(/<sheet\s[^>]*>/g)) {
    const name = attr(m[0], "name") ?? "Sheet";
    const hidden = (attr(m[0], "state") ?? "visible") !== "visible";
    const file = rels[attr(m[0], "r:id") ?? ""];
    const xml = file ? read(file) : "";
    const lines: string[] = [];
    const grid: SheetRow[] = [];
    for (const row of xml.matchAll(/<row\s([^>]*)>([\s\S]*?)<\/row>/g)) {
      const rowNum = attr(` ${row[1]}`, "r");
      const cells: string[] = [];
      const structured: SheetRow["cells"] = [];
      for (const c of row[2].matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const tag = ` ${c[1]}`;
        const inner = c[2] ?? "";
        const ref = attr(tag, "r") ?? "";
        const type = attr(tag, "t");
        const v = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        let value = "";
        if (type === "s" && v !== undefined) value = shared[Number(v)] ?? "";
        else if (type === "inlineStr") value = runsText(inner);
        else if (type === "str" || type === "e") value = v !== undefined ? decode(v) : "";
        else if (type === "b") value = v === "1" ? "TRUE" : "FALSE";
        else if (v !== undefined) value = formatNumber(v, xfFormats[Number(attr(tag, "s") ?? 0)]);
        value = value.replace(/\s+/g, " ").trim();
        if (!value) continue;
        const col = colName(colIndex(ref));
        cells.push(`${col}: ${value}`);
        structured.push({ col, value });
      }
      if (cells.length) {
        lines.push(`Row ${rowNum}: ${cells.join(" | ")}`);
        grid.push({ num: Number(rowNum), cells: structured });
      }
    }
    sheets.push({ name, hidden, text: lines.join("\n"), rows: lines.length, grid });
  }
  return sheets;
}
