-- Accounts created through GitHub or Google sign-in had no username, so their public profile had
-- no address. Each one gets a username from its display name, or "user" when the name has no
-- usable letters, with a suffix from the account id when that name is taken. Email addresses stay
-- out of it, since the username is public.
WITH named AS (
  SELECT
    id,
    created_at,
    trim(BOTH '-_' FROM left(regexp_replace(regexp_replace(lower(name), '[^a-z0-9_-]+', '-', 'g'), '-{2,}', '-', 'g'), 30)) AS slug
  FROM "user"
  WHERE username IS NULL
), ranked AS (
  SELECT
    id,
    base,
    row_number() OVER (PARTITION BY base ORDER BY created_at, id) AS n
  FROM (
    SELECT id, created_at, CASE WHEN slug ~ '^[a-z0-9_-]{3,30}$' THEN slug ELSE 'user' END AS base
    FROM named
  ) AS based
), picked AS (
  SELECT
    id,
    CASE
      WHEN n = 1 AND NOT EXISTS (SELECT 1 FROM "user" AS taken WHERE taken.username = base) THEN base
      ELSE rtrim(left(base, 21), '-_') || '-' || left(md5(id), 8)
    END AS username
  FROM ranked
)
UPDATE "user"
SET username = picked.username, display_username = picked.username
FROM picked
WHERE "user".id = picked.id;
