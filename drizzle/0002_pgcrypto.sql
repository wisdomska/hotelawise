-- bcrypt password hashing runs in Postgres (DECISIONS D-28).
CREATE EXTENSION IF NOT EXISTS pgcrypto;
