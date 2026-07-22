# Expenditure Budget Tracking - Implementation Summary

## What Changed

### Problem Solved
Admins can now fill in **approved annual budgets for all project years** in the project document (before any reports are created). When reports are created, they **automatically reference those approved amounts** and enable budget vs actual comparison.

### Solution
Added 4 columns to `expenditure_entries` table:
- **`year`** — Explicit year context (from report)
- **`approved_amount`** — Snapshot of approved budget for that year/category
- **`variance`** — Auto-calculated: `actual - approved`
- **`variance_percent`** — Auto-calculated: `(variance / approved) * 100`

## Files Modified

### Database
| File | Change |
|------|--------|
| `db/015_expenditure_refactor.sql` | New migration file with schema changes |
| `db/schema.sql` | Updated canonical schema with new columns |

### Application
| File | Change |
|------|--------|
| `src/app/api/reports/route.ts` | Added `populateExpenditureEntries()` function; called during report creation |

## How It Works (User Perspective)

### Step 1: Admin Sets Approved Budgets
In project document (prodoc), admin enters approved amount for each category, each year:
```
Category          2025          2026          2027
Staff             $50,000       $52,000       $54,000
Equipment         $20,000       $20,000       $20,000
Travel            $15,000       $15,000       $15,000
```

### Step 2: Report is Created
When partner creates a report for project, year 2025:
- Report is created automatically
- All expenditure categories are pre-filled with approved amounts:

```
Category    | Approved   | Actual    | Variance   | % Variance
Staff       | $50,000    | —         | —          | —
Equipment   | $20,000    | —         | —          | —
Travel      | $15,000    | —         | —          | —
```

### Step 3: Partner Fills in Actuals
Partner enters actual spend:
- Staff: $48,000 → Variance: -$2,000 (-4%)
- Equipment: $22,500 → Variance: +$2,500 (+12.5%)
- Travel: $15,000 → Variance: $0 (0%)

```
Category    | Approved   | Actual    | Variance   | % Variance
Staff       | $50,000    | $48,000   | -$2,000    | -4.0%
Equipment   | $20,000    | $22,500   | +$2,500    | +12.5%
Travel      | $15,000    | $15,000   | $0         | 0.0%
```

## Technical Details (Database Principles)

### Denormalization with Purpose ✓
- `approved_amount` stored in report's expenditure_entries
- Why: Historical accuracy — captures budget as it existed when report created
- Benefit: Budget changes don't retroactively affect old reports
- No complex JOINs needed in queries

### Computed Values via GENERATED Columns ✓
- `variance` and `variance_percent` calculated at database layer
- Why: Single point of truth, zero app-logic duplication
- Benefit: Consistent across all queries, performant (stored on disk)
- Database prevents manual edits that would break invariants

### Strategic Indexing ✓
- Index on `year` — filter reports by period
- Partial index on `(category_id, year) WHERE annual_expenditure IS NOT NULL`
  - Only indexes rows with actual spend (smaller, faster)
  - Perfect for "show me budgets with actuals"

### Referential Integrity ✓
- CHECK constraints: non-negative amounts
- Data integrity enforced at database layer
- No invalid data can be inserted

## Data Flow

```
Project Setup                    Report Creation              Report Editing
────────────────                ───────────────              ──────────────

Admin edits                      Partner creates report       Partner enters
approved budgets                 for project, year 2025       actual spend
↓                                ↓                            ↓
expenditure_budgets              populateExpenditureEntries() UPDATE
(project-level,                  called automatically         expenditure_entries
all years)                        ↓                           (fill annual_expenditure)
                                 expenditure_entries          ↓
                                 pre-populated with           variance &
                                 approved amounts             variance_percent
                                                             auto-calculated
```

## Data Guarantees

✅ **One row per report, per category** — No duplicates (UNIQUE constraint)  
✅ **Year always explicit** — No implicit dates from JOINs  
✅ **Approved amount immutable in report** — Budget changes don't break history  
✅ **Variance always current** — GENERATED columns auto-update when actual changes  
✅ **Null-safe** — Rows pre-populated with budgets (or 0 if no budget defined)  

## API Changes

### GET /api/expenditure-entries?report_id=456

Returns new columns in response:
```json
{
  "id": 1,
  "report_id": 456,
  "category_id": 1,
  "year": 2025,
  "approved_amount": 50000.00,
  "annual_expenditure": 48000.00,
  "variance": -2000.00,
  "variance_percent": -4.0,
  "comment": "Savings from hiring delays"
}
```

### Report Creation Flow

```
POST /api/reports { project_id, year }
↓
1. Create report row
2. Call copyProdocBaseline() — seed surveys, risks, indicators
3. Call populateExpenditureEntries() — seed expenditure categories with approved amounts
4. COMMIT (all-or-nothing)
```

## Migration Path

### Step 1: Run Migration
```bash
npm run migrate -- 015_expenditure_refactor.sql
```

### Step 2: Verify Backfill
```sql
SELECT COUNT(*) FROM expenditure_entries WHERE year IS NULL;
-- Should return 0 — all rows backfilled
```

### Step 3: Update Frontend
- Query API for new columns
- Display budget vs actual table
- Show variance and variance_percent

## No Breaking Changes

✓ Old API responses still work (columns just added to JSON)  
✓ Existing code doesn't break (columns have defaults during backfill)  
✓ Can deploy schema first, then update frontend separately  

## Next: Frontend Implementation

To complete the flow, frontend should:
1. Display budget vs actual table with new columns
2. Allow admin to edit approved budgets per year (in prodoc)
3. Show variance and % variance in report view
4. Optional: Add variance trend charts across years
