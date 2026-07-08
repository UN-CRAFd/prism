import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import jsPDF from "jspdf";

interface Report {
  id: number;
  project_title: string;
  project_short_name: string | null;
  partner_short_name: string;
  partner_long_name: string | null;
  year: number;
  report_type: string | null;
}

interface SurveyRow {
  question: string;
  assessment: number | null;
  context: string | null;
}

interface RiskRow {
  risk_name: string;
  likelihood: number | null;
  impact: number | null;
  approved_mitigation: string | null;
  updated_mitigation: string | null;
}

interface AchievementRow {
  achievement: string | null;
  significance: string | null;
  links: string | null;
}

interface PartnershipRow {
  partner_organization: string | null;
  result: string | null;
  links: string | null;
}

interface ResultRow {
  context: string | null;
  data_driven_decision: string | null;
  resulting_impact: string | null;
  links: string | null;
}

interface LessonRow {
  category: string | null;
  lesson_learned: string | null;
  adjustment_informed: string | null;
}

interface CoverageRow {
  type: string | null;
  description: string | null;
  reach_indicator: string | null;
  links: string | null;
}

async function fetchReportData(reportId: string) {
  const [reportRes, surveysRes, risksRes, achievementsRes, partnershipsRes, resultsRes, lessonsRes, coverageRes] = await Promise.all([
    query("SELECT r.*, p.project_title, p.short_name AS project_short_name, pt.short_name AS partner_short_name, pt.long_name AS partner_long_name FROM reporting_platform.reports r JOIN reporting_platform.projects p ON p.id = r.project_id JOIN reporting_platform.partners pt ON pt.id = p.partner_id WHERE r.id = $1", [reportId]),
    query("SELECT question, assessment, context FROM reporting_platform.surveys WHERE report_id = $1 ORDER BY id", [reportId]),
    query("SELECT risk_name, likelihood, impact, approved_mitigation, updated_mitigation FROM reporting_platform.risks WHERE report_id = $1 ORDER BY id", [reportId]),
    query("SELECT achievement, significance, links FROM reporting_platform.key_achievements WHERE report_id = $1 ORDER BY id", [reportId]),
    query("SELECT partner_organization, result, links FROM reporting_platform.partnerships WHERE report_id = $1 ORDER BY id", [reportId]),
    query("SELECT context, data_driven_decision, resulting_impact, links FROM reporting_platform.results WHERE report_id = $1 ORDER BY id", [reportId]),
    query("SELECT category, lesson_learned, adjustment_informed FROM reporting_platform.lessons_learned WHERE report_id = $1 ORDER BY id", [reportId]),
    query("SELECT type, description, reach_indicator, links FROM reporting_platform.external_coverage WHERE report_id = $1 ORDER BY id", [reportId]),
  ]);

  return {
    report: reportRes[0] as unknown as Report,
    surveys: surveysRes as unknown as SurveyRow[],
    risks: risksRes as unknown as RiskRow[],
    achievements: achievementsRes as unknown as AchievementRow[],
    partnerships: partnershipsRes as unknown as PartnershipRow[],
    results: resultsRes as unknown as ResultRow[],
    lessons: lessonsRes as unknown as LessonRow[],
    coverage: coverageRes as unknown as CoverageRow[],
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const data = await fetchReportData(id);

    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    const contentWidth = pageWidth - margin * 2;
    let yPos = margin;

    // Set default font to Roboto (will fallback to helvetica if not embedded)
    doc.setFont("helvetica");

    // Watermark logo placeholder (top-left corner)
    doc.setFontSize(10);
    doc.setTextColor(200, 200, 200);
    doc.text("CRAF'd", margin, margin + 5);
    doc.setTextColor(0, 0, 0);

    // Title section
    doc.setFontSize(24);
    doc.setFont("helvetica", "bold");
    doc.text(`${data.report.project_title}`, margin, yPos + 15);
    yPos += 25;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Report for ${data.report.year} | ${data.report.partner_short_name}`, margin, yPos);
    yPos += 10;

    const addSection = (title: string, content: string | null) => {
      if (yPos > pageHeight - 40) {
        doc.addPage();
        yPos = margin;
      }
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text(title, margin, yPos);
      yPos += 8;

      if (content) {
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        const lines = doc.splitTextToSize(content, contentWidth);
        lines.forEach((line: string) => {
          if (yPos > pageHeight - 20) {
            doc.addPage();
            yPos = margin;
          }
          doc.text(line, margin, yPos);
          yPos += 5;
        });
      }
      yPos += 3;
    };

    const addTable = (title: string, headers: string[], rows: (string | number | null)[][]) => {
      if (yPos > pageHeight - 40) {
        doc.addPage();
        yPos = margin;
      }

      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text(title, margin, yPos);
      yPos += 7;

      const colWidth = contentWidth / headers.length;
      const rowHeight = 8;

      // Headers
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      headers.forEach((header, i) => {
        doc.text(header, margin + i * colWidth + 1, yPos);
      });
      yPos += rowHeight;

      // Border under headers
      doc.setDrawColor(200, 200, 200);
      doc.line(margin, yPos - 1, pageWidth - margin, yPos - 1);

      // Rows
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      rows.forEach((row) => {
        if (yPos > pageHeight - 20) {
          doc.addPage();
          yPos = margin;
          doc.setFont("helvetica", "bold");
          headers.forEach((header, i) => {
            doc.text(header, margin + i * colWidth + 1, yPos);
          });
          yPos += rowHeight;
          doc.setDrawColor(200, 200, 200);
          doc.line(margin, yPos - 1, pageWidth - margin, yPos - 1);
          doc.setFont("helvetica", "normal");
        }
        row.forEach((cell, i) => {
          const cellText = String(cell ?? "—").substring(0, 30);
          doc.text(cellText, margin + i * colWidth + 1, yPos);
        });
        yPos += rowHeight;
      });
      yPos += 5;
    };

    // Surveys
    if (data.surveys.length > 0) {
      addTable(
        "Surveys",
        ["Question", "Assessment", "Context"],
        data.surveys.map((s) => [s.question, s.assessment ?? "—", (s.context ?? "").substring(0, 50)])
      );
    }

    // Achievements
    if (data.achievements.length > 0) {
      addTable(
        "Key Achievements",
        ["Achievement", "Significance"],
        data.achievements.map((a) => [(a.achievement ?? "").substring(0, 40), (a.significance ?? "").substring(0, 40)])
      );
    }

    // Partnerships
    if (data.partnerships.length > 0) {
      addTable(
        "Partnerships",
        ["Partner Organization", "Result"],
        data.partnerships.map((p) => [(p.partner_organization ?? "").substring(0, 30), (p.result ?? "").substring(0, 40)])
      );
    }

    // Results
    if (data.results.length > 0) {
      addTable(
        "Results",
        ["Context", "Decision", "Impact"],
        data.results.map((r) => [(r.context ?? "").substring(0, 25), (r.data_driven_decision ?? "").substring(0, 25), (r.resulting_impact ?? "").substring(0, 25)])
      );
    }

    // Lessons
    if (data.lessons.length > 0) {
      addTable(
        "Lessons Learned",
        ["Category", "Lesson", "Adjustment"],
        data.lessons.map((l) => [(l.category ?? "—").substring(0, 20), (l.lesson_learned ?? "").substring(0, 30), (l.adjustment_informed ?? "").substring(0, 30)])
      );
    }

    // External Coverage
    if (data.coverage.length > 0) {
      addTable(
        "External Coverage",
        ["Type", "Description", "Reach"],
        data.coverage.map((c) => [(c.type ?? "—").substring(0, 20), (c.description ?? "").substring(0, 35), (c.reach_indicator ?? "").substring(0, 30)])
      );
    }

    // Risk (last)
    if (data.risks.length > 0) {
      addTable(
        "Risk Management",
        ["Risk", "Likelihood", "Impact", "Mitigation"],
        data.risks.map((r) => [
          (r.risk_name ?? "").substring(0, 20),
          r.likelihood ?? "—",
          r.impact ?? "—",
          (r.approved_mitigation ?? "").substring(0, 30),
        ])
      );
    }

    const pdfBuffer = Buffer.from(doc.output("arraybuffer"));
    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${data.report.project_short_name || "report"}_${data.report.year}.pdf"`,
      },
    });
  } catch (err) {
    console.error("PDF generation error:", err);
    return NextResponse.json({ error: "Failed to generate PDF" }, { status: 500 });
  }
}
