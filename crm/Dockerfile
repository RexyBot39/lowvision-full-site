# EspoCRM for outreach to organizations, deployed as its own Railway service.
# See crm/README.md. Uses the official image; only adds a startup wrapper so it
# fits Railway (one volume per service, no shared volumes, dynamic PORT).
FROM espocrm/espocrm:10.1.4-apache

COPY railway-entrypoint.sh /usr/local/bin/railway-entrypoint.sh
# Only one Apache MPM may be loaded, and PHP needs prefork (see the entrypoint).
RUN chmod +x /usr/local/bin/railway-entrypoint.sh \
 && (a2dismod -f mpm_event mpm_worker >/dev/null 2>&1 || true) \
 && a2enmod mpm_prefork >/dev/null

ENTRYPOINT ["railway-entrypoint.sh"]
CMD ["apache2-foreground"]
