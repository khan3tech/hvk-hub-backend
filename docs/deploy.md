# Deploying Hvk Hub

## Where things run
| Piece | Where | URL |
|---|---|---|
| API + Postgres + Caddy (HTTPS) | EC2 `i-068a3a1769ff4851a` (t3.small, ap-south-1), Elastic IP 15.207.176.213 | https://15-207-176-213.sslip.io |
| Frontend (Next.js SSR) | AWS Amplify app `d2fm66ggbkeg8k`, branch `main` | https://main.d2fm66ggbkeg8k.amplifyapp.com |

The frontend proxies `/api/*` to the API (`API_ORIGIN` in the Amplify console), so the
`refreshToken` cookie stays first-party and no CORS is needed. There's no SSH: the server is
reached only through SSM. Secrets live only in `/opt/teamloom/.env` on the instance.

All commands use the `hvk` SSO profile. Sign in first, and on Windows Git Bash disable path conversion:
```bash
aws sso login --profile hvk
export AWS_PROFILE=hvk AWS_REGION=ap-south-1 MSYS_NO_PATHCONV=1
```
On Windows, also set `TMPDIR` to a Windows-style path (e.g. `C:/Users/<you>/AppData/Local/Temp`)
so `git archive` and the AWS CLI agree on the bundle path, and `PYTHONUTF8=1` so the AWS CLI can
print the remote log.

## Redeploy the backend
```bash
bash deploy/deploy.sh          # ships git HEAD: build, migrate, restart, health check
```
Only pass `--seed` on a brand-new database.

## Redeploy the frontend
Push to `main` on `khan3tech/hvk-hub-frontend`; Amplify builds automatically.

## Seed users' password
It's generated on the server. Read it with:
```bash
aws ssm send-command --instance-ids i-068a3a1769ff4851a --document-name AWS-RunShellScript \
  --parameters '{"commands":["grep ^SEED_PASSWORD= /opt/teamloom/.env"]}' --query Command.CommandId --output text
aws ssm get-command-invocation --command-id <id> --instance-id i-068a3a1769ff4851a --query StandardOutputContent --output text
```
Change these passwords before real use.

## Backups and rollback
- `deploy/backup.sh` runs nightly at 20:30 UTC (systemd timer) and writes `pg_dump` files to `/opt/teamloom/backups`.
- To roll back code: `git checkout <good-sha>` and run `deploy/deploy.sh`. Migrations aren't reversed automatically.

## Later
- Add a real domain: set `SITE_ADDRESS=api.example.com` in `/opt/teamloom/.env`, point DNS at the Elastic IP, restart Caddy, and update `API_ORIGIN` in Amplify.
- Copy backups off the instance (to S3).
