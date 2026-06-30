"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Fuel, Gauge, Printer, RefreshCw, Truck } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ModuleNav } from "@/components/module-nav";
import type { OverviewData } from "@/types/overview";

const PIE_COLORS = ["#22c55e", "#38bdf8", "#f59e0b", "#a78bfa", "#fb7185", "#2dd4bf", "#facc15", "#60a5fa"];

const currencyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const numberFormatter = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const decimalFormatter = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

function formatCurrency(value: number): string {
  return currencyFormatter.format(value || 0);
}

function formatNumber(value: number): string {
  return numberFormatter.format(value || 0);
}

function formatDecimal(value: number): string {
  return decimalFormatter.format(value || 0);
}

function formatMonthLabel(value: string): string {
  if (!value?.includes("-")) {
    return value || "-";
  }
  const [year, month] = value.split("-");
  const date = new Date(`${year}-${month}-01T00:00:00`);
  return new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit" }).format(date);
}

function formatDateLabel(value: string): string {
  if (!value) {
    return "-";
  }
  const date = new Date(value.length > 10 ? value : `${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? "-" : new Intl.DateTimeFormat("pt-BR").format(date);
}

function defaultPeriod() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const toIso = (date: Date) => {
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 10);
  };
  return { startDate: toIso(start), endDate: toIso(now) };
}

const chartTooltipStyle = {
  backgroundColor: "#020617",
  borderColor: "rgba(255,255,255,0.12)",
  borderRadius: 16,
  color: "#e2e8f0",
} as const;

function KpiCard({
  icon: Icon,
  title,
  value,
  subtitle,
  accent,
}: {
  icon: typeof Fuel;
  title: string;
  value: string;
  subtitle: string;
  accent: string;
}) {
  return (
    <Card className="bg-white/5">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-400">{title}</p>
          <span className={`flex size-9 items-center justify-center rounded-xl border ${accent}`}>
            <Icon className="size-4" />
          </span>
        </div>
        <p className="mt-3 text-2xl font-semibold text-white">{value}</p>
        <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
      </CardContent>
    </Card>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] text-sm text-slate-500">
      {label}
    </div>
  );
}

function ChartCard({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="h-72">{children}</CardContent>
    </Card>
  );
}

export default function OverviewClient() {
  const [period, setPeriod] = useState(defaultPeriod);
  const [data, setData] = useState<OverviewData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState("Carregando indicadores...");

  const loadOverview = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ startDate: period.startDate, endDate: period.endDate });
      const response = await fetch(`/api/overview?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.message ?? "Falha ao carregar o overview.");
      }
      setData(payload as OverviewData);
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao carregar o overview.");
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [period.startDate, period.endDate]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const applyMonthsBack = useCallback((months: number) => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
    const toIso = (date: Date) => {
      const offset = date.getTimezoneOffset() * 60000;
      return new Date(date.getTime() - offset).toISOString().slice(0, 10);
    };
    setPeriod({ startDate: toIso(start), endDate: toIso(now) });
  }, []);

  const fuel = data?.fuel;
  const fleet = data?.fleet;
  const speed = data?.speed;

  const supplierData = useMemo(() => fuel?.bySupplier ?? [], [fuel?.bySupplier]);
  const fuelTypeData = useMemo(() => fuel?.byFuelType ?? [], [fuel?.byFuelType]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(34,197,94,0.16),_transparent_22%),linear-gradient(180deg,#020617_0%,#0f172a_45%,#020617_100%)]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <div className="print:hidden">
          <ModuleNav />
        </div>

        <header className="rounded-3xl border border-white/10 bg-slate-950/70 p-6 shadow-2xl shadow-black/25 backdrop-blur-sm">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <Badge>Apresentacao</Badge>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Visao geral do monitoramento da frota
              </h1>
              <p className="mt-3 text-sm text-slate-400 sm:text-base">
                Indicadores consolidados de combustivel, frota e velocidade para apresentacao a lideranca.
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Periodo: {formatDateLabel(period.startDate)} a {formatDateLabel(period.endDate)}
                {data ? ` • atualizado em ${new Date(data.generatedAt).toLocaleString("pt-BR")}` : ""}
              </p>
            </div>

            <div className="flex flex-wrap gap-2 print:hidden">
              <Button variant="secondary" size="sm" onClick={() => applyMonthsBack(3)}>
                3 meses
              </Button>
              <Button variant="secondary" size="sm" onClick={() => applyMonthsBack(6)}>
                6 meses
              </Button>
              <Button variant="secondary" size="sm" onClick={() => applyMonthsBack(12)}>
                12 meses
              </Button>
              <Input
                type="date"
                value={period.startDate}
                onChange={(event) => setPeriod((current) => ({ ...current, startDate: event.target.value }))}
                className="w-auto"
              />
              <Input
                type="date"
                value={period.endDate}
                onChange={(event) => setPeriod((current) => ({ ...current, endDate: event.target.value }))}
                className="w-auto"
              />
              <Button variant="secondary" onClick={() => void loadOverview()} disabled={isLoading}>
                <RefreshCw className={isLoading ? "mr-2 size-4 animate-spin" : "mr-2 size-4"} />
                Atualizar
              </Button>
              <Button onClick={() => window.print()}>
                <Printer className="mr-2 size-4" />
                Apresentar / PDF
              </Button>
            </div>
          </div>
          {status ? <p className="mt-4 text-sm text-amber-300">{status}</p> : null}
        </header>

        {/* KPIs */}
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            icon={Truck}
            title="Veiculos na frota"
            value={formatNumber(fleet?.totalVehicles ?? 0)}
            subtitle={`${formatNumber(fleet?.withCrlv ?? 0)} com CRLV anexado`}
            accent="border-sky-400/30 bg-sky-400/10 text-sky-300"
          />
          <KpiCard
            icon={Fuel}
            title="Gasto com combustivel"
            value={formatCurrency(fuel?.totalCost ?? 0)}
            subtitle={`${formatNumber(fuel?.totalRecords ?? 0)} abastecimentos no periodo`}
            accent="border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
          />
          <KpiCard
            icon={Activity}
            title="Volume abastecido"
            value={`${formatNumber(fuel?.totalLiters ?? 0)} L`}
            subtitle={`Preco medio ${formatCurrency(fuel?.avgPrice ?? 0)}/L`}
            accent="border-amber-400/30 bg-amber-400/10 text-amber-300"
          />
          <KpiCard
            icon={Gauge}
            title="Ocorrencias de velocidade"
            value={formatNumber(speed?.totalViolations ?? 0)}
            subtitle={
              speed?.highestSpeed
                ? `Pico ${formatNumber(speed.highestSpeed)} km/h${speed.highestSpeedVehicle ? ` • ${speed.highestSpeedVehicle}` : ""}`
                : "Sem ocorrencias no periodo"
            }
            accent="border-rose-400/30 bg-rose-400/10 text-rose-300"
          />
          <KpiCard
            icon={Activity}
            title="Distancia percorrida"
            value={`${formatNumber(fuel?.totalDistance ?? 0)} km`}
            subtitle="Soma da medida percorrida"
            accent="border-violet-400/30 bg-violet-400/10 text-violet-300"
          />
          <KpiCard
            icon={Fuel}
            title="Autonomia media"
            value={`${formatDecimal(fuel?.avgAutonomy ?? 0)} km/L`}
            subtitle="Distancia / litros no periodo"
            accent="border-teal-400/30 bg-teal-400/10 text-teal-300"
          />
          <KpiCard
            icon={Truck}
            title="Veiculos ativos"
            value={formatNumber(fuel?.activeVehicles ?? 0)}
            subtitle="Com abastecimento no periodo"
            accent="border-sky-400/30 bg-sky-400/10 text-sky-300"
          />
          <KpiCard
            icon={AlertTriangle}
            title="Licenciamentos a vencer"
            value={formatNumber(fleet?.licensingDueSoon ?? 0)}
            subtitle="Proximos vencimentos de CRLV"
            accent="border-amber-400/30 bg-amber-400/10 text-amber-300"
          />
        </section>

        {/* Combustivel - tendencias */}
        <section className="grid gap-4 xl:grid-cols-2">
          <ChartCard title="Gasto mensal com combustivel" description="Evolucao do custo em reais.">
            {fuel?.monthly.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={fuel.monthly}>
                  <defs>
                    <linearGradient id="gastoFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22c55e" stopOpacity={0.6} />
                      <stop offset="100%" stopColor="#22c55e" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(148,163,184,0.15)" vertical={false} />
                  <XAxis dataKey="month" stroke="#94a3b8" tickFormatter={formatMonthLabel} tickLine={false} axisLine={false} />
                  <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} width={70} />
                  <Tooltip
                    contentStyle={chartTooltipStyle}
                    labelFormatter={(label) => formatMonthLabel(String(label))}
                    formatter={(value) => [formatCurrency(Number(value) || 0), "Gasto"]}
                  />
                  <Area type="monotone" dataKey="cost" stroke="#22c55e" strokeWidth={2} fill="url(#gastoFill)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart label={isLoading ? "Carregando..." : "Sem dados no periodo."} />
            )}
          </ChartCard>

          <ChartCard title="Volume mensal abastecido" description="Litros por mes.">
            {fuel?.monthly.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={fuel.monthly}>
                  <CartesianGrid stroke="rgba(148,163,184,0.15)" vertical={false} />
                  <XAxis dataKey="month" stroke="#94a3b8" tickFormatter={formatMonthLabel} tickLine={false} axisLine={false} />
                  <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} width={60} />
                  <Tooltip
                    cursor={{ fill: "rgba(148,163,184,0.06)" }}
                    contentStyle={chartTooltipStyle}
                    labelFormatter={(label) => formatMonthLabel(String(label))}
                    formatter={(value) => [`${formatNumber(Number(value) || 0)} L`, "Litros"]}
                  />
                  <Bar dataKey="liters" radius={[8, 8, 0, 0]} fill="#38bdf8" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart label={isLoading ? "Carregando..." : "Sem dados no periodo."} />
            )}
          </ChartCard>
        </section>

        {/* Rankings combustivel */}
        <section className="grid gap-4 xl:grid-cols-[1.4fr_0.8fr_0.8fr]">
          <ChartCard title="Top veiculos por gasto" description="Maiores consumidores no periodo.">
            {fuel?.topVehiclesByCost.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={fuel.topVehiclesByCost} layout="vertical" margin={{ left: 16 }}>
                  <CartesianGrid stroke="rgba(148,163,184,0.15)" horizontal={false} />
                  <XAxis type="number" stroke="#94a3b8" tickLine={false} axisLine={false} hide />
                  <YAxis type="category" dataKey="label" stroke="#94a3b8" tickLine={false} axisLine={false} width={90} />
                  <Tooltip
                    cursor={{ fill: "rgba(148,163,184,0.06)" }}
                    contentStyle={chartTooltipStyle}
                    formatter={(value) => [formatCurrency(Number(value) || 0), "Gasto"]}
                  />
                  <Bar dataKey="value" radius={[0, 8, 8, 0]} fill="#22c55e" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart label={isLoading ? "Carregando..." : "Sem dados no periodo."} />
            )}
          </ChartCard>

          <ChartCard title="Gasto por posto" description="Distribuicao por fornecedor.">
            {supplierData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={supplierData} dataKey="value" nameKey="label" innerRadius={45} outerRadius={80} paddingAngle={2}>
                    {supplierData.map((entry, index) => (
                      <Cell key={entry.label} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={chartTooltipStyle} formatter={(value) => formatCurrency(Number(value) || 0)} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart label={isLoading ? "Carregando..." : "Sem dados."} />
            )}
          </ChartCard>

          <ChartCard title="Volume por combustivel" description="Litros por tipo.">
            {fuelTypeData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={fuelTypeData} dataKey="value" nameKey="label" innerRadius={45} outerRadius={80} paddingAngle={2}>
                    {fuelTypeData.map((entry, index) => (
                      <Cell key={entry.label} fill={PIE_COLORS[(index + 3) % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={chartTooltipStyle} formatter={(value) => `${formatNumber(Number(value) || 0)} L`} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart label={isLoading ? "Carregando..." : "Sem dados."} />
            )}
          </ChartCard>
        </section>

        {/* Velocidade */}
        <section className="grid gap-4 xl:grid-cols-2">
          <ChartCard title="Ocorrencias de velocidade por mes" description="Eventos acima de 130 km/h.">
            {speed?.monthly.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={speed.monthly}>
                  <CartesianGrid stroke="rgba(148,163,184,0.15)" vertical={false} />
                  <XAxis dataKey="month" stroke="#94a3b8" tickFormatter={formatMonthLabel} tickLine={false} axisLine={false} />
                  <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} width={50} allowDecimals={false} />
                  <Tooltip
                    cursor={{ fill: "rgba(148,163,184,0.06)" }}
                    contentStyle={chartTooltipStyle}
                    labelFormatter={(label) => formatMonthLabel(String(label))}
                    formatter={(value) => [`${formatNumber(Number(value) || 0)}`, "Ocorrencias"]}
                  />
                  <Bar dataKey="count" radius={[8, 8, 0, 0]} fill="#fb7185" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart
                label={
                  isLoading
                    ? "Carregando..."
                    : "Sem ocorrencias salvas. Envie um relatorio na pagina Velocidade."
                }
              />
            )}
          </ChartCard>

          <ChartCard title="Top veiculos em excesso de velocidade" description="Maior numero de ocorrencias.">
            {speed?.topOffenders.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={speed.topOffenders} layout="vertical" margin={{ left: 16 }}>
                  <CartesianGrid stroke="rgba(148,163,184,0.15)" horizontal={false} />
                  <XAxis type="number" stroke="#94a3b8" tickLine={false} axisLine={false} hide allowDecimals={false} />
                  <YAxis type="category" dataKey="label" stroke="#94a3b8" tickLine={false} axisLine={false} width={90} />
                  <Tooltip
                    cursor={{ fill: "rgba(148,163,184,0.06)" }}
                    contentStyle={chartTooltipStyle}
                    formatter={(value) => [`${formatNumber(Number(value) || 0)}`, "Ocorrencias"]}
                  />
                  <Bar dataKey="value" radius={[0, 8, 8, 0]} fill="#f59e0b" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart label={isLoading ? "Carregando..." : "Sem ocorrencias no periodo."} />
            )}
          </ChartCard>
        </section>

        {/* Frota - alertas e distribuicao */}
        <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Licenciamentos a vencer</CardTitle>
              <CardDescription>Proximos vencimentos de CRLV da frota.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {fleet?.licensingAlerts.length ? (
                  fleet.licensingAlerts.map((alert) => (
                    <div
                      key={`${alert.plate}-${alert.dueDate}`}
                      className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3"
                    >
                      <div>
                        <p className="font-medium text-white">{alert.plate}</p>
                        <p className="text-xs text-slate-400">{alert.brandModel}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-slate-200">{formatDateLabel(alert.dueDate)}</p>
                        <p
                          className={
                            alert.days <= 15
                              ? "text-xs text-rose-300"
                              : alert.days <= 30
                                ? "text-xs text-amber-300"
                                : "text-xs text-slate-400"
                          }
                        >
                          {alert.days < 0 ? "Vencido" : `em ${alert.days} dia(s)`}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-10 text-center text-sm text-slate-500">
                    {isLoading ? "Carregando..." : "Nenhum vencimento proximo."}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <ChartCard title="Frota por localizacao" description="Veiculos por base/local.">
            {fleet?.byLocation.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={fleet.byLocation}>
                  <CartesianGrid stroke="rgba(148,163,184,0.15)" vertical={false} />
                  <XAxis dataKey="label" stroke="#94a3b8" tickLine={false} axisLine={false} hide />
                  <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} width={40} allowDecimals={false} />
                  <Tooltip
                    cursor={{ fill: "rgba(148,163,184,0.06)" }}
                    contentStyle={chartTooltipStyle}
                    formatter={(value) => [`${formatNumber(Number(value) || 0)}`, "Veiculos"]}
                  />
                  <Bar dataKey="value" radius={[8, 8, 0, 0]} fill="#a78bfa" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart label={isLoading ? "Carregando..." : "Sem dados de localizacao."} />
            )}
          </ChartCard>
        </section>
      </div>
    </div>
  );
}
