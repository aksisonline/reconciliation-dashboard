-- Resolution workflow columns: what a human decided to do about a discrepancy, layered on top
-- of the deterministic reconciliation result (which is fully recomputed on every "Run
-- reconciliation" click, so this state has to live on the persistent orders/payments rows, not
-- on the reconciliations table). No RLS changes needed — existing row policies on these two
-- tables already cover new columns.

alter table orders add column if not exists resolution_status text not null default 'open';
alter table orders add column if not exists resolution_type text;
alter table orders add column if not exists resolution_note text;
alter table orders add column if not exists resolved_at timestamp;

alter table payments add column if not exists resolution_status text not null default 'open';
alter table payments add column if not exists resolution_type text;
alter table payments add column if not exists resolution_note text;
alter table payments add column if not exists resolved_at timestamp;
