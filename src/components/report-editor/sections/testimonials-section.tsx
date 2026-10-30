"use client";

import { Notice } from "@/components/ui/notice";
import { useMemo } from "react";
import labels from "@/lib/labels";
import { SectionTableEditor, buildTestimonialSpecs } from "@/components/section-table-editor";
import { type SaveState } from "@/components/autosave";

export interface TestimonialsSectionProps {
  reportId: number;
  readOnly: boolean;
  onSaveStateChange: (s: SaveState) => void;
  pushCommand: (cmd: { undo: () => void; redo: () => void }) => void;
}

export function TestimonialsSection({ reportId, readOnly, onSaveStateChange, pushCommand }: TestimonialsSectionProps) {
  const specs = useMemo(() => buildTestimonialSpecs(), []);
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h3 className="t-heading-sub">{labels.testimonials.leadershipHeading}</h3>
        {!readOnly && (
          <Notice variant="info">
            {labels.testimonials.leadershipInstruction}
          </Notice>
        )}
        <SectionTableEditor
          key="testimonials-leadership"
          reportId={reportId}
          spec={specs.leadership}
          onSaveStateChange={onSaveStateChange}
          commentSection="testimonials"
          pushCommand={pushCommand}
        />
      </div>
      <div className="space-y-3">
        <h3 className="t-heading-sub">{labels.testimonials.partnerHeading}</h3>
        {!readOnly && (
          <Notice variant="info">
            {labels.testimonials.partnerInstruction}
          </Notice>
        )}
        <SectionTableEditor
          key="testimonials-partner"
          reportId={reportId}
          spec={specs.partner}
          onSaveStateChange={onSaveStateChange}
          commentSection="testimonials"
          pushCommand={pushCommand}
        />
      </div>
    </div>
  );
}
