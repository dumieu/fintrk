-- Misc flow: legacy "Other Outflow" parent → "Other"; first misc child → "Card Payments"
-- (replaces former "Uncategorized" row under slug `other`, and any misnamed "Other Outflow" children)

-- system_categories: misc root display
UPDATE system_categories
SET name = 'Other'
WHERE slug = 'other' AND parent_id IS NULL AND flow_type = 'misc';

-- system_categories: Uncategorized → Card Payments (slug must stay globally unique on this table)
UPDATE system_categories c
SET name = 'Card Payments', slug = 'card-payments', icon = 'CreditCard'
FROM system_categories p
WHERE c.parent_id = p.id
  AND p.slug = 'other'
  AND p.parent_id IS NULL
  AND p.flow_type = 'misc'
  AND c.slug = 'uncategorized';

-- system_categories: any misc child literally named "Other Outflow" (not already updated)
UPDATE system_categories c
SET name = 'Card Payments', slug = 'card-payments', icon = 'CreditCard'
FROM system_categories p
WHERE c.parent_id = p.id
  AND p.slug = 'other'
  AND p.parent_id IS NULL
  AND p.flow_type = 'misc'
  AND c.flow_type = 'misc'
  AND c.name = 'Other Outflow'
  AND c.slug <> 'card-payments';

-- user_categories: misc root
UPDATE user_categories
SET name = 'Other'
WHERE slug = 'other'
  AND parent_id IS NULL
  AND flow_type = 'misc'
  AND name = 'Other Outflow';

-- user_categories: former Uncategorized under misc Other → Card Payments
UPDATE user_categories uc
SET name = 'Card Payments', slug = 'card-payments', icon = 'CreditCard'
FROM user_categories p
WHERE uc.parent_id = p.id
  AND p.slug = 'other'
  AND p.parent_id IS NULL
  AND p.flow_type = 'misc'
  AND uc.flow_type = 'misc'
  AND uc.slug = 'uncategorized';

-- user_categories: misc children still named "Other Outflow"
UPDATE user_categories uc
SET name = 'Card Payments', slug = 'card-payments', icon = COALESCE(NULLIF(uc.icon, ''), 'CreditCard')
FROM user_categories p
WHERE uc.parent_id = p.id
  AND p.slug = 'other'
  AND p.parent_id IS NULL
  AND p.flow_type = 'misc'
  AND uc.flow_type = 'misc'
  AND uc.name = 'Other Outflow'
  AND uc.slug <> 'card-payments';
