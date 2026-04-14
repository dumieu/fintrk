-- Add Shopping → Apparel subcategory; shift "Other" sort after it.
-- Applied to production Neon 2026-04-14.

UPDATE system_categories
SET sort_order = 6
WHERE slug = 'other-shopping';

INSERT INTO system_categories (name, slug, parent_id, icon, color, sort_order, subcategory_type, flow_type)
SELECT
  'Apparel',
  'apparel',
  id,
  'Shirt',
  '#FF6F69',
  5,
  'discretionary',
  'outflow'
FROM system_categories
WHERE slug = 'shopping' AND parent_id IS NULL
ON CONFLICT (slug) DO NOTHING;
