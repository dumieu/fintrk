CREATE TABLE IF NOT EXISTS merchant_warning_rules (
  id serial PRIMARY KEY,
  user_id varchar(255) NOT NULL,
  merchant_name varchar(255) NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS merchant_warning_rules_user_merchant_idx
ON merchant_warning_rules (user_id, merchant_name);

CREATE INDEX IF NOT EXISTS merchant_warning_rules_user_idx
ON merchant_warning_rules (user_id);
