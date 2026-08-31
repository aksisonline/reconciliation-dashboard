import Papa from "papaparse";

export type ParsedRow = {
  index: number; // 0-based row index in the file, for row_ref
  raw: Record<string, string>;
};

export function parseCsv(text: string): ParsedRow[] {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });
  return result.data.map((raw, index) => ({ index, raw }));
}

/** orders.csv dates are ISO-ish: "2025-04-13 00:00:00" */
export function parseOrderDate(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value.replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** payments.csv dates are "DD/MM/YYYY HH:MM" */
export function parsePaymentDate(value: string | undefined): Date | null {
  if (!value) return null;
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, day, month, year, hour, minute] = match;
  const d = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
  );
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseAmount(value: string | undefined): number | null {
  if (value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Normalized key used for order_id <-> order_reference matching. */
export function normalizeKey(value: string | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

export async function hashRow(raw: Record<string, string>): Promise<string> {
  const canonical = JSON.stringify(raw, Object.keys(raw).sort());
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(canonical);
  return hasher.digest("hex");
}
