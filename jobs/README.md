# Open HQ: Nebius Serverless Jobs

Three on-demand jobs. No schedules, no endpoints, nothing always-on. Every job is started from the CLI with the
`hackathon-jobs-sa` profile and deleted when it finishes (`KEEP=1` keeps it for inspection).

| Job | What | Where it runs |
|---|---|---|
| `hermes-review/` | Weekly deep review: five Hermes Agent profiles re-read their week, propose memories and standing orders | CPU, official `nousresearch/hermes-agent` image |
| `guardrails/` | Red-team the support inbox with 20 prompt-injection emails through the Lightning screen and NeMo Guardrails | CPU, `python:3.12` |
| `safety-audit/` | Nemotron Content Safety Reasoning 4B over the agents' outbound drafts | one GPU (B300, the only GPU platform this project exposes) |

```
./hermes-review/run.sh     # about 6 min
./guardrails/run.sh        # about 7 min
./safety-audit/run.sh      # about 15 min, GPU
```

How they work, shared by all three:

- `lib/submit.sh` creates the job with `nebius ai job create`, injects the script and fixtures with `--inject-file`
  (read-only, 64 KiB each), polls the state, prints the job logs, then deletes the job. Public images are used as-is;
  the script is injected, so no custom image or registry is needed.
- Secrets: `NEBIUS_API_KEY` comes from the vault (`inject.sh`), `INGEST_SECRET` from `~/.config/openhq/ingest_secret`.
  Neither is printed or written to a tracked file. MysteryBox `--env-secret` is denied for this service account
  (the job runtime cannot read the payload), so both travel as `--env` values and live only in the job spec until the
  launcher deletes the job.
- Results: each job POSTs to `https://openhq.pages.dev/api/ingest` (`Authorization: Bearer $INGEST_SECRET`) using the
  body shapes in `apps/api/src/routes/hooks.ts` (`memories` / `standing_orders` per agent, `guardrail_report`,
  `safety_audit`). If the secret is missing or ingest is unreachable, the full result is printed to stdout as a line
  starting `OPENHQ_RESULT_JSON` and the job still exits 0.
- Inputs come from the live app (`GET /api/activity`, `/api/channels/dm:<agent>/messages`) when it has enough data,
  otherwise from `fixtures/` (labelled sample data). `fixtures/build_*.py` regenerate the fixtures.
- Models: Token Factory only (`https://api.tokenfactory.nebius.com/v1`). Exact IDs are resolved against `GET /v1/models`
  at run time; if a preferred model is not listed the job logs it and falls back to Nemotron 3 Ultra.
  Lightning needs `chat_template_kwargs: {"enable_thinking": false}` to answer without reasoning.
- Run `nebius --profile hackathon-jobs-sa ai job list` to see what is running. Name prefix is always `openhq-`.
