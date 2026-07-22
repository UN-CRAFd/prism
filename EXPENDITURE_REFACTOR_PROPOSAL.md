# Expenditure Data Structure Refactor

## Current State Analysis

### Existing Tables

**expenditure_budgets** (Project-level, all years)
```sql
id | project_id | category_id | year | approved_amount | created_at | updated_at
-- Unique constraint: (project_id, category_id, year)
-- Use: Stores approved budgets for project's full lifetime
```

**expenditure_entries** (Report-level, per-report actuals)
```sql
id | report_id | category_id | annual_expenditure | comment | created_at | updated_at
-- Unique constraint: (report_id, category_id)
-- Use: Stores actual expenditure for a specific report year
-- Issue: No link to approved budget; cannot compare
```

### Current Workflow (Broken)

1. ❌ Admin enters approved budgets in project document (prodoc)
   - Data stored in `expenditure_budgets` (project-level, year-aware)
2. ❌ Report is created for a specific year
   - Report has no reference to approved budget
   - `expenditure_entries` only has `report_id` and `category_id` (no year context)
3. ❌ Partner fills in actual expenditure in report
   - No way to compare against approved budget
   - Can't calculate variance or budget utilization

### Root Cause

**`expenditure_entries` is missing the year context.**

Currently:
- `expenditure_entries.report_id` identifies the report (which has a year)
- But no direct reference to `expenditure_budgets`
- `expenditure_entries` has no `year` column

This creates two problems:
1. Can't directly JOIN to `expenditure_budgets` without going through reports → projects
2. No explicit year column for clarity

---

## Proposed Solution

### Schema Changes

#### Option A: Add Year Column to expenditure_entries (RECOMMENDED)

**Minimal change, explicit year context:**

```sql
ALTER TABLE expenditure_entries ADD COLUMN year SMALLINT;

-- Populate with report year
UPDATE expenditure_entries ee
SET year = r.year
FROM reports r
WHERE r.id = ee.report_id;

-- Make NOT NULL and add CHECK
ALTER TABLE expenditure_entries ALTER COLUMN year SET NOT NULL;
ALTER TABLE expenditure_entries ADD CONSTRAINT expenditure_entries_year_check
    CHECK (year BETWEEN 2020 AND 2050);

-- Update UNIQUE constraint to include year for clarity
ALTER TABLE expenditure_entries DROP CONSTRAINT expenditure_entries_report_id_category_id_key;
ALTER TABLE expenditure_entries ADD CONSTRAINT expenditure_entries_report_category_unique
    UNIQUE (report_id, category_id);  -- Still unique per report (implicit year via report)
```

#### Option B: Add Explicit FK to expenditure_budgets (EXPLICIT REFERENCE)

**More explicit linking:**

```sql
ALTER TABLE expenditure_entries ADD COLUMN budget_id INTEGER;

-- Populate with matching approved budget
UPDATE expenditure_entries ee
SET budget_id = (
    SELECT eb.id
    FROM expenditure_budgets eb
    JOIN reports r ON r.id = ee.report_id
    WHERE eb.project_id = r.project_id
      AND eb.category_id = ee.category_id
      AND eb.year = r.year
);

-- Add FK constraint
ALTER TABLE expenditure_entries ADD CONSTRAINT expenditure_entries_budget_id_fkey
    FOREIGN KEY (budget_id) REFERENCES expenditure_budgets(id) ON DELETE RESTRICT;

-- Index for queries
CREATE INDEX expenditure_entries_budget_id_idx ON expenditure_entries(budget_id);
```

---

## Recommended: Option A + Embedded B (Hybrid)

**Best approach combines clarity with FK integrity:**

```sql
-- Add year column for clarity and filtering
ALTER TABLE expenditure_entries ADD COLUMN year SMALLINT NOT NULL CHECK (year BETWEEN 2020 AND 2050);

-- Optionally add FK to approved budget for explicit linkage
ALTER TABLE expenditure_entries ADD COLUMN approved_amount NUMERIC(15,2);

-- Populate both on report creation
INSERT INTO expenditure_entries (report_id, category_id, year, approved_amount)
SELECT 
    r.id,
    ec.id,
    r.year,
    COALESCE(eb.approved_amount, 0)
FROM reports r,
     expenditure_categories ec
LEFT JOIN expenditure_budgets eb 
    ON eb.project_id = r.project_id 
    AND eb.category_id = ec.id 
    AND eb.year = r.year
WHERE r.data_type = 'report';
```

---

## Final Recommended Schema

### Updated expenditure_entries table

```sql
CREATE TABLE IF NOT EXISTS expenditure_entries (
    id                    SERIAL         PRIMARY KEY,
    report_id             INTEGER        NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    category_id           INTEGER        NOT NULL REFERENCES expenditure_categories(id) ON DELETE CASCADE,
    year                  SMALLINT       NOT NULL CHECK (year BETWEEN 2020 AND 2050),
    approved_amount       NUMERIC(15,2),  -- Denormalized snapshot of approved budget at report time
    annual_expenditure    NUMERIC(15,2),  -- Actual spend
    variance              NUMERIC(15,2),  -- Computed: annual_expenditure - approved_amount
    variance_percent      NUMERIC(5,2),   -- Computed: (variance / approved_amount) * 100
    comment               TEXT,
    created_at            TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    UNIQUE (report_id, category_id),     -- One entry per report per category
    CHECK (annual_expenditure IS NULL OR variance IS NULL OR annual_expenditure >= 0),
    CHECK (annual_expenditure IS NULL OR approved_amount IS NULL OR variance = annual_expenditure - approved_amount)
);

CREATE INDEX IF NOT EXISTS expenditure_entries_report_idx ON expenditure_entries(report_id);
CREATE INDEX IF NOT EXISTS expenditure_entries_category_idx ON expenditure_entries(category_id);
CREATE INDEX IF NOT EXISTS expenditure_entries_year_idx ON expenditure_entries(year);
```

---

## Data Flow After Changes

### 1. Project Document (Prodoc) Editing

**Admin edits approved budgets:**
```
GET /api/expenditure-budgets?project_id=123
  → Returns all approved budgets for all years of project 123

PUT /api/expenditure-budgets/456
  → Updates approved_amount for category X in year Y
  → Stored in expenditure_budgets table
```

### 2. Report Creation (Automatic)

**When a report is created for a project in year Y:**
```sql
INSERT INTO expenditure_entries (report_id, category_id, year, approved_amount)
SELECT 
    r.id,                      -- New report ID
    ec.id,                      -- Each category
    r.year,                     -- Report year
    COALESCE(eb.approved_amount, 0)  -- From approved budget
FROM reports r
CROSS JOIN expenditure_categories ec
LEFT JOIN expenditure_budgets eb 
    ON eb.project_id = r.project_id 
    AND eb.category_id = ec.id 
    AND eb.year = r.year
WHERE r.id = $1;  -- The newly created report
```

**Result:** Report pre-populated with all approved amounts for comparison

### 3. Report Editing

**Partner fills in actual expenditure:**
```
PUT /api/expenditure-entries/789
  → Update annual_expenditure = 15000
  → Trigger updates variance = annual_expenditure - approved_amount
  → Trigger updates variance_percent = (variance / approved_amount) * 100
```

### 4. Report View / Export

**Display shows comparison:**
```
Category              | Approved | Actual   | Variance  | % Variance
Staff                 | 50,000   | 48,000   | -2,000    | -4.0%
Equipment             | 20,000   | 22,500   | +2,500    | +12.5%
Travel                | 15,000   | 15,000   | —         | —
```

---

## API Changes Required

### GET /api/expenditure-entries?report_id=123

**Before:**
```json
[
  { "id": 1, "report_id": 123, "category_id": 1, "annual_expenditure": 48000, "comment": "..." }
]
```

**After:**
```json
[
  {
    "id": 1,
    "report_id": 123,
    "category_id": 1,
    "year": 2025,
    "approved_amount": 50000,
    "annual_expenditure": 48000,
    "variance": -2000,
    "variance_percent": -4.0,
    "comment": "..."
  }
]
```

### POST /api/reports (on report creation)

**Current behavior:**
- Creates report row only

**New behavior:**
- Creates report row
- Auto-populates `expenditure_entries` with all categories + approved amounts
- Admin can edit/delete individual rows if needed

---

## Database Migration Path

### Phase 1: Add Columns (Non-breaking)

```sql
ALTER TABLE expenditure_entries 
  ADD COLUMN year SMALLINT CHECK (year BETWEEN 2020 AND 2050);

ALTER TABLE expenditure_entries 
  ADD COLUMN approved_amount NUMERIC(15,2);

ALTER TABLE expenditure_entries 
  ADD COLUMN variance NUMERIC(15,2) GENERATED ALWAYS AS (annual_expenditure - approved_amount) STORED;

ALTER TABLE expenditure_entries 
  ADD COLUMN variance_percent NUMERIC(5,2) GENERATED ALWAYS AS 
    CASE 
      WHEN approved_amount IS NOT NULL AND approved_amount > 0 
        THEN (annual_expenditure - approved_amount) * 100 / approved_amount 
      ELSE NULL 
    END STORED;
```

### Phase 2: Backfill Existing Data

```sql
UPDATE expenditure_entries ee
SET year = r.year,
    approved_amount = COALESCE(eb.approved_amount, 0)
FROM reports r
LEFT JOIN expenditure_budgets eb 
  ON eb.project_id = r.project_id 
  AND eb.category_id = ee.category_id 
  AND eb.year = r.year
WHERE ee.report_id = r.id;
```

### Phase 3: Add Constraints

```sql
ALTER TABLE expenditure_entries ALTER COLUMN year SET NOT NULL;
CREATE INDEX expenditure_entries_year_idx ON expenditure_entries(year);
```

### Phase 4: Update Application Code

- Update API routes to populate `approved_amount` on report creation
- Update queries to return variance calculations
- Update frontend to display comparison

---

## Benefits of This Approach

✅ **Denormalization with Purpose**: Approved amount stored in report for historical accuracy  
✅ **Year Context**: Explicit year column enables clear filtering and reporting  
✅ **Budget Comparison**: Variance calculated automatically via GENERATED columns  
✅ **Backward Compatible**: Columns added as optional, existing records can be null  
✅ **Referential Integrity**: Can still validate against expenditure_budgets via FK if needed  
✅ **Query Performance**: No need for complex JOINs through reports → projects → budgets  
✅ **Time-Travel Safety**: Report stores the approved amount as it existed when report was created  

---

## Summary of Changes

| What | Change | Why |
|------|--------|-----|
| `expenditure_entries` | Add `year` column | Explicit year context for clarity |
| `expenditure_entries` | Add `approved_amount` column | Store budget for comparison & historical accuracy |
| `expenditure_entries` | Add `variance` (GENERATED) | Automatic variance calculation |
| `expenditure_entries` | Add `variance_percent` (GENERATED) | Automatic % variance calculation |
| Report creation API | Auto-populate `expenditure_entries` | Pre-fill all categories with approved amounts |
| Expenditure queries | Return new columns | Enable budget vs actual comparison in UI |

---

## Alternate Consideration: Keep Separate (Not Recommended)

**If you wanted to keep budgets completely separate:**
- Pros: Maximum normalization, strict separation of concerns
- Cons: Frontend must JOIN report → project → budget on every query; complex logic; no historical accuracy if budgets change

This approach is **not recommended** because:
1. Budgets often change mid-project
2. You need to compare against the budget that existed when the report was created
3. Storing an immutable snapshot in the report is the right pattern
