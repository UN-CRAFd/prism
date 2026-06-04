"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback } from "react";
import {
  DEFAULT_SECTIONS,
  resolveTemplate,
  saveTemplate,
  deleteTemplate,
  hasCustomTemplate,
  renumberSections,
  type AssessmentSection,
  type AssessmentQuestion,
} from "@/lib/survey-template";
import { PARTNERS, YEARS } from "@/lib/survey-data";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Save,
  RotateCcw,
  Copy,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Info,
  CheckCircle,
} from "lucide-react";

const PARTNER_OPTIONS = [
  { id: "default", name: "All Partners (global default)" },
  ...PARTNERS.map((p) => ({ id: p.id, name: p.name })),
];

const YEAR_OPTIONS = [
  { value: null as number | null, label: "All Years" },
  ...YEARS.map((y) => ({ value: y as number | null, label: String(y) })),
];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export default function SurveyEditorPage() {
  const [partnerId, setPartnerId] = useState<string>("default");
  const [year, setYear] = useState<number | null>(null);
  const [sections, setSections] = useState<AssessmentSection[]>([]);
  const [isCustom, setIsCustom] = useState(false);
  const [sourceLabel, setSourceLabel] = useState("");
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);

  const reload = useCallback(() => {
    const custom = hasCustomTemplate(partnerId, year);
    setIsCustom(custom);
    const { sections: s, source } = resolveTemplate(
      partnerId === "default" ? "__never__" : partnerId,
      year ?? 9999
    );
    // For the editor we want to show the stored template for this slot,
    // or the global default if none exists.
    const stored = custom
      ? s
      : DEFAULT_SECTIONS.map((sec) => ({ ...sec, questions: [...sec.questions.map((q) => ({ ...q }))] }));
    setSections(JSON.parse(JSON.stringify(stored)));
    setSourceLabel(source);
    setDirty(false);
  }, [partnerId, year]);

  useEffect(() => {
    reload();
  }, [reload]);

  function mutate(next: AssessmentSection[]) {
    setSections(renumberSections(next));
    setDirty(true);
    setSaved(false);
  }

  function handleSave() {
    saveTemplate({
      partnerId,
      year,
      selfAssessmentSections: sections,
      updatedAt: new Date().toISOString(),
    });
    setIsCustom(true);
    setSaved(true);
    setDirty(false);
    setTimeout(() => setSaved(false), 3000);
  }

  function handleReset() {
    deleteTemplate(partnerId, year);
    setIsCustom(false);
    setSections(
      JSON.parse(JSON.stringify(DEFAULT_SECTIONS))
    );
    setDirty(false);
  }

  function handleClone() {
    setSections(JSON.parse(JSON.stringify(DEFAULT_SECTIONS)));
    setDirty(true);
  }

  // --- Section mutations ---
  function updateSectionTitle(sIdx: number, title: string) {
    const next = [...sections];
    next[sIdx] = { ...next[sIdx], title };
    mutate(next);
  }

  function deleteSection(sIdx: number) {
    mutate(sections.filter((_, i) => i !== sIdx));
  }

  function moveSection(sIdx: number, dir: -1 | 1) {
    const next = [...sections];
    const target = sIdx + dir;
    if (target < 0 || target >= next.length) return;
    [next[sIdx], next[target]] = [next[target], next[sIdx]];
    mutate(next);
  }

  function addSection() {
    mutate([
      ...sections,
      {
        id: uid(),
        number: `2.${sections.length + 1}`,
        title: "New section",
        questions: [],
      },
    ]);
  }

  // --- Question mutations ---
  function updateQuestion(sIdx: number, qIdx: number, text: string) {
    const next = sections.map((s, si) =>
      si !== sIdx
        ? s
        : {
            ...s,
            questions: s.questions.map((q, qi) =>
              qi !== qIdx ? q : { ...q, text }
            ),
          }
    );
    mutate(next);
  }

  function deleteQuestion(sIdx: number, qIdx: number) {
    const next = sections.map((s, si) =>
      si !== sIdx
        ? s
        : { ...s, questions: s.questions.filter((_, qi) => qi !== qIdx) }
    );
    mutate(next);
  }

  function moveQuestion(sIdx: number, qIdx: number, dir: -1 | 1) {
    const target = qIdx + dir;
    const qs = [...sections[sIdx].questions];
    if (target < 0 || target >= qs.length) return;
    [qs[qIdx], qs[target]] = [qs[target], qs[qIdx]];
    const next = sections.map((s, si) =>
      si !== sIdx ? s : { ...s, questions: qs }
    );
    mutate(next);
  }

  function addQuestion(sIdx: number) {
    const newQ: AssessmentQuestion = { id: uid(), text: "" };
    const next = sections.map((s, si) =>
      si !== sIdx ? s : { ...s, questions: [...s.questions, newQ] }
    );
    mutate(next);
  }

  const totalQuestions = sections.reduce((n, s) => n + s.questions.length, 0);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between border-b px-8 py-4">
        <div>
          <h1 className="text-2xl font-bold font-qanelas">Survey Editor</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Customize the Self-Assessment questions per partner and year
          </p>
        </div>
        <div className="flex items-center gap-3">
          {dirty && (
            <Badge variant="outline" className="border-amber-300 text-amber-600">
              Unsaved changes
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            disabled={!isCustom && !dirty}
          >
            <RotateCcw className="size-3.5" />
            Reset to default
          </Button>
          <Button
            onClick={handleSave}
            className="bg-crafd-yellow text-black hover:bg-crafd-yellow/90 font-semibold"
          >
            {saved ? (
              <><CheckCircle className="size-4" /> Saved</>
            ) : (
              <><Save className="size-4" /> Save template</>
            )}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-8 py-6">
        {/* Selectors */}
        <div className="flex items-center gap-4 mb-6">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">Partner:</span>
            <Select value={partnerId} onValueChange={setPartnerId}>
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PARTNER_OPTIONS.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">Year:</span>
            <Select
              value={String(year ?? "all")}
              onValueChange={(v) => setYear(v === "all" ? null : Number(v))}
            >
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {YEAR_OPTIONS.map((y) => (
                  <SelectItem key={String(y.value ?? "all")} value={String(y.value ?? "all")}>
                    {y.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator orientation="vertical" className="h-6" />

          {isCustom ? (
            <Badge className="bg-crafd-yellow/20 text-crafd-yellow border-crafd-yellow/30">
              Custom template active
            </Badge>
          ) : (
            <div className="flex items-center gap-2">
              <Badge variant="secondary">Using built-in default</Badge>
              <Button variant="outline" size="sm" onClick={handleClone}>
                <Copy className="size-3.5" />
                Clone &amp; customize
              </Button>
            </div>
          )}

          <span className="text-xs text-muted-foreground ml-auto">
            {sections.length} sections · {totalQuestions} questions
          </span>
        </div>

        {/* Info banner */}
        <div className="flex items-start gap-2 rounded-lg bg-muted/50 border px-4 py-3 mb-6 text-sm text-muted-foreground">
          <Info className="size-4 mt-0.5 shrink-0" />
          <p>
            Templates resolve from most to least specific:{" "}
            <span className="font-medium text-foreground">Partner + Year</span> →{" "}
            <span className="font-medium text-foreground">Partner + All Years</span> →{" "}
            <span className="font-medium text-foreground">Global + Year</span> →{" "}
            <span className="font-medium text-foreground">Global default</span> →{" "}
            Built-in. Changes only apply to the slot you save them to.
          </p>
        </div>

        {/* Section editor */}
        <div className="space-y-4">
          {sections.map((section, sIdx) => (
            <Card key={section.id}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-muted-foreground w-8 shrink-0">
                    {section.number}
                  </span>
                  <Input
                    value={section.title}
                    onChange={(e) => updateSectionTitle(sIdx, e.target.value)}
                    className="font-semibold text-base h-9 max-w-sm"
                  />
                  <div className="flex items-center gap-1 ml-auto">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      onClick={() => moveSection(sIdx, -1)}
                      disabled={sIdx === 0}
                    >
                      <ChevronUp className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      onClick={() => moveSection(sIdx, 1)}
                      disabled={sIdx === sections.length - 1}
                    >
                      <ChevronDown className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-destructive hover:text-destructive"
                      onClick={() => deleteSection(sIdx)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {section.questions.length === 0 && (
                  <p className="text-sm text-muted-foreground italic py-2">
                    No questions yet. Add one below.
                  </p>
                )}
                {section.questions.map((q, qIdx) => (
                  <div
                    key={q.id}
                    className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3"
                  >
                    <span className="text-xs font-mono text-muted-foreground pt-2 w-5 shrink-0">
                      {qIdx + 1}.
                    </span>
                    <Textarea
                      value={q.text}
                      rows={2}
                      className="flex-1 text-sm bg-transparent border-none p-0 resize-none focus-visible:ring-0 focus-visible:border-0"
                      placeholder="Enter question text…"
                      onChange={(e) => updateQuestion(sIdx, qIdx, e.target.value)}
                    />
                    <div className="flex flex-col gap-0.5 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6"
                        onClick={() => moveQuestion(sIdx, qIdx, -1)}
                        disabled={qIdx === 0}
                      >
                        <ChevronUp className="size-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6"
                        onClick={() => moveQuestion(sIdx, qIdx, 1)}
                        disabled={qIdx === section.questions.length - 1}
                      >
                        <ChevronDown className="size-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6 text-destructive hover:text-destructive"
                        onClick={() => deleteQuestion(sIdx, qIdx)}
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-1 w-full border-dashed"
                  onClick={() => addQuestion(sIdx)}
                >
                  <Plus className="size-3.5" />
                  Add question
                </Button>
              </CardContent>
            </Card>
          ))}

          <Button
            variant="outline"
            className="w-full border-dashed"
            onClick={addSection}
          >
            <Plus className="size-4" />
            Add section
          </Button>
        </div>
      </div>
    </div>
  );
}
