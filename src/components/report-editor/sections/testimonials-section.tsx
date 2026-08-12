"use client";

import { useMemo } from "react";
import labels from "@/lib/labels";
import { SectionTableEditor, buildTestimonialSpecs } from "@/components/section-table-editor";
import { type SaveState } from "@/components/autosave";

export interface TestimonialsSectionProps {
  reportId: number;
  readOnly: boolean;
  onSaveStateChange: (s: SaveState) => void;
}

export function TestimonialsSection({ reportId, readOnly, onSaveStateChange }: TestimonialsSectionProps) {
  const specs = useMemo(() => buildTestimonialSpecs(), []);
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">{labels.testimonials.leadershipHeading}</h3>
        {!readOnly && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            {labels.testimonials.leadershipInstruction}
          </div>
        )}
        <SectionTableEditor
          key="testimonials-leadership"
          reportId={reportId}
          spec={specs.leadership}
          onSaveStateChange={onSaveStateChange}
          commentSection="testimonials"
        />
      </div>
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">{labels.testimonials.partnerHeading}</h3>
        {!readOnly && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            {labels.testimonials.partnerInstruction}
          </div>
        )}
        <SectionTableEditor
          key="testimonials-partner"
          reportId={reportId}
          spec={specs.partner}
          onSaveStateChange={onSaveStateChange}
          commentSection="testimonials"
        />
      </div>
    </div>
  );
}
