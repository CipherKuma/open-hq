#!/usr/bin/env bash
# From the repo root on your machine: stage profiles on the box and provision them into the openhq-agents sandbox.
set -euo pipefail
ssh m2worker 'rm -rf ~/openhq/stage; mkdir -p ~/openhq/stage'
COPYFILE_DISABLE=1 tar -C hermes/profiles -cf - . | ssh m2worker 'mkdir -p ~/openhq/stage/profiles && tar -xf - -C ~/openhq/stage/profiles 2>/dev/null'
scp -q hermes/box/nemo-env.sh m2worker:openhq/nemo-env.sh
ssh m2worker 'bash -s' < hermes/box/sandbox-provision.sh
