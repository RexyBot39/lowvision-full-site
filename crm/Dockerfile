# EspoCRM for outreach to organizations, deployed as its own Railway service.
# See crm/README.md. Uses the official image; only adds a startup wrapper so it
# fits Railway (one volume per service, no shared volumes, dynamic PORT).
FROM espocrm/espocrm:10.1.4-apache

COPY railway-entrypoint.sh /usr/local/bin/railway-entrypoint.sh
RUN chmod +x /usr/local/bin/railway-entrypoint.sh

ENTRYPOINT ["railway-entrypoint.sh"]
CMD ["apache2-foreground"]
