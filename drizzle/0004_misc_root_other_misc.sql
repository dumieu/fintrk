-- Misc flow: top-level category display name (slug stays `other`)

UPDATE system_categories
SET name = 'Other Misc'
WHERE slug = 'other'
  AND parent_id IS NULL
  AND flow_type = 'misc';

UPDATE user_categories
SET name = 'Other Misc'
WHERE slug = 'other'
  AND parent_id IS NULL
  AND flow_type = 'misc';
