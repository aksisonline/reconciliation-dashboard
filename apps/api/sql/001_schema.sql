-- Better Auth managed tables

create table if not exists "user" (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  email text not null unique,
  email_verified boolean not null default false,
  image text,
  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

create table if not exists "session" (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  token text not null unique,
  expires_at timestamp not null,
  ip_address text,
  user_agent text,
  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

create table if not exists "account" (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  account_id text not null,
  provider_id text not null,
  password text,
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at timestamp,
  refresh_token_expires_at timestamp,
  scope text,
  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

create table if not exists "verification" (
  id uuid primary key default gen_random_uuid(),
  identifier text not null,
  value text not null,
  expires_at timestamp not null,
  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

-- App tables

do $$ begin
  create type flag_source as enum ('orders', 'payments');
exception when duplicate_object then null; end $$;

do $$ begin
  create type flag_severity as enum ('info', 'warning');
exception when duplicate_object then null; end $$;

do $$ begin
  create type flag_resolution as enum ('open', 'acknowledged', 'excluded');
exception when duplicate_object then null; end $$;

do $$ begin
  create type reconciliation_status as enum ('matched', 'discrepancy');
exception when duplicate_object then null; end $$;

do $$ begin
  create type discrepancy_type as enum (
    'MISSING_PAYMENT', 'MISSING_ORDER', 'AMOUNT_MISMATCH', 'CURRENCY_MISMATCH',
    'STATUS_MISMATCH', 'DUPLICATE_PAYMENT', 'UNRESOLVED_REFUND'
  );
exception when duplicate_object then null; end $$;

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  order_id text not null,
  order_id_normalized text not null,
  order_date timestamp,
  customer_email text,
  currency text,
  gross_amount numeric(12, 2),
  discount numeric(12, 2),
  net_amount numeric(12, 2),
  status text,
  is_excluded boolean not null default false,
  raw_row jsonb not null,
  raw_row_hash text not null,
  created_at timestamp not null default now()
);
create index if not exists orders_user_idx on orders(user_id);
create index if not exists orders_norm_idx on orders(user_id, order_id_normalized);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  transaction_ref text not null,
  processed_at timestamp,
  order_reference text not null,
  order_reference_normalized text not null,
  currency text,
  amount numeric(12, 2),
  fee numeric(12, 2),
  net_settled numeric(12, 2),
  type text,
  status text,
  is_excluded boolean not null default false,
  raw_row jsonb not null,
  raw_row_hash text not null,
  created_at timestamp not null default now()
);
create index if not exists payments_user_idx on payments(user_id);
create index if not exists payments_norm_idx on payments(user_id, order_reference_normalized);

create table if not exists ingestion_flags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  source flag_source not null,
  flag_type text not null,
  severity flag_severity not null default 'info',
  row_ref text,
  details jsonb not null default '{}',
  resolution_status flag_resolution not null default 'open',
  created_at timestamp not null default now()
);
create index if not exists ingestion_flags_user_idx on ingestion_flags(user_id);

create table if not exists reconciliations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  order_row_id uuid references orders(id) on delete cascade,
  payment_row_id uuid references payments(id) on delete cascade,
  status reconciliation_status not null,
  discrepancy_type discrepancy_type,
  amount_at_risk numeric(12, 2) not null default 0,
  computed_at timestamp not null default now()
);
create index if not exists reconciliations_user_idx on reconciliations(user_id);
create index if not exists reconciliations_type_idx on reconciliations(user_id, discrepancy_type);

create table if not exists discrepancy_explanations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  reconciliation_id uuid not null references reconciliations(id) on delete cascade,
  explanation_text text not null,
  structured jsonb not null,
  model text not null,
  created_at timestamp not null default now()
);
create index if not exists discrepancy_explanations_user_idx on discrepancy_explanations(user_id);
