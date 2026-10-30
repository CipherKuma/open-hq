# hermes-review

Weekly deep review with Hermes Agent (Nous Research), running the official `nousresearch/hermes-agent:stable` image
on a CPU job.

1. Loads the week: `GET /api/activity?limit=200` plus each agent's DM messages from the live app. If the live app has
   fewer than 15 activity entries, it uses `fixtures/activity-week.json` (a sample week with founder corrections).
2. Creates five real Hermes profiles (`openhq-cos`, `-revenue`, `-support`, `-ship`, `-scout`), each with its own
   `SOUL.md` and a custom-provider config pointing at Token Factory (Chief of Staff: Nemotron 3 Ultra; the rest:
   Nemotron 3.5 Super VL, falling back to Ultra if it is not listed).
3. Each profile runs `hermes -p <profile> -z <prompt>` once, re-reads only its own slice of the week, and returns up to
   4 memories and 3 standing orders with the evidence for each. If Hermes fails for an agent, that agent falls back to a
   direct Token Factory call (logged as `engine=direct-fallback`; set `HERMES_STRICT=1` to forbid the fallback).
4. Posts `memories` and `standing_orders` bodies per agent to `/api/ingest`; the app turns each into a pending
   proposal the founder approves. Fallback: JSON on stdout.

Start: `./run.sh`. Logs show one line per agent with the engine used and the item count.
