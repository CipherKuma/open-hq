"""Open HQ weekly deep review. Runs inside nousresearch/hermes-agent. Five real Hermes profiles
(cos, revenue, support, ship, scout) each re-read their own week via Nebius Token Factory (Nemotron)
and propose memories and standing orders. Results go to /api/ingest, or stdout if unreachable."""
import json, os, re, subprocess, sys
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "lib"))
import openhq  # noqa: E402

FIX = os.environ.get("FIXTURES_DIR", os.path.join(HERE, "fixtures"))
ULTRA = openhq.resolve_model(os.environ.get("COS_MODEL", "nvidia/Nemotron-3-Ultra-550b-a55b"))
SUPER = openhq.resolve_model(os.environ.get("AGENT_MODEL", "nvidia/Nemotron-3.5-Super-VL"))
AGENTS = {
    "cos": ("Chief of Staff", "Runs the founder's evening: handover, ranking, tonight's list, weekly plan.", ULTRA),
    "revenue": ("Revenue", "Watches money: customers, failed payments, cancellations, MRR.", SUPER),
    "support": ("Support", "Reads every customer message, sorts it, drafts replies.", SUPER),
    "ship": ("Ship", "Watches code and production: deploys, errors, PRs.", SUPER),
    "scout": ("Scout", "Watches growth and the market: traffic, mentions, competitors.", SUPER),
}
HERMES_ROOT = os.environ.get("HERMES_HOME", "/opt/data")
WORK = os.environ.get("REVIEW_WORK", "/tmp/openhq-review")
PER_AGENT_TIMEOUT = int(os.environ.get("AGENT_TIMEOUT", "420"))

PROMPT = """It is the end of the week. Re-read your own week below (your activity log and the messages you were part of).
The founder's messages are the strongest evidence: they correct you and state preferences.

Propose what you should remember and what you should always do from now on.
- "memory": a durable fact or preference worth keeping (who/what/why), max 4.
- "standing_order": a rule you will follow on every future shift, phrased as an instruction to yourself, max 3.
Only propose things the evidence supports. Do not repeat what is already in your role. Each item needs a "why" that
cites the evidence (date and what happened) in under 110 characters. Keep "text" under 200 characters.

Reply with ONLY a JSON object, no prose, no code fence:
{{"items":[{{"kind":"memory"|"standing_order","text":"...","why":"..."}}]}}

=== ACTIVITY ({n_act}) ===
{activity}

=== MESSAGES ({n_msg}) ===
{messages}
"""


def load_week():
    fixture = os.path.join(FIX, "activity-week.json")
    data, src = openhq.fetch_json("/api/activity?limit=200", fixture)
    if isinstance(data, list) and len(data) < int(os.environ.get("MIN_LIVE_ACTIVITY", "15")):
        openhq.log(f"live activity has only {len(data)} entries (too thin for a weekly review); using the sample-week fixture")
        data, src = json.load(open(fixture)), "fixture:activity-week.json"
    if isinstance(data, list):  # live API: activity list only; channel messages fetched per agent below
        act, msgs = data, []
        for a in AGENTS:
            try:
                msgs += openhq.http_json(f"{openhq.BASE}/api/channels/dm:{a}/messages", timeout=10)
            except Exception:
                pass
    else:
        act, msgs = data.get("activity", []), data.get("messages", [])
    return act, msgs, src


def slice_for(agent, act, msgs):
    act = [x for x in act if x.get("kind") != "job"]  # skip earlier job reports so the review does not quote itself
    a = [x for x in act if x.get("agent") == agent or (agent == "cos" and x.get("kind") in ("message", "proposal"))]
    m = [x for x in msgs if x.get("author") == agent or x.get("channelId") == f"dm:{agent}" or f"@{agent}" in x.get("text", "")]
    return a, m


def setup_profile(agent, model):
    """Create a real Hermes profile and write its SOUL.md + config (custom endpoint = Token Factory)."""
    name, job, _ = AGENTS[agent]
    pname = f"openhq-{agent}"
    subprocess.run(["hermes", "profile", "create", pname], capture_output=True, text=True, timeout=120)
    home = os.path.join(HERMES_ROOT, "profiles", pname)
    os.makedirs(home, exist_ok=True)
    with open(os.path.join(home, "SOUL.md"), "w") as f:
        f.write(f"# {name}\nYou are {name}, one of five AI agents running a solo founder's products (Tidyform, Quillbill).\n"
                f"Your job: {job}\nVoice: plain, short, specific. You never act without the founder's approval.\n")
    fd = os.open(os.path.join(home, ".env"), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)  # key stays inside the ephemeral container
    with os.fdopen(fd, "w") as f:
        f.write(f"NEBIUS_API_KEY={os.environ.get('NEBIUS_API_KEY', '')}\n")
    with open(os.path.join(home, "config.yaml"), "w") as f:
        f.write(f"model:\n  default: {model}\n  provider: custom\n  base_url: {openhq.TF_URL}\n"
                f"  key_env: NEBIUS_API_KEY\n  context_length: 131072\n")
    return pname, home


def extract_items(text):
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return []
    try:
        raw = json.loads(m.group(0)).get("items", [])
    except ValueError:
        return []
    out, seen = [], set()
    for it in raw[:8]:
        k, t, w = it.get("kind"), str(it.get("text", "")).strip(), str(it.get("why", "")).strip()
        if k in ("memory", "standing_order") and t and w and t.lower() not in seen:
            seen.add(t.lower())
            out.append({"kind": k, "text": t[:300], "why": w[:400]})
    return out


def review(agent, act, msgs):
    _, _, model = AGENTS[agent]
    a, m = slice_for(agent, act, msgs)
    prompt = PROMPT.format(
        n_act=len(a), n_msg=len(m),
        activity="\n".join(f"- {x['at'][:16]} [{x['kind']}] {x['summary']}" for x in a) or "(none)",
        messages="\n".join(f"- {x['createdAt'][:16]} {x['channelId']} {x['author']}: {x['text']}" for x in m) or "(none)")
    engine, text = "hermes", ""
    try:
        pname, _ = setup_profile(agent, model)
        r = subprocess.run(["hermes", "-p", pname, "-z", prompt, "-m", model, "--provider", "custom"],
                           capture_output=True, text=True, timeout=PER_AGENT_TIMEOUT,
                           env={**os.environ, "NO_COLOR": "1"})
        text = r.stdout
        if r.returncode != 0:
            openhq.log(f"[{agent}] hermes exit {r.returncode}: {(r.stderr or r.stdout)[-300:]}")
    except Exception as e:
        openhq.log(f"[{agent}] hermes failed: {type(e).__name__}")
    items = extract_items(text)
    if not items and os.environ.get("HERMES_STRICT") != "1":
        engine = "direct-fallback"
        try:
            text, _ = openhq.chat(model, [{"role": "user", "content": prompt}], max_tokens=3000)
            items = extract_items(text)
        except Exception as e:
            openhq.log(f"[{agent}] fallback failed: {type(e).__name__}")
    openhq.log(f"[{agent}] model={model} engine={engine} activity={len(a)} messages={len(m)} -> {len(items)} items")
    return agent, engine, items


def main():
    act, msgs, src = load_week()
    openhq.log(f"data source: {src} ({len(act)} activity, {len(msgs)} messages)")
    with ThreadPoolExecutor(max_workers=5) as pool:
        results = list(pool.map(lambda a: review(a, act, msgs), AGENTS))
    items = [dict(agent=a, **it) for a, _, its in results for it in its]
    for a, eng, its in results:
        for it in its:
            print(f"ITEM {a} {it['kind']}: {it['text']}  (why: {it['why'][:90]})")
    openhq.log("engines: " + json.dumps({a: e for a, e, _ in results}))
    bodies = []
    for a, _, its in results:
        for kind, ingest_kind in (("memory", "memories"), ("standing_order", "standing_orders")):
            sel = [{"text": i["text"], "source": ("why: " + i["why"])[:120]} for i in its if i["kind"] == kind]
            if sel:
                bodies.append({"kind": ingest_kind, "job": "hermes-review", "agent": a, "items": sel})
    openhq.deliver({"job": "hermes-review", "runId": openhq.run_id("hr"), "items": items}, bodies)


if __name__ == "__main__":
    main()
