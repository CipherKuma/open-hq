#!/usr/bin/env bash
# Start the NeMo Guardrails red-team job on Nebius Serverless Jobs (CPU). On demand only.
D="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; source "$D/../lib/submit.sh"
JOB_BASE=guardrails
IMAGE=python:3.12            # full image: nemoguardrails builds annoy from source (needs gcc)
PLATFORM=cpu-d3; PRESET=4vcpu-16gb
TIMEOUT=1h
CMD=bash
ARGS='-c "pip install -q nemoguardrails langchain-openai && python /app/job.py"'
INJECTS=("$D/job.py:/app/job.py" "$D/screen_prompt.txt:/app/screen_prompt.txt"
         "$JOBS_DIR/lib/openhq.py:/app/lib/openhq.py" "$JOBS_DIR/fixtures/injection-emails.json:/app/fixtures/injection-emails.json")
EXTRA_ENV=()
submit_job
