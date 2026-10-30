# safety-audit

Audits the agents' outbound drafts (emails, posts, GitHub issues, standing orders) with
`nvidia/Nemotron-Content-Safety-Reasoning-4B` (Hugging Face, ungated, NVIDIA Open Model License plus Gemma terms)
via transformers on one Nebius GPU, with the model's one-sentence reasoning switched on.

Two passes per draft:

1. Vanilla Nemotron Content Safety taxonomy (S1 to S22), judging the draft as the AI response.
2. Bring-your-own policy: Open HQ's outbound rules (no promised dates or compensation, no confirmed refunds, no
   secrets or customer PII, no legal/medical/financial advice, no false claims, no insulting customers).

A draft is flagged if either pass says harmful. Input is `fixtures/outbound-drafts.json` (30 sample drafts, 8 of them
deliberately bad, with a human label so the report can state agreement). Posts a `safety_audit` report to
`/api/ingest`; fallback is JSON on stdout.

GPU: this project only exposes `gpu-b300-sxm` (`1gpu-24vcpu-346gb`); H100/H200/L40S are rejected. The script stops
after `TIME_BUDGET_S` (default 900 s) and the launcher deletes the job, so spend stays small.

Start: `./run.sh`.
