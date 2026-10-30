#!/usr/bin/env bash
# Run from the repo root on your machine: copies SOUL.md + config.yaml of each profile into the box's data volume.
set -euo pipefail
COPYFILE_DISABLE=1 tar -C hermes/profiles -cf - . | ssh m2worker 'export PATH=/opt/homebrew/bin:$PATH; docker exec -i -u hermes openhq-hermes tar -xf - -C /opt/data/profiles --no-same-owner --no-same-permissions'
echo "profiles pushed"
