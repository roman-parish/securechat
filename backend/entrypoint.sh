#!/bin/sh
set -e
# Named Docker volumes are initially owned by root at runtime, regardless of
# what the Dockerfile chown'd during build. Fix it here so the node user can
# write uploads, then drop privileges before starting the app.
chown -R node:node /app/uploads 2>/dev/null || true
exec su-exec node dumb-init -- "$@"
