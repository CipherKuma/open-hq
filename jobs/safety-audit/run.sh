#!/usr/bin/env bash
# Start the Nemotron Content Safety audit on ONE Nebius GPU (time-boxed, ~15 min). On demand only.
# This project exposes gpu-b300-sxm (1gpu-24vcpu-346gb); H100/H200/L40S are not enabled for it.
D="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; source "$D/../lib/submit.sh"
JOB_BASE=safety-audit
IMAGE=pytorch/pytorch:2.14.1-cuda13.0-cudnn9-runtime
PLATFORM="${GPU_PLATFORM:-gpu-b300-sxm}"; PRESET="${GPU_PRESET:-1gpu-24vcpu-346gb}"
TIMEOUT=1h   # platform minimum; the script itself stops after TIME_BUDGET_S and the launcher deletes the job
CMD=bash
ARGS='-c "pip install -q transformers accelerate && python /app/job.py"'
INJECTS=("$D/job.py:/app/job.py" "$JOBS_DIR/lib/openhq.py:/app/lib/openhq.py"
         "$JOBS_DIR/fixtures/outbound-drafts.json:/app/fixtures/outbound-drafts.json")
EXTRA_ENV=("HF_HOME=/tmp/hf" "TIME_BUDGET_S=${TIME_BUDGET_S:-900}")
submit_job
