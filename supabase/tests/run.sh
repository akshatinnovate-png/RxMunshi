#!/usr/bin/env bash
# Applies the migrations and seed to a throwaway database and runs the RLS tests.
# Usage: PGUSER=postgres supabase/tests/run.sh   (needs a local Postgres 15+)
set -euo pipefail
cd "$(dirname "$0")/.."
DB=rxmunshi_test_$$
psql -q -v ON_ERROR_STOP=1 -d postgres -c "create database $DB"
trap 'psql -q -d postgres -c "drop database if exists $DB" >/dev/null' EXIT
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f tests/supabase_stubs.sql
for f in migrations/*.sql; do psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f"; done
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f seed.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f tests/rls_test.sql
