import type { OrderRecord, PaymentRecord } from "./types";

export type DiffRow = {
  label: string;
  order: string;
  payment: string;
  mismatch: boolean;
};

function money(currency: unknown, amount: unknown) {
  if (amount === null || amount === undefined || amount === "") return "—";
  const n = Number(amount);
  if (Number.isNaN(n)) return String(amount);
  return n.toLocaleString(undefined, { style: "currency", currency: typeof currency === "string" ? currency : "USD" });
}

function date(value: unknown) {
  if (!value) return "—";
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

/** Human-readable side-by-side comparison of the fields that actually matter for reconciliation. */
export function buildDiffRows(order: OrderRecord | null, payment: PaymentRecord | null): DiffRow[] {
  const orderCurrency = order?.currency as string | undefined;
  const paymentCurrency = payment?.currency as string | undefined;

  const rows: DiffRow[] = [
    {
      label: "Reference",
      order: order ? String(order.orderId) : "—",
      payment: payment ? String(payment.transactionRef) : "—",
      mismatch: false,
    },
    {
      label: "Amount",
      order: order ? money(orderCurrency, order.netAmount) : "—",
      payment: payment ? money(paymentCurrency, payment.amount) : "—",
      mismatch: !!order && !!payment && Math.abs(Number(order.netAmount) - Number(payment.amount)) > 0.01,
    },
    {
      label: "Currency",
      order: orderCurrency ?? "—",
      payment: paymentCurrency ?? "—",
      mismatch: !!orderCurrency && !!paymentCurrency && orderCurrency !== paymentCurrency,
    },
    {
      label: "Status",
      order: order ? String(order.status) : "—",
      payment: payment ? `${payment.type} · ${payment.status}` : "—",
      mismatch: statusLooksInconsistent(order, payment),
    },
    {
      label: "Date",
      order: order ? date(order.orderDate) : "—",
      payment: payment ? date(payment.processedAt) : "—",
      mismatch: false,
    },
  ];

  return rows;
}

function statusLooksInconsistent(order: OrderRecord | null, payment: PaymentRecord | null): boolean {
  if (!order || !payment) return false;
  const orderStatus = String(order.status);
  const paymentStatus = String(payment.status);
  if (orderStatus === "completed" && (paymentStatus === "failed" || paymentStatus === "pending")) return true;
  if ((orderStatus === "cancelled" || orderStatus === "refunded") && paymentStatus === "settled") return true;
  return false;
}
