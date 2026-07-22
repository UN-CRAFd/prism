# Project Date Calculation Standard

## Single Source of Truth

All project start date + duration calculations use **PostgreSQL helper functions** defined in `db/schema.sql`:

### 1. `project_year_range(start_date, duration_months) → INT[]`

Returns all distinct years covered by the project.

**Used by:**
- `GET /api/expenditure-budgets?projectId=` — lists years for budget entry
- Any feature needing all project years

**Example:**
```sql
SELECT reporting_platform.project_year_range(
  p.project_start_date, 
  p.project_duration_months
) AS years
FROM reporting_platform.projects p
WHERE p.id = 123;
-- Returns: [2026] (if project is 1/1/2026 + 12 months)
```

### 2. `project_end_date(start_date, duration_months) → DATE`

Returns the project end date: `start_date + (duration_months * INTERVAL '1 month')`.

**Used by:**
- `GET /api/workplan?reportId=` — derive quarter range from end date
- `GET /api/workplan-activities?projectId=` — derive activity quarter range
- Any feature needing project end date

**Example:**
```sql
SELECT reporting_platform.project_end_date(
  p.project_start_date,
  p.project_duration_months
) AS end_date
FROM reporting_platform.projects p
WHERE p.id = 123;
-- Returns: 2027-01-01 (if project is 1/1/2026 + 12 months)
```

---

## Implementation Checklist

When adding a feature that needs project years or dates:

- [ ] **Always use the helper functions** — never recalculate in SQL inline
- [ ] **If adding new date logic:** Create a helper function in `db/schema.sql`
- [ ] **If modifying calculation logic:** Update it in ONE place (the function)
- [ ] **Never duplicate logic** in JavaScript/TypeScript — fetch from database

---

## Current Usage Map

| File | Function | Purpose |
|------|----------|---------|
| `src/app/api/expenditure-budgets/route.ts` | `project_year_range()` | Budget entry year list |
| `src/app/api/workplan/route.ts` | `project_end_date()` | Workplan quarter range |
| `src/app/api/workplan-activities/route.ts` | `project_end_date()` | Activity baseline quarter range |

---

## What NOT to Do

❌ **Don't:** Hardcode date math in SQL queries
```sql
-- BAD
SELECT ... WHERE project_start_date + (project_duration_months * INTERVAL '1 month') < NOW()
```

✅ **Do:** Use the helper function
```sql
-- GOOD
SELECT ... WHERE reporting_platform.project_end_date(project_start_date, project_duration_months) < NOW()
```

---

## Why This Matters

1. **Consistency** — All features calculate dates the same way
2. **Maintainability** — Change logic once, everywhere updates automatically
3. **Correctness** — NULL-safe handling, boundary cases in one place
4. **Audit Trail** — Easy to find all uses of a calculation

If calculation logic changes (e.g., rounding behavior, handling of NULL duration), update the function definition and all callers are instantly consistent.
