# Source on the box to talk to the isolated openhq OpenShell gateway (19270) without touching other products' state.
REAL=${REAL:-$(eval echo ~$(id -un))}
# fnm keeps the global nemoclaw install under the node version dir (multishell dirs are per-shell and unstable)
export PATH="$REAL/.local/share/fnm/node-versions/v24.15.0/installation/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
export NEMO_HOME=$REAL/openhq/nemo-home
export HOME=$NEMO_HOME XDG_CONFIG_HOME=$NEMO_HOME/.config XDG_STATE_HOME=$NEMO_HOME/.local/state XDG_DATA_HOME=$NEMO_HOME/.local/share
export DOCKER_HOST=unix://$REAL/.colima/default/docker.sock NEMOCLAW_GATEWAY_PORT=19270 NEMOCLAW_DISABLE_TELEMETRY=1
