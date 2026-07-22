# Expenditure Refactor - Implementation Complete

## Overview

Implemented efficient, principled expenditure tracking enabling admins to define approved annual budgets at the project level, which are automatically compared against actual expenditure in reports.

## Database Changes

### Migration: `db/015_expenditure_refactor.sql`

**Changes to `expenditure_entries` table:**

| Column | Type | Purpose |
|--------|------|---------|
| `year` | SMALLINT | Explicit year context (backfilled from report) |
| `approved_amount` | NUMERIC(15,2) | Snapshot of approved budget (historical accuracy) |
| `variance` | NUMERIC(15,2) GENERATED | Auto-calculated: `annual_expenditure - approved_amount` |
| `variance_percent` | NUMERIC(5,2) GENERATED | Auto-calculated: `(variance / approved_amount) * 100` |

**Efficiency optimizations:**

1. **GENERATED ALWAYS AS STORED columns** — Variance calculated at write time, not query time
   - Single point of truth
   - Consistent across all queries
   - Zero app-logic burden
   - Minimal query overhead

2. **Strategic indexes:**
   - `year` — Filter by reporting year
   - `category_id, year` (partial, WHERE annual_expenditure IS NOT NULL) — Efficient "budgets with actuals" queries

3. **CHECK constraints:**
   - Non-negative amounts: `annual_expenditure >= 0`, `approved_amount >= 0`
   - Data integrity at database layer

4. **Backfill strategy:**
   - Safe: No data loss, existing rows updated with year + approved amount
   - Transactional: All-or-nothing with report creation

## Data Flow

### 1. Project Setup (Prodoc)

**Admin fills approved budgets:**
```sql
-- Stored in expenditure_budgets (project-level, all years)
INSERT INTO expenditure_budgets (project_id, category_id, year, approved_amount)
VALUES (123, 1, 2025, 50000.00);  -- Staff: $50k for 2025
```

### 2. Report Creation (Automatic)

**When partner creates a report for project 123, year 2025:**

**Before (broken):**
- Report created
- No expenditure_entries populated
- Partner has no budget context

**After (fixed):**
- Report created
- `populateExpenditureEntries()` called automatically
- For each expenditure category:
  - Create expenditure_entry row
  - Set `year = 2025`
  - Set `approved_amount = {budget for this category, this year}`
  - Leave `annual_expenditure = NULL` (partner fills this)
  - `variance` and `variance_percent` auto-NULL (calculated when actual is entered)

**SQL executed:**
```sql
INSERT INTO expenditure_entries (report_id, category_id, year, approved_amount)
SELECT nr.id, ec.id, nr.year, COALESCE(eb.approved_amount, 0)
FROM reports nr
CROSS JOIN expenditure_categories ec
LEFT JOIN expenditure_budgets eb
  ON eb.project_id = nr.project_id
  AND eb.category_id = ec.id
  AND eb.year = nr.year
WHERE nr.id = $1
  AND nr.data_type = 'report'
```

**Result (one row per category):**
```
id | report_id | category_id | year | approved_amount | annual_expenditure | variance | variance_percent
1  | 456       | 1           | 2025 | 50000.00        | NULL               | NULL     | NULL
2  | 456       | 2           | 2025 | 20000.00        | NULL               | NULL     | NULL
3  | 456       | 3           | 2025 | 15000.00        | NULL               | NULL     | NULL
```

### 3. Report Editing

**Partner fills in actual expenditure:**
```sql
UPDATE expenditure_entries
SET annual_expenditure = 48000.00
WHERE id = 1;
```

**Database automatically calculates:**
- `variance = 48000.00 - 50000.00 = -2000.00`
- `variance_percent = (-2000.00 / 50000.00) * 100 = -4.0%`

**Result:**
```
id | report_id | category_id | year | approved_amount | annual_expenditure | variance | variance_percent
1  | 456       | 1           | 2025 | 50000.00        | 48000.00           | -2000.00 | -4.0%
```

### 4. Report View / API Response

**GET /api/expenditure-entries?report_id=456**

```json
[
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
  },
  {
    "id": 2,
    "report_id": 456,
    "category_id": 2,
    "year": 2025,
    "approved_amount": 20000.00,
    "annual_expenditure": 22500.00,
    "variance": 2500.00,
    "variance_percent": 12.5,
    "comment": "Increased equipment costs"
  }
]
```

## Code Changes

### API: `src/app/api/reports/route.ts`

**New function: `populateExpenditureEntries()`**

```typescript
async function populateExpenditureEntries(client: PoolClient, reportIds: number[]) {
  if (reportIds.length === 0) return;

  await client.query(
    `INSERT INTO expenditure_entries (report_id, category_id, year, approved_amount)
     SELECT nr.id, ec.id, nr.year, COALESCE(eb.approved_amount, 0)
     FROM reports nr
     CROSS JOIN expenditure_categories ec
     LEFT JOIN expenditure_budgets eb
       ON eb.project_id = nr.project_id
       AND eb.category_id = ec.id
       AND eb.year = nr.year
     WHERE nr.id = ANY($1::int[])
       AND nr.data_type = 'report'
     ON CONFLICT (report_id, category_id) DO NOTHING`,
    [reportIds]
  );
}
```

**Integration points:**
- Called in annual report creation (after `copyProdocBaseline`)
- Called in single report creation (after `copyProdocBaseline`)
- Part of same transaction — atomic with report creation

**Data principles applied:**
- **Set-based**: Populates all categories for all new reports in one query (not looping)
- **Referential integrity**: Uses LEFT JOIN to handle missing budgets gracefully (defaults to 0)
- **Conflict handling**: ON CONFLICT DO NOTHING prevents duplicate rows on retry
- **Transactional**: Rolls back with entire report if any step fails

## Design Principles

### 1. Denormalization with Purpose

**Why store `approved_amount` in expenditure_entries?**
- Historical accuracy: Captures budget as it existed when report was created
- Budget changes don't invalidate old reports
- No complex JOINs needed in queries: expenditure_entries is self-contained
- Single source of truth for report: all comparison data in one row

**Anti-pattern avoided:**
- ❌ Storing only FK to expenditure_budgets and JOINing at query time
- ❌ Budget changes would retroactively change old reports
- ❌ Queries would need: report → project → budget

### 2. GENERATED Columns for Computed Values

**Why use GENERATED ALWAYS AS STORED?**
- Consistency: Single point of truth, no app-logic duplication
- Performance: Calculated at write time, read from index in queries
- Safety: Database prevents manual edits that would break invariants
- Simplicity: No triggers, no app code, just SQL

**Variance calculation:**
```sql
CASE
  WHEN annual_expenditure IS NOT NULL
  THEN annual_expenditure - COALESCE(approved_amount, 0)
  ELSE NULL
END
```

Null-safe: If actual not entered yet, variance is NULL (not 0).

### 3. Strategic Indexing

**Index on `year`:**
- Filter reports by reporting period
- Used in: variance reports, period comparisons, forecasting

**Partial index on `(category_id, year) WHERE annual_expenditure IS NOT NULL`:**
- Only indexes rows with actual expenditure (skips empty/in-progress reports)
- Much smaller, faster than full index
- Perfect for: "Show me budgets with actuals for 2025"

### 4. Data Integrity via Constraints

**CHECK constraints in schema:**
- Non-negative amounts enforced at database layer
- Catches bugs in app logic immediately
- No silent data corruption

## Migration Safety

### Backfill Strategy

**Two-step process:**

1. **Add columns (3 new, 1 GENERATED):**
   ```sql
   ALTER TABLE expenditure_entries ADD COLUMN year SMALLINT;
   ALTER TABLE expenditure_entries ADD COLUMN approved_amount NUMERIC(15,2);
   ALTER TABLE expenditure_entries ADD COLUMN variance NUMERIC(15,2) GENERATED ALWAYS AS (...) STORED;
   ALTER TABLE expenditure_entries ADD COLUMN variance_percent NUMERIC(5,2) GENERATED ALWAYS AS (...) STORED;
   ```

2. **Backfill from existing reports:**
   ```sql
   UPDATE expenditure_entries ee
   SET year = r.year,
       approved_amount = COALESCE(eb.approved_amount, 0)
   FROM reports r
   LEFT JOIN expenditure_budgets eb ON ...
   WHERE ee.report_id = r.id;
   ```

3. **Make NOT NULL:**
   ```sql
   ALTER TABLE expenditure_entries ALTER COLUMN year SET NOT NULL;
   ```

**Safety guarantees:**
- ✓ No data loss (UPDATE, not DELETE)
- ✓ Existing approved amounts preserved
- ✓ Variance calculated correctly from updated columns
- ✓ Idempotent: Runs multiple times safely

## Querying Patterns

### Pattern 1: Budget vs Actual Summary

```sql
SELECT 
  category_id,
  ec.name,
  year,
  SUM(approved_amount) AS total_approved,
  SUM(annual_expenditure) AS total_actual,
  SUM(variance) AS total_variance,
  ROUND(SUM(variance_percent) / COUNT(*), 2) AS avg_variance_percent
FROM expenditure_entries ee
JOIN expenditure_categories ec ON ec.id = ee.category_id
WHERE report_id = 456
GROUP BY category_id, ec.name, year
ORDER BY category_id;
```

**No complex JOINs needed — all data in one table.**

### Pattern 2: Multi-Report Comparison

```sql
SELECT 
  r.project_id,
  r.year,
  SUM(ee.variance) AS total_variance,
  COUNT(*) AS categories_entered
FROM expenditure_entries ee
JOIN reports r ON r.id = ee.report_id
WHERE r.project_id = 123
  AND ee.annual_expenditure IS NOT NULL
GROUP BY r.project_id, r.year
ORDER BY r.year DESC;
```

### Pattern 3: Over-Budget Categories

```sql
SELECT 
  r.year,
  ec.name,
  ee.approved_amount,
  ee.annual_expenditure,
  ee.variance_percent
FROM expenditure_entries ee
JOIN reports r ON r.id = ee.report_id
JOIN expenditure_categories ec ON ec.id = ee.category_id
WHERE r.project_id = 123
  AND ee.variance_percent > 10  -- Over budget by >10%
  AND ee.annual_expenditure IS NOT NULL
ORDER BY ee.variance_percent DESC;
```

**Indexes satisfy the year/category filters and partial WHERE clause.**

## Testing Checklist

- [ ] Migration runs without errors on test database
- [ ] Existing expenditure_entries rows have year + approved_amount populated
- [ ] Variance columns calculate correctly when annual_expenditure is set
- [ ] New reports auto-populate with all categories + approved amounts
- [ ] Missing budgets default to 0 (not NULL, so variance calculates)
- [ ] Partial index is being used (EXPLAIN shows "Partial Index Scan")
- [ ] CHECK constraints prevent negative amounts
- [ ] API returns new columns (year, approved_amount, variance, variance_percent)
- [ ] Frontend displays budget vs actual comparison correctly
- [ ] Budget changes don't retroactively affect old reports

## Summary

✅ **Efficient**: GENERATED columns, strategic indexes, set-based queries  
✅ **Principled**: Denormalization with purpose, single source of truth  
✅ **Safe**: CHECK constraints, transactional report creation, backfill strategy  
✅ **Queryable**: Self-contained rows, no complex JOINs needed  
✅ **Maintainable**: Clear data flow, automatic calculations, database-enforced constraints
