CREATE TABLE IF NOT EXISTS merchant_label_rules (
  id serial PRIMARY KEY,
  user_id varchar(255) NOT NULL,
  merchant_name varchar(255) NOT NULL,
  label varchar(20) NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS merchant_label_rules_user_merchant_idx
ON merchant_label_rules (user_id, merchant_name);

CREATE INDEX IF NOT EXISTS merchant_label_rules_user_idx
ON merchant_label_rules (user_id);
