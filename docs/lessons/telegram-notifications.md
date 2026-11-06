# Telegram Notifications

> Reference for the Telegram bot used to route GitHub Actions alerts into the project supergroup.

---

## Bot & Group

| Variable             | Value             | Description                      |
| -------------------- | ----------------- | -------------------------------- |
| `TELEGRAM_BOT_TOKEN` | `8768616950:AAG…` | Bot token (stored in `.secrets`) |
| `TELEGRAM_CHAT_ID`   | `-1003953034526`  | Supergroup chat ID               |

The Telegram URL format for a thread is:
`https://t.me/c/{chat_id_without_minus}/{thread_id}`
e.g. `https://t.me/c/3953034526/4` → Reviews & Feedback

---

## Forum Topics (Threads)

| Variable                      | Thread ID | Topic Name             | Purpose                                     |
| ----------------------------- | --------- | ---------------------- | ------------------------------------------- |
| `TELEGRAM_CRITICAL_THREAD_ID` | `2`       | Critical Notifications | Deployment failures, health alerts, crashes |
| `TELEGRAM_REVIEWS_THREAD_ID`  | `4`       | Reviews & Feedback     | Bug issue reports, user feedback events     |
| `TELEGRAM_THREAD_ID`          | `6`       | Server Notifications   | General CI/CD info, route warm-up failures  |

---

## Workflows → Thread Mapping

| Workflow file                      | Event                      | Thread used                   |
| ---------------------------------- | -------------------------- | ----------------------------- |
| `notify-bug-issue.yml`             | GitHub issue labeled `bug` | `TELEGRAM_REVIEWS_THREAD_ID`  |
| `notify-deploy.yml` (if present)   | Deployment success/failure | `TELEGRAM_CRITICAL_THREAD_ID` |
| Route warm-up / JIT failure alerts | Scheduled health checks    | `TELEGRAM_THREAD_ID`          |

---

## Adding a New Thread

1. Create the forum topic in the Telegram supergroup.
2. Open the topic — the URL will show `https://t.me/c/{group_id}/{thread_id}`.
3. Add `TELEGRAM_<NAME>_THREAD_ID=<id>` to `.secrets`.
4. Add the matching `TELEGRAM_<NAME>_THREAD_ID: ${{ secrets.TELEGRAM_<NAME>_THREAD_ID }}` to the `env:` block in `sync-secrets.yml` — that single list is the only place to add it; the workflow derives its output file from it automatically via a `compgen -e | grep '^S_'` loop.
5. Publish the secret to GitHub with `gh secret set TELEGRAM_<NAME>_THREAD_ID --repo vaoan/libra`, piping the value via stdin so it never lands in shell history or a process list — e.g. `echo -n "<id>" | gh secret set TELEGRAM_<NAME>_THREAD_ID --repo vaoan/libra`. **Do not run `pnpm sync-secrets` for this** — that command pulls the OTHER way: it triggers the sync-secrets workflow, downloads an encrypted artifact, and _overwrites_ the local `.secrets` file with what's already on GitHub. Running it here would clobber the value you just added in step 3, not publish it.
6. Reference the variable in the workflow that needs it.

---

## Related

- `.secrets` — Local source of truth for all secrets
- `.github/workflows/sync-secrets.yml` — Packages GitHub repository secrets into an encrypted artifact that `pnpm sync-secrets` downloads to refresh the local `.secrets` file
- `.github/workflows/notify-bug-issue.yml` — Bug issue → Reviews & Feedback
- [Git Safety](./git-safety.md) — Never commit real secret values
