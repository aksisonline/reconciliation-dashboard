import { describe, expect, test } from "bun:test";
import { parseOrderDate, parsePaymentDate, parseAmount, normalizeKey } from "../csv";

describe("date parsing", () => {
  test("parses orders.csv ISO-ish format", () => {
    const d = parseOrderDate("2025-04-13 00:00:00");
    expect(d?.getUTCFullYear()).toBe(2025);
    expect(d?.getUTCMonth()).toBe(3); // April, 0-indexed
  });

  test("parses payments.csv DD/MM/YYYY HH:MM format", () => {
    const d = parsePaymentDate("02/04/2025 18:39");
    expect(d?.getMonth()).toBe(3); // April, not February
    expect(d?.getDate()).toBe(2);
    expect(d?.getFullYear()).toBe(2025);
  });

  test("returns null for unparseable dates instead of throwing", () => {
    expect(parsePaymentDate("not a date")).toBeNull();
    expect(parseOrderDate("")).toBeNull();
  });
});

describe("normalizeKey", () => {
  test("uppercases and trims so case-mismatched order ids still match", () => {
    expect(normalizeKey("ord-1802")).toBe("ORD-1802");
    expect(normalizeKey(" ORD-1802 ")).toBe("ORD-1802");
  });
});

describe("parseAmount", () => {
  test("parses numeric strings", () => {
    expect(parseAmount("325.12")).toBe(325.12);
  });

  test("returns null for empty or non-numeric values", () => {
    expect(parseAmount("")).toBeNull();
    expect(parseAmount(undefined)).toBeNull();
    expect(parseAmount("abc")).toBeNull();
  });
});
