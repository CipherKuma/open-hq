# guardrails

Red-team pass for the support inbox. `fixtures/injection-emails.json` holds 20 realistic customer emails that carry a
prompt injection (override, fake system tag, hidden HTML, prompt exfiltration, role-play, vendor and founder spoofing,
OCR text, base64, markdown-image exfiltration, Malay, fake transcript, spaced-out letters, legal pressure, phishing
link, tool-call spoof, form-submission payload, buried instruction, payment redirection, memory poisoning) plus 4
legitimate emails as controls (one says "please ignore my last email").

Each email goes through:

1. **Screen**: the Lightning classifier (`screen_prompt.txt`, thinking off), the same idea as the app's inbound screen.
2. **NeMo Guardrails** (`pip install nemoguardrails`): a `self check input` rail on Token Factory, with the Support
   agent model behind it. If the rail passes, the agent's reply is checked against a per-attack leak pattern.
3. **Baseline**: the same agent with no protection, to show which attacks it would have obeyed.

Outcomes per attack: `blocked_by_screen`, `blocked_by_nemo_only`, `leaked` (passed both and the agent obeyed),
`passed_but_agent_refused`. Controls count as `false_positive` if blocked. Posts a `guardrail_report` to `/api/ingest`
(summary plus compact per-attack outcomes); the full rows are in the stdout JSON. Model output varies between runs, so
numbers move by a few emails.

Start: `./run.sh`.
