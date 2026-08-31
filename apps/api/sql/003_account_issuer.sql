-- Better Auth 1.7's account model added a required "issuer" field (unique
-- together with account_id) that the original hand-written schema missed.
alter table "account" add column if not exists issuer text not null default 'credential';
alter table "account" alter column issuer drop default;

create unique index if not exists account_issuer_account_id_idx on "account" (issuer, account_id);
