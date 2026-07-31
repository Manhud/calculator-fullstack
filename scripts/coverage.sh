#!/usr/bin/env bash
#
# Regenerates the coverage report and enforces the thresholds in CLAUDE.md Section 6.
# Exits non-zero when a threshold is missed, so `make coverage` fails instead of
# printing a number nobody reads.
#
set -euo pipefail

MIN_TOTAL=85
MIN_DOMAIN=100
MIN_FRONTEND=85
DOMAIN_PATH="internal/calculator"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND="${REPO_ROOT}/backend"
FRONTEND="${REPO_ROOT}/frontend"
REPORT_DIR="${REPO_ROOT}/docs/coverage"

mkdir -p "${REPORT_DIR}"
cd "${BACKEND}"

# -covermode=count so the profile records hit counts; the gate only needs >0,
# but the rendered HTML is more informative with counts than with set mode.
go test ./... -covermode=count -coverprofile=coverage.out
go tool cover -html=coverage.out -o "${REPORT_DIR}/backend.html"

# Statement coverage for the files matching $1 (empty matches everything).
#
# Profile lines are "file.go:startLine.col,endLine.col numStatements hitCount".
# Percentage is statement-weighted: sum the statements of covered blocks over the
# total. Averaging the per-function percentages that `go tool cover -func` prints
# would weight a one-statement helper the same as a twenty-statement handler.
statement_coverage() {
  awk -v filter="$1" '
    NR == 1 { next }                                    # skip the "mode:" header
    filter != "" && index($1, filter) == 0 { next }
    { total += $2; if ($3 > 0) covered += $2 }
    END {
      if (total == 0) { print "none"; exit }
      printf "%.1f", covered * 100 / total
    }
  ' coverage.out
}

total_pct=$(statement_coverage "")
domain_pct=$(statement_coverage "${DOMAIN_PATH}/")

# Vitest writes its own HTML report into docs/coverage/frontend. The summary is
# read from the v8 JSON so the threshold is enforced here rather than trusted to
# a config file nobody looks at.
cd "${FRONTEND}"
npm run --silent test:coverage -- --coverage.reporter=json-summary --coverage.reporter=html >/dev/null
frontend_pct=$(node -e '
  const summary = require("../docs/coverage/frontend/coverage-summary.json");
  process.stdout.write(summary.total.statements.pct.toFixed(1));
' 2>/dev/null || echo "none")

# A domain package that reports "none" has no measured statements at all, which
# means the package or its tests are missing — not that it is trivially perfect.
fail=0
report() { # name actual minimum
  local name="$1" actual="$2" minimum="$3" status
  if [ "${actual}" = "none" ]; then
    status="NO DATA"
    fail=1
  elif awk -v a="${actual}" -v m="${minimum}" 'BEGIN { exit !(a + 0 >= m) }'; then
    status="pass"
  else
    status="FAIL"
    fail=1
  fi
  printf '  %-28s %7s  (minimum %s%%)  %s\n' "${name}" "${actual}%" "${minimum}" "${status}"
}

echo
echo "Coverage gate — thresholds from CLAUDE.md Section 6"
report "total (backend)" "${total_pct}" "${MIN_TOTAL}"
report "${DOMAIN_PATH}" "${domain_pct}" "${MIN_DOMAIN}"
report "frontend" "${frontend_pct}" "${MIN_FRONTEND}"
echo
echo "  reports: docs/coverage/backend.html · docs/coverage/frontend/index.html"
echo

if [ "${fail}" -ne 0 ]; then
  echo "Coverage gate failed. Raise the tests, not the thresholds." >&2
  exit 1
fi
