"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

interface IncomingRecord {
  Year: number;
  Month: string;
  "Transaction Type": string;
  Country: string;
  Institution: string;
  Amount: number;
  Earmarked: string;
}

interface OutgoingRecord {
  Year: number | null;
  "Transaction Type": string;
  Organisation: string;
  "Project Title": string;
  Amount: number;
  Earmarked: string;
  Date: string | null;
}

const COLORS = [
  "#f1b434",
  "#3b82f6",
  "#10b981",
  "#f97316",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#84cc16",
  "#f43f5e",
  "#a855f7",
];

export default function VisualizationPage() {
  const [incoming, setIncoming] = useState<IncomingRecord[]>([]);
  const [outgoing, setOutgoing] = useState<OutgoingRecord[]>([]);
  const [yearFilter, setYearFilter] = useState<string>("all");

  useEffect(() => {
    Promise.all([
      fetch("/data/incoming.json").then((r) => r.json()),
      fetch("/data/outgoing.json").then((r) => r.json()),
    ]).then(([inc, out]) => {
      setIncoming(inc);
      setOutgoing(out);
    });
  }, []);

  const years = useMemo(() => {
    const allYears = new Set<number>();
    incoming.forEach((r) => r.Year && allYears.add(r.Year));
    outgoing.forEach((r) => r.Year && allYears.add(r.Year));
    return Array.from(allYears).sort();
  }, [incoming, outgoing]);

  const filteredIncoming = useMemo(
    () =>
      yearFilter === "all"
        ? incoming
        : incoming.filter((r) => r.Year === Number(yearFilter)),
    [incoming, yearFilter]
  );

  const filteredOutgoing = useMemo(
    () =>
      yearFilter === "all"
        ? outgoing.filter((r) => r.Year !== null)
        : outgoing.filter((r) => r.Year === Number(yearFilter)),
    [outgoing, yearFilter]
  );

  const incomingByYear = useMemo(() => {
    const grouped: Record<number, number> = {};
    filteredIncoming.forEach((r) => {
      grouped[r.Year] = (grouped[r.Year] || 0) + r.Amount;
    });
    return Object.entries(grouped)
      .map(([year, amount]) => ({ year, amount }))
      .sort((a, b) => Number(a.year) - Number(b.year));
  }, [filteredIncoming]);

  const outgoingByOrg = useMemo(() => {
    const grouped: Record<string, number> = {};
    filteredOutgoing.forEach((r) => {
      if (r["Transaction Type"] === "Disbursed") {
        grouped[r.Organisation] = (grouped[r.Organisation] || 0) + r.Amount;
      }
    });
    return Object.entries(grouped)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [filteredOutgoing]);

  const incomingByCountry = useMemo(() => {
    const grouped: Record<string, number> = {};
    filteredIncoming
      .filter((r) => r["Transaction Type"] === "Received")
      .forEach((r) => {
        grouped[r.Country] = (grouped[r.Country] || 0) + r.Amount;
      });
    return Object.entries(grouped)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [filteredIncoming]);

  const byEarmark = useMemo(() => {
    const grouped: Record<string, number> = {};
    filteredOutgoing
      .filter((r) => r["Transaction Type"] === "Disbursed")
      .forEach((r) => {
        const label = r.Earmarked || "None";
        grouped[label] = (grouped[label] || 0) + r.Amount;
      });
    return Object.entries(grouped)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [filteredOutgoing]);

  const totalIncoming = filteredIncoming
    .filter((r) => r["Transaction Type"] === "Received")
    .reduce((sum, r) => sum + r.Amount, 0);

  const totalDisbursed = filteredOutgoing
    .filter((r) => r["Transaction Type"] === "Disbursed")
    .reduce((sum, r) => sum + r.Amount, 0);

  function fmt(n: number) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(n);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-8 py-4">
        <h1 className="text-2xl font-bold font-qanelas">Visualization</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Financial overview of CRAF&apos;d fund flows
        </p>
      </div>

      <div className="flex-1 overflow-auto px-8 py-6">
        <div className="flex items-center gap-4 mb-6">
          <Select value={yearFilter} onValueChange={setYearFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Years</SelectItem>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Received</CardDescription>
              <CardTitle className="text-2xl text-green-600">
                {fmt(totalIncoming)}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Disbursed</CardDescription>
              <CardTitle className="text-2xl text-blue-600">
                {fmt(totalDisbursed)}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Organizations Funded</CardDescription>
              <CardTitle className="text-2xl">
                {outgoingByOrg.length}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Incoming Funds by Year</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={incomingByYear}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="year" />
                  <YAxis
                    tickFormatter={(v) => `$${(v / 1_000_000).toFixed(1)}M`}
                  />
                  <Tooltip
                    formatter={(value: number) => fmt(value)}
                    labelFormatter={(l) => `Year ${l}`}
                  />
                  <Bar dataKey="amount" fill="#f1b434" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Disbursements by Organization</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={outgoingByOrg}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={({ name, percent }) =>
                      `${name} (${(percent * 100).toFixed(0)}%)`
                    }
                    labelLine={false}
                  >
                    {outgoingByOrg.map((_, i) => (
                      <Cell
                        key={i}
                        fill={COLORS[i % COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => fmt(value)} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Incoming Funds by Donor Country</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={incomingByCountry} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    type="number"
                    tickFormatter={(v) => `$${(v / 1_000_000).toFixed(1)}M`}
                  />
                  <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(value: number) => fmt(value)} />
                  <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Disbursements by Earmark</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={byEarmark}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={({ name, percent }) =>
                      `${name} (${(percent * 100).toFixed(0)}%)`
                    }
                    labelLine={false}
                  >
                    {byEarmark.map((_, i) => (
                      <Cell
                        key={i}
                        fill={COLORS[i % COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => fmt(value)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
