import { query } from "@/lib/db";

// Keep existing annual reports AND project updates in sync when a
// project-document indicator is added after they were created. The unique
// constraint makes this safe to call repeatedly while loading a document.
//
// Updates are included because an update that carries the Indicators page must
// show exactly what an annual report would — without this it would be stuck with
// whatever the prodoc held on the day it was created.
//
export interface ReportIndicatorLine {
  /** indicator_data.id */
  id: number;
  indicator_id: number;
  name: string;
  description: string | null;
  category: string | null;
  baseline_value: string | null;
  target_value: string | null;
  achieved_value: string | null;
  status: string | null;
  comment: string | null;
}

/**
 * A report's indicator lines, as its Indicators page shows them: synced from the
 * project document first, and limited to indicators the project document holds.
 */
export async function reportIndicatorLines(reportId: number, projectId: number): Promise<ReportIndicatorLine[]> {
  await syncAnnualIndicators(projectId);
  return query<ReportIndicatorLine & Record<string, unknown>>(
    `SELECT d.id, d.indicator_id, i.name, i.description, i.category,
            d.baseline_value, d.target_value, d.achieved_value, d.status, d.comment
       FROM reporting_platform.indicator_data d
       JOIN reporting_platform.indicators i ON i.id = d.indicator_id
      WHERE d.report_id = $1
        AND d.indicator_id IN (
          SELECT pd.indicator_id
            FROM reporting_platform.indicator_data pd
            JOIN reporting_platform.reports prodoc ON prodoc.id = pd.report_id
           WHERE prodoc.project_id = $2 AND prodoc.data_type = 'prodoc'
        )
      ORDER BY d.sort_order, d.id`,
    [reportId, projectId]
  );
}

// Used by /api/indicator-data (report editors) and /api/report-import.
export async function syncAnnualIndicators(projectId: number) {
  await query(
    `INSERT INTO reporting_platform.indicator_data
       (report_id, indicator_id, baseline_value, baseline_year, target_value, target_year, linked_activity_id, linked_results, sort_order)
     SELECT annual.id, pd.indicator_id, pd.baseline_value, pd.baseline_year,
            pd.target_value, pd.target_year, pd.linked_activity_id, pd.linked_results, pd.sort_order
       FROM reporting_platform.reports annual
       JOIN reporting_platform.reports prodoc
         ON prodoc.project_id = annual.project_id AND prodoc.data_type = 'prodoc'
       JOIN reporting_platform.indicator_data pd ON pd.report_id = prodoc.id
      WHERE annual.project_id = $1
        AND annual.data_type IN ('report', 'update')
     ON CONFLICT (report_id, indicator_id) DO NOTHING`,
    [projectId]
  );
}
