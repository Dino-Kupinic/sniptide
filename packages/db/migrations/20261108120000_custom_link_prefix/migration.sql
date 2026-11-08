-- Custom links move from sniptide.com/<handle>/<name> to sniptide.com/@<handle>/<name>, so the
-- first path segment stays free for generated slugs and app routes. Stored slugs carry the "@" so
-- every URL built from a slug points at the new address.
UPDATE paste SET slug = '@' || slug WHERE slug LIKE '%/%' AND slug NOT LIKE '@%';
