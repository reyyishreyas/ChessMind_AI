-- 006: store parsed model response + call context on llm_calls.
-- Allows replay-validation of claims (grounding suite) without re-calling models.
alter table public.llm_calls
  add column if not exists data jsonb,
  add column if not exists meta jsonb;