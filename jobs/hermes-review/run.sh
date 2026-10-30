#!/usr/bin/env bash
# Start the Hermes weekly deep review on Nebius Serverless Jobs (CPU, official Hermes image). On demand only.
D="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; source "$D/../lib/submit.sh"
JOB_BASE=hermes-review
IMAGE=nousresearch/hermes-agent:stable
PLATFORM=cpu-d3; PRESET=4vcpu-16gb
TIMEOUT=1h
CMD=bash
ARGS='-c "/opt/hermes/.venv/bin/python /app/job.py"'
INJECTS=("$D/job.py:/app/job.py" "$JOBS_DIR/lib/openhq.py:/app/lib/openhq.py"
         "$JOBS_DIR/fixtures/activity-week.json:/app/fixtures/activity-week.json")
EXTRA_ENV=()
submit_job
