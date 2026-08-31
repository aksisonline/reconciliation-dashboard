import { migratorSql } from "./migrator";

const sqlDir = decodeURIComponent(new URL("../../sql", import.meta.url).pathname);

async function main() {
  const sql = migratorSql();
  await sql`create table if not exists _migrations (
    name text primary key,
    applied_at timestamp not null default now()
  )`;

  const glob = new Bun.Glob("*.sql");
  const files = (await Array.fromAsync(glob.scan({ cwd: sqlDir }))).sort();

  for (const file of files) {
    const already = await sql`select 1 from _migrations where name = ${file}`;
    if (already.length > 0) {
      console.log(`skip ${file} (already applied)`);
      continue;
    }

    let contents = await Bun.file(`${sqlDir}/${file}`).text();
    if (contents.includes("__APP_USER_PASSWORD__")) {
      const password = requireEnv("APP_DB_PASSWORD");
      contents = contents.replaceAll("__APP_USER_PASSWORD__", password);
    }

    console.log(`applying ${file}...`);
    await sql.unsafe(contents);
    await sql`insert into _migrations (name) values (${file})`;
  }

  console.log("migrations complete");
  await sql.close();
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
