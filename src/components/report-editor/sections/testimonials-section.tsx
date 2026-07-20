"use client";

import labels from "@/lib/labels.json";
import { SectionTableEditor, TESTIMONIAL_SPECS } from "@/components/section-table-editor";
import { type SaveState } from "@/components/autosave";

export interface TestimonialsSectionProps {
  reportId: number;
  readOnly: boolean;
  onSaveStateChange: (s: SaveState) => void;
}

export function TestimonialsSection({ reportId, readOnly, onSaveStateChange }: TestimonialsSectionProps) {
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
          spec={TESTIMONIAL_SPECS.leadership}
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
          spec={TESTIMONIAL_SPECS.partner}
          onSaveStateChange={onSaveStateChange}
          commentSection="testimonials"
        />
      </div>
    </div>
  );
}
