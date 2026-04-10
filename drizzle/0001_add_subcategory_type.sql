-- Add subcategory_type enum and column to system_categories + user_categories

CREATE TYPE subcategory_type AS ENUM ('discretionary', 'semi-discretionary', 'non-discretionary');

ALTER TABLE system_categories ADD COLUMN subcategory_type subcategory_type;
ALTER TABLE user_categories   ADD COLUMN subcategory_type subcategory_type;

-- Backfill system_categories subcategory_type for expense subcategories (parentId IS NOT NULL)
-- Income subcategories are left NULL (not expense)

-- Non-discretionary: essential, unavoidable
UPDATE system_categories SET subcategory_type = 'non-discretionary' WHERE slug IN (
  'rent-mortgage', 'utilities', 'insurance-housing', 'property-tax',
  'fuel', 'car-payment', 'car-insurance',
  'groceries',
  'medical', 'pharmacy', 'health-insurance',
  'bank-fees', 'interest-charges', 'fx-fees', 'atm-fees',
  'tuition',
  'loan-payment', 'credit-card-payment',
  'internal-transfer', 'savings-transfer'
);

-- Semi-discretionary: needed but amount/frequency is flexible
UPDATE system_categories SET subcategory_type = 'semi-discretionary' WHERE slug IN (
  'maintenance',
  'public-transit', 'ride-share', 'parking',
  'delivery',
  'personal-care',
  'fitness', 'mental-health',
  'investment-fees',
  'travel-insurance',
  'books-supplies', 'courses',
  'charity', 'religious'
);

-- Discretionary: fully optional
UPDATE system_categories SET subcategory_type = 'discretionary' WHERE slug IN (
  'restaurants', 'coffee', 'bars-nightlife',
  'clothing', 'electronics', 'home-garden', 'online-shopping',
  'streaming', 'gaming', 'events-concerts', 'hobbies', 'books-media',
  'flights', 'hotels', 'travel-activities', 'car-rental',
  'gifts',
  'uncategorized', 'atm-withdrawal', 'cash', 'miscellaneous'
);

-- Backfill existing user_categories from their linked system_categories
UPDATE user_categories uc
SET subcategory_type = sc.subcategory_type
FROM system_categories sc
WHERE uc.system_category_id = sc.id
  AND sc.subcategory_type IS NOT NULL
  AND uc.subcategory_type IS NULL;
