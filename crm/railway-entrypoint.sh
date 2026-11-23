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

# Apache can load only one MPM, and mod_php needs mpm_prefork. On Railway the
# container ended up with a second MPM enabled ("AH00534: More than one MPM
# loaded"), so make sure prefork is the only one before Apache starts.
for mpm in mpm_event mpm_worker; do
    if [ -e "/etc/apache2/mods-enabled/$mpm.load" ]; then
        echo >&2 "info: Disabling Apache $mpm (only mpm_prefork works with PHP)."
        rm -f "/etc/apache2/mods-enabled/$mpm.load" "/etc/apache2/mods-enabled/$mpm.conf"
    fi
done
if [ ! -e /etc/apache2/mods-enabled/mpm_prefork.load ]; then
    a2enmod -q mpm_prefork >/dev/null
fi

PORT=${PORT:-80}
if [ "$PORT" != "80" ]; then
    sed -ri "s/^Listen 80$/Listen ${PORT}/" /etc/apache2/ports.conf
    sed -ri "s/<VirtualHost \*:80>/<VirtualHost *:${PORT}>/" /etc/apache2/sites-available/000-default.conf
fi

# If Apache's config is still invalid, log where MPMs are loaded so the cause
# is visible in the deploy logs instead of only "Configuration error".
if ! apache2ctl -t >/dev/null 2>&1; then
    echo >&2 "error: Apache configuration test failed:"
    apache2ctl -t 2>&1 | sed 's/^/  /' >&2 || true
    echo >&2 "error: MPM modules loaded by these files:"
    grep -rln "LoadModule mpm_" /etc/apache2 2>/dev/null | sed 's/^/  /' >&2 || true
fi

# Job daemon: wait until EspoCRM is installed and ready, fix ownership of files
# that the root-run install/upgrade steps created, then keep daemon.php running.
(
    cd "$APP"
    until bin/command app-check >/dev/null 2>&1; do sleep 10; done

    # Optional admin reset: EspoCRM reads ESPOCRM_ADMIN_USERNAME/PASSWORD only on
    # the very first install. With ESPOCRM_RESET_ADMIN=true, create that user if
    # missing and set its password. Applied once per username+password pair
    # (remembered on the volume), so a password changed later in EspoCRM isn't
    # reverted on restart.
    if [ "${ESPOCRM_RESET_ADMIN:-}" = "true" ] && [ -n "${ESPOCRM_ADMIN_USERNAME:-}" ] && [ -n "${ESPOCRM_ADMIN_PASSWORD:-}" ]; then
        marker="$PERSIST/.admin-reset"
        fingerprint=$(printf '%s:%s' "$ESPOCRM_ADMIN_USERNAME" "$ESPOCRM_ADMIN_PASSWORD" | sha256sum | cut -d' ' -f1)
        if [ "$(cat "$marker" 2>/dev/null || true)" = "$fingerprint" ]; then
            echo >&2 "info: Admin reset already applied for these credentials; skipping."
        else
            bin/command create-admin-user "$ESPOCRM_ADMIN_USERNAME" >/dev/null 2>&1 \
                && echo >&2 "info: Created admin user \"$ESPOCRM_ADMIN_USERNAME\"." \
                || echo >&2 "info: Admin user \"$ESPOCRM_ADMIN_USERNAME\" already exists."
            if printf '%s\n' "$ESPOCRM_ADMIN_PASSWORD" | bin/command set-password "$ESPOCRM_ADMIN_USERNAME" >/dev/null 2>&1; then
                echo >&2 "info: Password set for admin user \"$ESPOCRM_ADMIN_USERNAME\". You can remove ESPOCRM_RESET_ADMIN now."
                [ -d "$PERSIST" ] && printf '%s' "$fingerprint" > "$marker"
            else
                echo >&2 "error: Could not set the password for \"$ESPOCRM_ADMIN_USERNAME\"."
            fi
        fi
    fi

    [ -d "$PERSIST" ] && chown -R www-data:www-data "$PERSIST"
    echo >&2 "info: EspoCRM is ready; starting the job daemon."
    while true; do
        runuser -u www-data -- /usr/local/bin/php "$APP/daemon.php" || true
        echo >&2 "warning: Job daemon exited; restarting in 10 seconds."
        sleep 10
    done
) &

exec docker-entrypoint.sh "$@"
