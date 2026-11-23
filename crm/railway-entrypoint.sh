#!/bin/bash
# Startup wrapper for the official EspoCRM image on Railway.
#
# 1. Persistence: EspoCRM 10 keeps state in three folders (data, custom,
#    client/custom), but a Railway service can mount only one volume. Mount the
#    volume at /persist; on first start the image's starter files are copied
#    there and each folder is replaced by a link into the volume.
# 2. Background jobs: EspoCRM sends mass email from scheduled jobs. The official
#    setup runs those in a second container sharing the volume, which Railway
#    can't do, so the job daemon runs here, in the background, as www-data.
# 3. Port: Apache listens on $PORT (Railway sets it), default 80.
set -euo pipefail

APP=/var/www/html
PERSIST=${ESPOCRM_PERSIST_DIR:-/persist}

if [ -d "$PERSIST" ]; then
    for dir in data custom client/custom; do
        target="$PERSIST/$dir"
        if [ ! -d "$target" ]; then
            echo >&2 "info: Initializing $target from the image."
            mkdir -p "$target"
            if [ -d "$APP/$dir" ] && [ ! -L "$APP/$dir" ]; then
                cp -a "$APP/$dir/." "$target/"
            fi
        fi
        if [ ! -L "$APP/$dir" ]; then
            rm -rf "${APP:?}/$dir"
            ln -s "$target" "$APP/$dir"
        fi
    done
    chown -R www-data:www-data "$PERSIST"
else
    echo >&2 "warning: $PERSIST is not mounted. Data will be lost when the container restarts."
    echo >&2 "warning: Add a Railway volume mounted at $PERSIST (see crm/README.md)."
fi

PORT=${PORT:-80}
if [ "$PORT" != "80" ]; then
    sed -ri "s/^Listen 80$/Listen ${PORT}/" /etc/apache2/ports.conf
    sed -ri "s/<VirtualHost \*:80>/<VirtualHost *:${PORT}>/" /etc/apache2/sites-available/000-default.conf
fi

# Job daemon: wait until EspoCRM is installed and ready, fix ownership of files
# that the root-run install/upgrade steps created, then keep daemon.php running.
(
    cd "$APP"
    until bin/command app-check >/dev/null 2>&1; do sleep 10; done
    [ -d "$PERSIST" ] && chown -R www-data:www-data "$PERSIST"
    echo >&2 "info: EspoCRM is ready; starting the job daemon."
    while true; do
        runuser -u www-data -- /usr/local/bin/php "$APP/daemon.php" || true
        echo >&2 "warning: Job daemon exited; restarting in 10 seconds."
        sleep 10
    done
) &

exec docker-entrypoint.sh "$@"
