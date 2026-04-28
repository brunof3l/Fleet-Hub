"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import Link from "next/link";
import { Download, RefreshCw, Upload } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CombustivelNav } from "@/components/combustivel-nav";
import { Input } from "@/components/ui/input";
import { ModuleNav } from "@/components/module-nav";
import { Select } from "@/components/ui/select";
import { Table, TableScroll } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { DashboardFilters, DashboardSummary, UploadResult } from "@/types/fuel";

const initialFilters: DashboardFilters = {
  startDate: "",
  endDate: "",
  vehicle: "todos",
  fuelType: "todos",
  search: "",
};

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const numberFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 2,
});

function formatCurrency(value: number): string {
  return currencyFormatter.format(value || 0);
}

function formatNumber(value: number): string {
  return numberFormatter.format(value || 0);
}

function formatDateLabel(value: string): string {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("pt-BR").format(new Date(`${value}T00:00:00`));
}

function formatMonthLabel(value: string): string {
  if (!value?.includes("-")) {
    return value || "-";
  }

  const [year, month] = value.split("-");
  if (!year || !month) {
    return value;
  }

  const date = new Date(`${year}-${month}-01T00:00:00`);
  return new Intl.DateTimeFormat("pt-BR", { month: "short", year: "numeric" }).format(date);
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] text-sm text-slate-500">
      {label}
    </div>
  );
}

function KpiCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string;
  subtitle: string;
}) {
  return (
    <Card className="bg-white/5">
      <CardContent className="p-5">
        <p className="text-sm text-slate-400">{title}</p>
        <p className="mt-3 text-2xl font-semibold text-white">{value}</p>
        <p className="mt-2 text-sm text-slate-500">{subtitle}</p>
      </CardContent>
    </Card>
  );
}

export default function DashboardClient() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [filters, setFilters] = useState<DashboardFilters>(initialFilters);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [status, setStatus] = useState("Carregando dashboard...");
  const [lastUpload, setLastUpload] = useState<UploadResult | null>(null);

  const queryString = useMemo(() => {
    const searchParams = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) {
        searchParams.set(key, value);
      }
    });
    return searchParams.toString();
  }, [filters]);

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);

    try {
      const response = await fetch(`/api/dashboard?${queryString}`, { cache: "no-store" });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.message ?? "Falha ao carregar dados do dashboard.");
      }

      setSummary(payload as DashboardSummary);
      setStatus(payload.message ?? "Dashboard atualizado com sucesso.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao carregar dashboard.");
      setSummary(null);
    } finally {
      setIsLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadDashboard();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadDashboard]);

  async function handleUpload(file: File) {
    setIsUploading(true);
    setStatus(`Enviando ${file.name} para validacao e persistencia...`);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.message ?? "Falha ao importar planilha.");
      }

      setLastUpload(payload as UploadResult);
      setStatus(payload.message ?? "Importacao concluida.");
      await loadDashboard();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao enviar planilha.");
    } finally {
      setIsUploading(false);
    }
  }

  function onSelectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      void handleUpload(file);
    }
  }

  function onDropFile(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      void handleUpload(file);
    }
  }

  const records = useMemo(() => summary?.records ?? [], [summary?.records]);

  const applyQuickRange = useCallback((days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);

    const toIsoDate = (value: Date) => value.toISOString().slice(0, 10);
    setFilters((current) => ({
      ...current,
      startDate: toIsoDate(start),
      endDate: toIsoDate(end),
    }));
  }, []);

  const downloadCurrentCsv = useCallback(() => {
    if (!records.length) {
      setStatus("Sem dados para exportar.");
      return;
    }

    const rows = [
      ["Data", "Veiculo", "Placa", "Fornecedor", "Combustivel", "Quantidade (L)", "Preco/L", "Custo total"],
      ...records.map((record) => [
        formatDateLabel(record.date),
        record.vehicle,
        record.licensePlate || "",
        record.supplier,
        record.fuelType,
        String(record.quantity),
        String(record.pricePerLiter),
        String(record.totalCost),
      ]),
    ];

    const csv = rows
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(";"))
      .join("\n");

    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `abastecimentos-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [records]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(34,197,94,0.18),_transparent_20%),linear-gradient(180deg,#020617_0%,#0f172a_45%,#020617_100%)]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <ModuleNav />
        <CombustivelNav />

        <header className="rounded-3xl border border-white/10 bg-slate-950/70 p-6 shadow-2xl shadow-black/25 backdrop-blur-sm">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <Badge>Combustivel</Badge>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Painel de abastecimento
              </h1>
              <p className="mt-3 text-sm text-slate-400 sm:text-base">
                Importe, filtre e acompanhe os indicadores da frota.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button asChild variant="secondary">
                <Link href="/combustivel/auditoria">Auditar faturas</Link>
              </Button>
              <Button variant="secondary" onClick={() => void loadDashboard()} disabled={isLoading}>
                <RefreshCw className={cn("mr-2 size-4", isLoading && "animate-spin")} />
                Atualizar
              </Button>
              <Button onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                <Upload className="mr-2 size-4" />
                Enviar planilha
              </Button>
            </div>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
          <label
            onDragEnter={() => setIsDragging(true)}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDropFile}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed px-6 py-12 text-center transition",
              isDragging
                ? "border-emerald-400 bg-emerald-400/10"
                : "border-white/15 bg-slate-950/60 hover:border-white/25 hover:bg-slate-950/80",
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={onSelectFile}
              className="hidden"
            />
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.24em] text-slate-400">
              Upload
            </div>
            <h2 className="mt-5 text-xl font-semibold text-white">Arraste a planilha ou clique para selecionar</h2>
            <p className="mt-3 text-sm text-slate-400">Formatos aceitos: `.xlsx` e `.xls`.</p>
            <p className="mt-4 text-sm text-emerald-300">
              {isUploading ? "Persistindo dados..." : status}
            </p>
          </label>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle>Resumo Rapido</CardTitle>
                  <CardDescription>Status da base e da sessao atual.</CardDescription>
                </div>
                <Badge variant={summary?.source === "neon" ? "default" : "muted"}>
                  Fonte: {summary?.source ?? "carregando"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Registros no filtro</p>
                <p className="mt-1 text-xl font-semibold text-white">{records.length}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Ultima importacao</p>
                <p className="mt-1 text-sm text-slate-300">
                  {lastUpload
                    ? `${lastUpload.insertedCount} salvos • formato ${lastUpload.detectedFormat}`
                    : "Nenhuma importacao nesta sessao"}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Acao rapida</p>
                <Button className="mt-3 w-full" variant="outline" onClick={downloadCurrentCsv}>
                  <Download className="mr-2 size-4" />
                  Exportar CSV filtrado
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            title="Gasto Total"
            value={formatCurrency(summary?.kpis.totalCost ?? 0)}
            subtitle="Soma dos abastecimentos filtrados"
          />
          <KpiCard
            title="Volume Total"
            value={`${formatNumber(summary?.kpis.totalLiters ?? 0)} L`}
            subtitle="Total abastecido na frota"
          />
          <KpiCard
            title="Media de Consumo da Frota"
            value={formatNumber(summary?.kpis.fleetAverageAutonomy ?? 0)}
            subtitle="Media geral de km/l ou l/h"
          />
          <KpiCard
            title="Preco Medio do Litro"
            value={formatCurrency(summary?.kpis.averagePrice ?? 0)}
            subtitle="Valor medio do litro no periodo"
          />
        </section>

        <Card>
          <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <CardTitle>Filtros</CardTitle>
              <CardDescription>Periodo, veiculo, combustivel e busca.</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => applyQuickRange(30)}>
                30 dias
              </Button>
              <Button variant="secondary" size="sm" onClick={() => applyQuickRange(90)}>
                90 dias
              </Button>
              <Button variant="secondary" size="sm" onClick={() => applyQuickRange(365)}>
                12 meses
              </Button>
              <Button variant="outline" size="sm" onClick={() => setFilters(initialFilters)}>
                Limpar
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <Input
                type="date"
                value={filters.startDate}
                onChange={(event) => setFilters((current) => ({ ...current, startDate: event.target.value }))}
              />
              <Input
                type="date"
                value={filters.endDate}
                onChange={(event) => setFilters((current) => ({ ...current, endDate: event.target.value }))}
              />
              <Select
                value={filters.vehicle}
                onChange={(event) => setFilters((current) => ({ ...current, vehicle: event.target.value }))}
              >
                <option value="todos">Todos os veiculos</option>
                {(summary?.vehicleOptions ?? []).map((vehicle) => (
                  <option key={vehicle} value={vehicle}>
                    {vehicle}
                  </option>
                ))}
              </Select>
              <Select
                value={filters.fuelType}
                onChange={(event) => setFilters((current) => ({ ...current, fuelType: event.target.value }))}
              >
                <option value="todos">Todos os combustiveis</option>
                {(summary?.fuelOptions ?? []).map((fuelType) => (
                  <option key={fuelType} value={fuelType}>
                    {fuelType}
                  </option>
                ))}
              </Select>
              <Input
                type="search"
                placeholder="Buscar por veiculo, placa, fornecedor..."
                value={filters.search}
                onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
              />
            </div>
          </CardContent>
        </Card>

        <section className="grid gap-5 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Gasto Total por Mes</CardTitle>
              <CardDescription>Evolucao mensal em reais.</CardDescription>
            </CardHeader>
            <CardContent className="h-80">
              {summary?.monthlyCost.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={summary.monthlyCost}>
                    <CartesianGrid stroke="rgba(148,163,184,0.15)" vertical={false} />
                    <XAxis
                      dataKey="date"
                      stroke="#94a3b8"
                      tickFormatter={formatMonthLabel}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} />
                    <Tooltip
                      cursor={{ fill: "rgba(148,163,184,0.06)" }}
                      contentStyle={{
                        backgroundColor: "#020617",
                        borderColor: "rgba(255,255,255,0.12)",
                        borderRadius: 16,
                      }}
                      labelFormatter={(label) => formatMonthLabel(String(label))}
                      formatter={(value) => [formatCurrency(Number(value) || 0), "Gasto total"]}
                    />
                    <Bar dataKey="value" radius={[10, 10, 0, 0]} fill="#22c55e" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart label={isLoading ? "Carregando..." : "Sem dados para o grafico."} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Consumo por Mes</CardTitle>
              <CardDescription>Volume mensal em litros.</CardDescription>
            </CardHeader>
            <CardContent className="h-80">
              {summary?.monthlyLiters.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={summary.monthlyLiters}>
                    <CartesianGrid stroke="rgba(148,163,184,0.15)" vertical={false} />
                    <XAxis
                      dataKey="date"
                      stroke="#94a3b8"
                      tickFormatter={formatMonthLabel}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} />
                    <Tooltip
                      cursor={{ fill: "rgba(148,163,184,0.06)" }}
                      contentStyle={{
                        backgroundColor: "#020617",
                        borderColor: "rgba(255,255,255,0.12)",
                        borderRadius: 16,
                      }}
                      labelFormatter={(label) => formatMonthLabel(String(label))}
                      formatter={(value) => [`${formatNumber(Number(value) || 0)} L`, "Consumo total"]}
                    />
                    <Bar dataKey="value" radius={[10, 10, 0, 0]} fill="#38bdf8" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart label={isLoading ? "Carregando..." : "Sem dados para o grafico."} />
              )}
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-5 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Gasto por Veiculo</CardTitle>
              <CardDescription>Ranking em reais.</CardDescription>
            </CardHeader>
            <CardContent className="h-80">
              {summary?.costByVehicle.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={summary.costByVehicle}>
                    <CartesianGrid stroke="rgba(148,163,184,0.15)" vertical={false} />
                    <XAxis dataKey="label" hide />
                    <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} />
                    <Tooltip
                      cursor={{ fill: "rgba(148,163,184,0.06)" }}
                      contentStyle={{
                        backgroundColor: "#020617",
                        borderColor: "rgba(255,255,255,0.12)",
                        borderRadius: 16,
                      }}
                      formatter={(value) => [formatCurrency(Number(value) || 0), "Gasto"]}
                    />
                    <Bar dataKey="value" radius={[10, 10, 0, 0]} fill="#22c55e" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart label={isLoading ? "Carregando..." : "Sem dados para o grafico."} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Consumo por Veiculo</CardTitle>
              <CardDescription>Ranking em litros.</CardDescription>
            </CardHeader>
            <CardContent className="h-80">
              {summary?.litersByVehicle.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={summary.litersByVehicle}>
                    <CartesianGrid stroke="rgba(148,163,184,0.15)" vertical={false} />
                    <XAxis dataKey="label" hide />
                    <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} />
                    <Tooltip
                      cursor={{ fill: "rgba(148,163,184,0.06)" }}
                      contentStyle={{
                        backgroundColor: "#020617",
                        borderColor: "rgba(255,255,255,0.12)",
                        borderRadius: 16,
                      }}
                      formatter={(value) => [`${formatNumber(Number(value) || 0)} L`, "Litros"]}
                    />
                    <Bar dataKey="value" radius={[10, 10, 0, 0]} fill="#f59e0b" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart label={isLoading ? "Carregando..." : "Sem dados para o grafico."} />
              )}
            </CardContent>
          </Card>
        </section>

        <Card>
          <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <CardTitle>Registros Importados</CardTitle>
              <CardDescription>Dados detalhados do filtro aplicado.</CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-500">{records.length} registros exibidos</span>
            </div>
          </CardHeader>
          <CardContent>
            {summary?.message ? (
              <div className="mb-4 rounded-2xl border border-sky-400/20 bg-sky-400/10 px-4 py-3 text-sm text-sky-200">
                {summary.message}
              </div>
            ) : null}

            <Table>
              <TableScroll>
                <table className="min-w-full divide-y divide-white/10 text-sm">
                  <thead className="sticky top-0 bg-slate-950/95 backdrop-blur-sm">
                    <tr className="text-left text-slate-400">
                      <th className="px-4 py-3 font-medium">Data</th>
                      <th className="px-4 py-3 font-medium">Veiculo</th>
                      <th className="px-4 py-3 font-medium">Placa</th>
                      <th className="px-4 py-3 font-medium">Fornecedor</th>
                      <th className="px-4 py-3 font-medium">Combustivel</th>
                      <th className="px-4 py-3 font-medium">Quantidade</th>
                      <th className="px-4 py-3 font-medium">Preco/L</th>
                      <th className="px-4 py-3 font-medium">Custo total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 bg-black/10">
                    {records.length ? (
                      records.map((record) => (
                        <tr key={record.id} className="text-slate-200 transition hover:bg-white/[0.03]">
                          <td className="whitespace-nowrap px-4 py-3">{formatDateLabel(record.date)}</td>
                          <td className="whitespace-nowrap px-4 py-3">{record.vehicle}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-400">
                            {record.licensePlate || "-"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">{record.supplier}</td>
                          <td className="whitespace-nowrap px-4 py-3">{record.fuelType}</td>
                          <td className="whitespace-nowrap px-4 py-3">{formatNumber(record.quantity)} L</td>
                          <td className="whitespace-nowrap px-4 py-3">
                            {formatCurrency(record.pricePerLiter)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">{formatCurrency(record.totalCost)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={8} className="px-4 py-14 text-center text-slate-500">
                          Nenhum dado disponivel para os filtros atuais.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </TableScroll>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
