-- Migration 016: Portfolio Builder document
-- The new Canva-class builder stores its whole document (nodes + meta) as one
-- JSON blob. Keeps the old columns for backward-compat but `doc_json` is the
-- source of truth going forward.

ALTER TABLE portfolios ADD COLUMN doc_json TEXT;
