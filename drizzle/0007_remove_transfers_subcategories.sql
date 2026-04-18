-- Remove Transfers children: Loan Payment, Credit Card Payment, Savings Transfer
-- (IDs may vary; delete by slug.)

UPDATE user_categories
SET system_category_id = NULL
WHERE system_category_id IN (
  SELECT id FROM system_categories
  WHERE slug IN ('loan-payment', 'credit-card-payment', 'savings-transfer')
);

DELETE FROM system_categories
WHERE slug IN ('loan-payment', 'credit-card-payment', 'savings-transfer');
