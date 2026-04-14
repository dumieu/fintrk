-- Add flow_type to system_categories and user_categories
-- Four flows: inflow, outflow, savings, misc

CREATE TYPE flow_type AS ENUM ('inflow', 'outflow', 'savings', 'misc');

ALTER TABLE system_categories ADD COLUMN flow_type flow_type;
ALTER TABLE user_categories   ADD COLUMN flow_type flow_type;

-- Backfill system_categories: top-level parents get their flow directly
UPDATE system_categories SET flow_type = 'inflow'  WHERE slug = 'income';
UPDATE system_categories SET flow_type = 'outflow'  WHERE slug IN (
  'housing', 'transportation', 'food-drink', 'shopping',
  'entertainment', 'health', 'financial', 'travel',
  'education', 'gifts-donations'
);
UPDATE system_categories SET flow_type = 'savings'  WHERE slug = 'transfers';
UPDATE system_categories SET flow_type = 'misc'     WHERE slug = 'other';

-- Children inherit flow_type from their parent
UPDATE system_categories child
SET flow_type = parent.flow_type
FROM system_categories parent
WHERE child.parent_id = parent.id
  AND child.flow_type IS NULL
  AND parent.flow_type IS NOT NULL;

-- Backfill user_categories from their linked system_categories
UPDATE user_categories uc
SET flow_type = sc.flow_type
FROM system_categories sc
WHERE uc.system_category_id = sc.id
  AND sc.flow_type IS NOT NULL
  AND uc.flow_type IS NULL;

-- User categories not linked to system_categories: inherit from parent
UPDATE user_categories child
SET flow_type = parent.flow_type
FROM user_categories parent
WHERE child.parent_id = parent.id
  AND child.flow_type IS NULL
  AND parent.flow_type IS NOT NULL;

-- Any remaining NULL user_categories (orphans) get 'misc'
UPDATE user_categories SET flow_type = 'misc' WHERE flow_type IS NULL;

-- Make flow_type NOT NULL now that all rows are backfilled
ALTER TABLE system_categories ALTER COLUMN flow_type SET NOT NULL;
ALTER TABLE user_categories   ALTER COLUMN flow_type SET NOT NULL;
