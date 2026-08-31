import type { OrderRecord, PaymentRecord } from "./types";

export type CompareRow = { label: string; values: string[]; allSame: boolean };

const ORDER_FIELDS: [string, keyof OrderRecord][] = [
  ["Order id", "orderId"],
  ["Date", "orderDate"],
  ["Customer email", "customerEmail"],
  ["Currency", "currency"],
  ["Gross amount", "grossAmount"],
  ["Discount", "discount"],
  ["Net amount", "netAmount"],
  ["Status", "status"],
];

const PAYMENT_FIELDS: [string, keyof PaymentRecord][] = [
  ["Transaction ref", "transactionRef"],
  ["Processed at", "processedAt"],
  ["Order reference", "orderReference"],
  ["Currency", "currency"],
  ["Amount", "amount"],
  ["Fee", "fee"],
  ["Net settled", "netSettled"],
  ["Type", "type"],
  ["Status", "status"],
];

export function buildCompareRows(source: "orders" | "payments", rows: OrderRecord[] | PaymentRecord[]): CompareRow[] {
  const fields = source === "orders" ? ORDER_FIELDS : PAYMENT_FIELDS;
  return fields.map(([label, key]) => {
    const values = rows.map((r) => formatValue((r as Record<string, unknown>)[key as string]));
    return { label, values, allSame: values.every((v) => v === values[0]) };
  });
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}
