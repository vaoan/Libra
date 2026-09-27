# Supabase Full Wipe & Re-Migration Procedure

> **Use this when the user asks for a "full wipe" of Supabase dev or prod.**

---

## Tokens and Projects

| Environment | Project ID             | PAT Variable                 | PAT Location |
| ----------- | ---------------------- | ---------------------------- | ------------ |
| Dev         | `dsczudkhoolxjaxjeqdf` | `DEV_SUPABASE_ACCESS_TOKEN`  | `.secrets`   |
| Prod        | `olafyajipvsltohagiah` | `PROD_SUPABASE_ACCESS_TOKEN` | `.secrets`   |

The PATs are Personal Access Tokens for the Supabase Management API. They are stored in `.secrets` under:

```
# ─── Supabase Management API (Personal Access Tokens) ───────────
DEV_SUPABASE_ACCESS_TOKEN=sbp_...
PROD_SUPABASE_ACCESS_TOKEN=sbp_...
```

> **Note:** Direct port 5432 (Postgres) connections are blocked on Supabase Cloud from outside AWS, but the **connection pooler** (port 6543) is reachable with `PROD_SUPABASE_DB_PASSWORD`. The Management API REST endpoint below is the default path; the pooler is the fallback when the PAT is stale.

---

## Step 1: Drop and Recreate the Public Schema

This wipes all tables, types, functions, policies, and triggers in the `public` schema.

```bash
TOKEN="<DEV_SUPABASE_ACCESS_TOKEN or PROD_SUPABASE_ACCESS_TOKEN>"
PROJECT="<dsczudkhoolxjaxjeqdf or olafyajipvsltohagiah>"

DROP_SQL="DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO postgres; GRANT ALL ON SCHEMA public TO public; GRANT ALL ON SCHEMA public TO anon; GRANT ALL ON SCHEMA public TO authenticated; GRANT ALL ON SCHEMA public TO service_role;"

payload=$(python3 -c "import json; print(json.dumps({'query': '$DROP_SQL'}))")

curl -s -X POST \
  "https://api.supabase.com/v1/projects/${PROJECT}/database/query" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$payload"
```

Expected response: `[]` with HTTP 201.

> **Note:** This does NOT delete auth users. The `auth` schema is managed by Supabase and not touched by this command. If you also need to delete auth users, use the Supabase REST API with the service role key to list and delete users via `DELETE /auth/v1/admin/users/{id}`.

---

## Step 2: Apply All Migrations

The repo now carries a single baseline migration, `supabase/migrations/20260902120000_baseline.sql` (the 27 earlier files were squashed into it). The loop below still works for any number of files; today it applies one:

```bash
TOKEN="<DEV_SUPABASE_ACCESS_TOKEN or PROD_SUPABASE_ACCESS_TOKEN>"
PROJECT="<dsczudkhoolxjaxjeqdf or olafyajipvsltohagiah>"

run_migration() {
  local file="$1"
  local payload
  payload=$(python3 -c "import json,sys; print(json.dumps({'query':open(sys.argv[1]).read()}))" "$file")

  local tmpfile
  tmpfile=$(mktemp)
  local http_code
  http_code=$(curl -s -o "$tmpfile" -w "%{http_code}" -X POST \
    "https://api.supabase.com/v1/projects/${PROJECT}/database/query" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$payload")

  local body
  body=$(cat "$tmpfile")
  rm -f "$tmpfile"

  if [ "$http_code" = "200" ] || [ "$http_code" = "201" ]; then
    echo "✅ [$http_code] $(basename $file)"
  else
    echo "❌ [$http_code] $(basename $file)"
    echo "   $body"
  fi
}

for f in supabase/migrations/*.sql; do
  run_migration "$f"
done
```

Every file in `supabase/migrations/` (currently the single baseline) should return ✅.

---

## Known Issues and Fixes

### `multiple primary keys for table "logged_actions"` (42P16)

The `audit` and `audit_archive` schemas are Libra's own (created by earlier
migrations, not by an extension). Dropping only `public` leaves them behind,
and the baseline's `ADD CONSTRAINT logged_actions_pkey` then collides with the
surviving table's primary key, so the whole baseline query fails. Drop them
with the public schema (verified on prod 2026-09-27: `audit.logged_actions`
had 0 rows and no extension dependency):

```sql
DROP SCHEMA IF EXISTS audit CASCADE;
DROP SCHEMA IF EXISTS audit_archive CASCADE;
```

The earlier "already exists (42P07)" note about `CREATE TABLE IF NOT EXISTS` is
superseded by this: the table statement is idempotent, the constraint is not.

### Table filter for data-only wipe

If you only need to wipe data (not schema), use these filters per table type:

- Tables with UUID primary keys: `?created_at=gte.2000-01-01`
- `payment_settings` table: `?updated_at=gte.2000-01-01` (no `created_at` column)

---

## Auth Users Wipe (if needed)

```bash
SERVICE_KEY="<DEV_SUPABASE_SERVICE_ROLE_KEY or PROD_SUPABASE_SERVICE_ROLE_KEY>"
SUPABASE_URL="<DEV_SUPABASE_URL or PROD_SUPABASE_URL>"

# List all users
users=$(curl -s "${SUPABASE_URL}/auth/v1/admin/users?per_page=1000" \
  -H "apikey: ${SERVICE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_KEY}")

# Delete each user
echo "$users" | python3 -c "
import json, sys, subprocess
data = json.load(sys.stdin)
users = data.get('users', [])
for u in users:
    uid = u['id']
    subprocess.run(['curl', '-s', '-X', 'DELETE',
        '${SUPABASE_URL}/auth/v1/admin/users/' + uid,
        '-H', 'apikey: ${SERVICE_KEY}',
        '-H', 'Authorization: Bearer ${SERVICE_KEY}'])
    print(f'Deleted: {uid}')
"
```

---

## Verify Schema After Migration

```bash
TOKEN="<token>"
PROJECT="<project_id>"

CHECK_SQL="SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
payload=$(python3 -c "import json,sys; print(json.dumps({'query': sys.argv[1]}))" "$CHECK_SQL")

curl -s -X POST \
  "https://api.supabase.com/v1/projects/${PROJECT}/database/query" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$payload"
```

Expected tables after migration: `check_in_audit`, `check_ins`, `events`, `order_items`, `orders`, `payment_settings`, `permissions`, `product_entitlements`, `product_reviews`, `product_templates`, `products`, `resource_permissions`, `seller_admins`, `seller_payment_methods`, `ticket_transfers`, `user_permissions`, `user_profiles`.

---

## Related

- `.secrets` — PATs and service role keys
- `supabase/migrations/` — the baseline migration (earlier files were squashed into it)
- [Git Safety](.claude/rules/git-safety.md) — Never commit secrets
