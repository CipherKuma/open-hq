# Open HQ on Hermes Agent, inside an NVIDIA OpenShell sandbox

The five Open HQ agents (cos, revenue, support, ship, scout) are five real Hermes Agent profiles served by one
Hermes gateway inside the OpenShell sandbox `openhq-agents` (created by NemoClaw, `nemohermes`), on the always-on M2
(`ssh m2worker`). Models are Nemotron on Nebius Token Factory. The Worker calls the gateway through
`apps/api/src/runtime/hermes.ts`.

```
Worker (hermesRuntime) --HTTPS, Bearer HERMES_KEY--> Funnel/tunnel --> 127.0.0.1:8643 (OpenShell forward)
   --> sandbox openhq-agents:18642  Hermes gateway (multiplexed)  /p/<agent>/v1/chat/completions
         |-- profile cos      Nemotron-3-Ultra-550b-a55b
         |-- profile revenue|support|ship|scout   Nemotron-3.5-Super-VL
         |-- MCP openhq     https://openhq.pages.dev/mcp   (Bearer MCP_TOKEN, x-openhq-agent: <agent>)
         '-- MCP composio   read-only, disabled until COMPOSIO_MCP_URL/KEY are filled
   egress (kernel + proxy enforced): api.tokenfactory.nebius.com (key injected), openhq.pages.dev/mcp,
   mcp.composio.dev, backend.composio.dev. Nothing else.
```

## Verified vs not (as of 2026-10-30, Kuala Lumpur)

Verified, with evidence from the box:
- Hermes v0.22.5 (Docker image) and v0.21.3 (inside the sandbox) with Nemotron-3.5-Super-VL on Token Factory complete real tool calls (terminal x2, memory x1; 2-8 s per call).
- Five profiles, each with its own SOUL.md, config.yaml, .env, memory and state DB; one multiplexed gateway serves all five (`served_profiles` lists them) and each profile authenticates with its own `API_SERVER_KEY`.
- NemoClaw onboarding against Token Factory (`NEMOCLAW_PROVIDER=custom`, non-interactive) succeeded: sandbox Ready, Hermes healthy, `inference.local` route healthy.
- The model key never exists inside the sandbox: `COMPATIBLE_API_KEY` there is an opaque `openshell:resolve:env:...` placeholder; the real key is swapped in at egress. Calls through the sandbox return 200.
- Egress policy: `example.com` and `api.github.com` are blocked from inside the sandbox; Token Factory is reachable; Hermes (python3.13) reached `openhq.pages.dev/mcp`, and the five Open HQ tools registered (`post_message, message_agent, propose_action, remember, recall`). The Chief of Staff listed them back when asked.
- `hermes.ts` posts to `/p/<agent>/v1/chat/completions` with an `Idempotency-Key`.
- Boot script works from launchd (`com.openhq.boot`), recovering the sandbox, forward and gateway.

Not verified / open:
- Public exposure: Tailscale Funnel is NOT enabled for the M2 node yet (needs one admin click, see Exposure). Until then an interim Cloudflare quick tunnel (random trycloudflare URL, changes if the tunnel process restarts) is the only public path.
- A real reboot. Boot ordering (colima, then OpenShell gateway 19270, then sandbox, then forward) was exercised by re-running the script, not by rebooting.
- Composio MCP (no key supplied); proposals/posts through the Open HQ MCP from Hermes (only tool discovery was tested, to avoid writing demo data).
- Token Factory catalog flicker: `nvidia/Nemotron-3.5-Super-VL` vanished from `GET /v1/models` for several minutes (calls returned 404 "model does not exist") and later came back. Keep the loop fallback.
- Latency: a tool-using run is 3-8 s on the box; the Worker's 25 s budget holds for single-tool runs. A Hermes turn re-sends about 6k (no tools) to 18k (memory tool) prompt tokens: budget for it.

## Memory (8 GB M2, colima 6 GiB)

| Item | Measured |
|---|---|
| Sandbox container `openhq-agents` (Hermes gateway + dashboard, 5 profiles) | about 520 MiB |
| Plain Docker fallback container `openhq-hermes` (5 profiles) | about 340 MiB |
| Colima VM available memory with everything running | about 4.9 GiB of 5.9 GiB |
| Disk | Hermes image 4.3 GB, NemoClaw sandbox image about 2 GB, colima disk 87 GB free |

NemoClaw wants an 8 GiB runtime; we run with `NEMOCLAW_IGNORE_RUNTIME_RESOURCES=1` and it was fine at this load.

## Layout in this repo

```
hermes/profiles/<agent>/{SOUL.md,config.yaml}   role, model, toolsets, MCP servers (no secrets; ${VAR} from the profile .env)
hermes/openshell/openhq-egress.yaml             NemoClaw custom preset: openhq MCP + Composio MCP hosts
hermes/box/nemo-onboard.sh                      isolated NemoClaw onboarding (own HOME, own gateway on 19270)
hermes/box/nemo-env.sh                          source to talk to that gateway without touching other products
hermes/box/push-sandbox.sh + sandbox-provision.sh   copy profiles + write .env into the sandbox
hermes/box/boot.sh + com.openhq.boot.plist      reboot recovery
hermes/box/com.openhq.quicktunnel.plist         interim public URL (remove once Funnel is on)
hermes/box/render-env.sh + push-profiles.sh     the same for the plain-Docker fallback
```

Secrets stay on the box in `~/openhq/.env` (NEBIUS_API_KEY) and `~/openhq/hermes.env` (HERMES_KEY, HERMES_DEFAULT_KEY,
OPENHQ_MCP_TOKEN, later COMPOSIO_MCP_URL/COMPOSIO_MCP_KEY), mode 600, never committed.

## Reproduce

1. Secrets: `~/.claude/vault/inject.sh get NEBIUS_API_KEY --dir <scratch>`, then
   `ssh m2worker 'umask 077; cat > ~/openhq/.env' < <scratch>/.env.local`. Create `~/openhq/hermes.env` the same way
   (`HERMES_KEY=$(openssl rand -hex 32)`, `HERMES_DEFAULT_KEY=...`, `OPENHQ_MCP_TOKEN=...`).
2. Copy `hermes/box/{nemo-onboard.sh,nemo-env.sh,boot.sh}` to `~/openhq/` on the box, `chmod 700 ~/openhq/nemo-home ~/openhq/nemo-home/.nemoclaw`.
3. Onboard: `ssh m2worker 'bash ~/openhq/nemo-onboard.sh'` (about 4 min). It sets `NEMOCLAW_GATEWAY_PORT=19270`,
   `NEMOCLAW_PROVIDER=custom`, `NEMOCLAW_ENDPOINT_URL=https://api.tokenfactory.nebius.com/v1`,
   `NEMOCLAW_MODEL=nvidia/Nemotron-3.5-Super-VL`, tier `restricted`, sandbox `openhq-agents`, and uses a private HOME so
   the box's other OpenShell gateway (19260) and its `active_gateway` file are never selected.
4. Profiles: `hermes profile create <agent> --no-alias` for the five agents inside the sandbox
   (`openshell sandbox exec --name openhq-agents -- hermes profile create cos --no-alias`), then from the repo root
   `./hermes/box/push-sandbox.sh`.
5. Multiplex: append `gateway:\n  multiplex_profiles: true` to `/sandbox/.hermes/config.yaml`, then
   `nemohermes openhq-agents gateway restart` (with `nemo-env.sh` sourced). One listener, five profiles.
6. Egress: `nemohermes openhq-agents policy add --from-file hermes/openshell/openhq-egress.yaml --yes` and
   `nemohermes openhq-agents policy remove pypi --yes` (the tier adds PyPI; not needed at runtime).
7. API forward: NemoClaw publishes the sandbox API on host `127.0.0.1:8643` (8642 was taken by the Docker fallback).
8. Reboot recovery: copy `com.openhq.boot.plist` to `~/Library/LaunchAgents/` and `launchctl bootstrap gui/$(id -u) <plist>`.
9. Test: `curl -H "Authorization: Bearer $HERMES_KEY" http://127.0.0.1:8643/p/cos/v1/models` (lists model `cos`).

## Exposure to the Worker

Decision: Tailscale Funnel (no Cloudflare zone or DNS record).
- `tailscale serve --bg --https=8443 http://127.0.0.1:8643` is configured (tailnet-only).
- Funnel needs the node attribute `funnel`. One admin click at `https://login.tailscale.com/f/funnel?node=<node id>`
  (the node id is in `tailscale status --json` under `Self.ID`; the coordinator has it), then on the box:
  `/Applications/Tailscale.app/Contents/MacOS/Tailscale funnel --bg --https=8443 http://127.0.0.1:8643`.
  Public base URL: `https://<box>.<tailnet>.ts.net:8443` (this is `HERMES_URL`, no trailing slash).
- The GUI-variant CLI refuses to start a funnel while it is not allowed on the tailnet ("The Tailscale GUI failed to start"); that message is the symptom.
- Interim: `com.openhq.quicktunnel` runs `cloudflared tunnel --url http://127.0.0.1:8643` (no account, zone or DNS record). The URL is in `~/openhq/quicktunnel.log` on the box. Remove with `launchctl bootout gui/$(id -u)/com.openhq.quicktunnel` once Funnel is on.
- Every request needs `Authorization: Bearer <HERMES_KEY>`; the gateway answers 401 otherwise (`/health` is open and returns status only).

## Fallback: plain Docker (no OpenShell)

`docker run -d --name openhq-hermes --memory 3g -v openhq-hermes-data:/opt/data -p 127.0.0.1:8642:8642 nousresearch/hermes-agent gateway run`
then `hermes profile create` x5, `hermes/box/push-profiles.sh`, `hermes/box/render-env.sh`. Same `/p/<agent>/` routing. The container exists, is stopped and has `restart=no` so it never competes with the sandbox for RAM or the API port; `docker start openhq-hermes` to use it.

## Operating notes

- Never point two gateways at one profile. The sandbox owns the five profiles; the Docker volume has its own copies.
- Rotate the Worker-facing key: edit `HERMES_KEY` in `~/openhq/hermes.env`, rerun `push-sandbox.sh`, restart the gateway, update the Worker secret.
- Super 120b retires 9 Nov: do not use it as a fallback model.
- Logs: `nemohermes openhq-agents logs --follow`; per-profile `/sandbox/.hermes/profiles/<agent>/logs/agent.log`.
