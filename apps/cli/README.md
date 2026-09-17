# @nicebear/cli

Command line for NiceBear Dynamic Avatar Infrastructure. Published as `nicebear` on npm.

```bash
npm i -g @nicebear/cli
# or: pnpm dlx @nicebear/cli --help
```

## Auth

```bash
nicebear login --api-key nb_live_...        # verify + store (0600 file, never in git)
nicebear login --api-key nb_live_... --org org_123
NICEBEAR_API_KEY=nb_live_... nicebear whoami # one-shot, no stored state
nicebear logout
```

Precedence: flags > `NICEBEAR_API_KEY`/`NICEBEAR_BASE_URL` env > stored
credentials > `nicebear.config.json`. Non-TTY stdin never prompts — scripts
must pass `--api-key` or env.

## Everyday use

```bash
nicebear init --org org_123 --engine pixel-art   # project defaults

nicebear collection create --name team --engine robots
nicebear collection list
nicebear collection attach col_1 av_1

nicebear avatar create --engine geometric --collection col_1 --seed john
nicebear avatar upload --file ./me.png --repo myorg/avatars --collection col_1
nicebear avatar external --url https://my-own-domain.com/me.png --attest-rights --repo myorg/avatars
nicebear avatar url av_1 --variant daily
nicebear avatar fetch av_1 --variant weekly -o avatar.svg
nicebear avatar rollback av_1 --version 2

nicebear rule create --target avatar:av_1 --when weekday:mon --avatar av_2
nicebear rule create --target collection:col_1 --when every:3d --from-collection col_1
nicebear rule list --target collection:col_1
nicebear schedule create --rule rl_1 --cron "0 9 * * MON"

nicebear api-key create --scope read --limit 120
nicebear api-key rotate key_1 && nicebear api-key revoke key_1

nicebear webhook create --url https://.../hook --secret ... --events avatar.changed
nicebear webhook deliveries wh_1
nicebear analytics --metric top-avatars --days 7

nicebear team list
nicebear team add --email mate@org.dev --role developer
```

Append `--json` to any command for machine-readable output (errors go to
stdout as `{error, status}` with exit code 1).

## Deploy

```bash
nicebear deploy --project my-site          # dry-run: checks + prints commands
nicebear deploy --project my-site --execute
```

See `docs/deployment-cloudflare.md` for the full setup.
