"""Shared helpers for Open HQ Nebius jobs. Standard library only, so it runs in any image."""
import json
import os
import sys
import time
import urllib.error
import urllib.request

BASE = os.environ.get("OPENHQ_URL", "https://openhq.pages.dev").rstrip("/")
TF_URL = os.environ.get("TOKEN_FACTORY_URL", "https://api.tokenfactory.nebius.com/v1").rstrip("/")


def run_id(prefix):
    return f"{prefix}-{time.strftime('%Y%m%dT%H%M%SZ', time.gmtime())}"


def log(msg):
    print(msg, file=sys.stderr, flush=True)


def http_json(url, body=None, headers=None, timeout=30):
    data = None if body is None else json.dumps(body).encode()
    h = {"content-type": "application/json", "user-agent": "openhq-nebius-job/1"}
    h.update(headers or {})
    req = urllib.request.Request(url, data=data, headers=h, method="POST" if body is not None else "GET")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode() or "null")


def chat(model, messages, max_tokens=1024, thinking=None, temperature=0.2, timeout=120, retries=2):
    """Token Factory chat completion. thinking=False sends enable_thinking=false (Lightning screen)."""
    body = {"model": model, "messages": messages, "max_tokens": max_tokens, "temperature": temperature}
    if thinking is False:
        body["chat_template_kwargs"] = {"enable_thinking": False}
    last = None
    for attempt in range(retries + 1):
        try:
            out = http_json(f"{TF_URL}/chat/completions", body,
                            {"authorization": f"Bearer {os.environ['NEBIUS_API_KEY']}"}, timeout)
            msg = out["choices"][0]["message"]
            return (msg.get("content") or "").strip(), out.get("usage") or {}
        except (urllib.error.URLError, TimeoutError, KeyError, ValueError) as e:
            last = e
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"token factory call failed: {type(last).__name__}")


def resolve_model(preferred, fallbacks=("nvidia/Nemotron-3-Ultra-550b-a55b",)):
    """Return `preferred` if Token Factory lists it, else the first listed fallback (logged)."""
    try:
        ids = {m["id"] for m in http_json(f"{TF_URL}/models", headers={"authorization": f"Bearer {os.environ['NEBIUS_API_KEY']}"})["data"]}
    except Exception as e:
        log(f"model list unavailable ({type(e).__name__}); using {preferred}")
        return preferred
    if preferred in ids:
        return preferred
    for f in fallbacks:
        if f in ids:
            log(f"model {preferred} is not listed by Token Factory; using {f}")
            return f
    return preferred


def fetch_json(path, fallback_file, timeout=10):
    """GET from the live app; on any failure use the bundled fixture. Returns (data, source)."""
    try:
        return http_json(f"{BASE}{path}", timeout=timeout), f"live:{BASE}{path}"
    except Exception as e:  # network down, DNS, 4xx/5xx, bad JSON: fixtures keep the job useful
        log(f"live fetch {path} unavailable ({type(e).__name__}); using fixture {fallback_file}")
        with open(fallback_file) as f:
            return json.load(f), f"fixture:{os.path.basename(fallback_file)}"


def deliver(result, bodies):
    """POST each body to /api/ingest (shape defined by apps/api/src/routes/hooks.ts).
    If the secret is missing or any POST fails, print the full result JSON to stdout and still exit 0."""
    secret = os.environ.get("INGEST_SECRET", "")
    ok = 0
    if secret:
        for b in bodies:
            try:
                http_json(f"{BASE}/api/ingest", b, {"authorization": f"Bearer {secret}"}, 30)
                ok += 1
            except urllib.error.HTTPError as e:
                log(f"ingest rejected {b.get('kind')}/{b.get('agent', '-')}: HTTP {e.code} {e.read().decode()[:160]}")
            except Exception as e:
                log(f"ingest unreachable ({type(e).__name__})")
                break
    else:
        log("INGEST_SECRET not set; falling back to stdout")
    log(f"ingest: {ok}/{len(bodies)} bodies accepted")
    if ok == len(bodies) and bodies:
        print(json.dumps({"delivered": True, "job": result["job"], "runId": result["runId"], "bodies": ok}))
        return True
    print("OPENHQ_RESULT_JSON " + json.dumps(result, ensure_ascii=False))
    return False
