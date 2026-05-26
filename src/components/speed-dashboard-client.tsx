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
import { AlertTriangle, Download, Gauge, Link2, RefreshCw, Upload } from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import * as XLSX from "xlsx";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Table, TableScroll } from "@/components/ui/table";
import { analyzeSpeedWorkbook, buildViolationExportRows, normalizeVehicleKey } from "@/lib/speed-analysis";
import { cn } from "@/lib/utils";
import type { FleetOverview, FleetVehicle } from "@/types/fleet";
import type { SpeedDashboardData, SpeedDashboardViolationPayload, SpeedViolation } from "@/types/speed";
import { ModuleNav } from "./module-nav";

type EnrichedSpeedViolation = SpeedViolation & {
  location: string | null;
  linked: boolean;
};

const BAR_COLORS = ["#ef4444", "#f97316", "#fb923c", "#f59e0b", "#facc15"];
const PIE_COLORS = ["#f97316", "#ef4444", "#f59e0b", "#fb7185", "#facc15", "#fdba74", "#fb923c"];

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

function getFleetVehicleMatch(
  vehicleLabel: string,
  fleetAliasLookup: Map<string, FleetVehicle>,
  fleetVehicles: FleetVehicle[],
): FleetVehicle | null {
  const normalizedVehicleLabel = normalizeVehicleKey(vehicleLabel);
  const exactMatch = fleetAliasLookup.get(normalizedVehicleLabel);

  if (exactMatch) {
    return exactMatch;
  }

  return (
    fleetVehicles.find((vehicle) => {
      const normalizedPlate = normalizeVehicleKey(vehicle.plate);
      const normalizedBrandModel = normalizeVehicleKey(vehicle.brandModel);

      return (
        (normalizedPlate && normalizedVehicleLabel.includes(normalizedPlate)) ||
        (normalizedBrandModel && normalizedVehicleLabel.includes(normalizedBrandModel))
      );
    }) ?? null
  );
}

export default function SpeedDashboardClient() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [violations, setViolations] = useState<SpeedViolation[]>([]);
  const [fleetVehicles, setFleetVehicles] = useState<FleetVehicle[]>([]);
  const [fleetVehicleCount, setFleetVehicleCount] = useState(0);
  const [locationOptions, setLocationOptions] = useState<string[]>([]);
  const [selectedLocation, setSelectedLocation] = useState("todos");
  const [fileName, setFileName] = useState<string | null>(null);
  const [sheetName, setSheetName] = useState<string | null>(null);
  const [status, setStatus] = useState("Carregue um relatorio de velocidade para iniciar.");
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoadingFleet, setIsLoadingFleet] = useState(true);
  const [dashboardData, setDashboardData] = useState<SpeedDashboardData | null>(null);
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadFleetContext() {
      setIsLoadingFleet(true);

      try {
        const response = await fetch("/api/fleet", { cache: "no-store" });
        const payload = (await response.json()) as FleetOverview;

        if (!response.ok) {
          throw new Error(payload.message ?? "Falha ao carregar a base oficial da frota.");
        }

        if (isMounted) {
          setFleetVehicleCount(payload.totalVehicles ?? 0);
          setFleetVehicles(payload.vehicles ?? []);
          setLocationOptions(payload.locationOptions ?? []);
        }
      } catch {
        if (isMounted) {
          setFleetVehicleCount(0);
          setFleetVehicles([]);
          setLocationOptions([]);
        }
      } finally {
        if (isMounted) {
          setIsLoadingFleet(false);
        }
      }
    }

    void loadFleetContext();

    return () => {
      isMounted = false;
    };
  }, []);

  const fleetAliasLookup = useMemo(() => {
    const aliasLookup = new Map<string, FleetVehicle>();

    fleetVehicles.forEach((vehicle) => {
      [vehicle.plate, vehicle.brandModel].forEach((alias) => {
        const normalizedAlias = normalizeVehicleKey(alias);

        if (normalizedAlias && !aliasLookup.has(normalizedAlias)) {
          aliasLookup.set(normalizedAlias, vehicle);
        }
      });
    });

    return aliasLookup;
  }, [fleetVehicles]);

  const enrichedViolations = useMemo<EnrichedSpeedViolation[]>(() => {
    return violations.map((violation) => {
      const matchedFleetVehicle = getFleetVehicleMatch(violation.vehicle, fleetAliasLookup, fleetVehicles);

      return {
        ...violation,
        location: matchedFleetVehicle?.location ?? null,
        linked: Boolean(matchedFleetVehicle),
      };
    });
  }, [fleetAliasLookup, fleetVehicles, violations]);

  const filteredViolations = useMemo(() => {
    if (selectedLocation === "todos") {
      return enrichedViolations;
    }

    return enrichedViolations.filter((violation) => violation.location === selectedLocation);
  }, [enrichedViolations, selectedLocation]);

  useEffect(() => {
    let isMounted = true;

    async function loadDashboard() {
      if (!violations.length) {
        setDashboardData(null);
        return;
      }

      setIsLoadingDashboard(true);

      try {
        const payloadViolations: SpeedDashboardViolationPayload[] = violations.map((violation) => ({
          vehicle: violation.vehicle,
          driver: violation.driver,
          address: violation.address,
          startDate: violation.startDate instanceof Date ? violation.startDate.toISOString() : String(violation.startDate),
          startLabel: violation.startLabel,
          endDate: violation.endDate instanceof Date ? violation.endDate.toISOString() : String(violation.endDate),
          endLabel: violation.endLabel,
          durationMinutes: violation.durationMinutes,
          maxSpeed: violation.maxSpeed,
          location: violation.location ?? null,
        }));

        const response = await fetch("/api/reports/speed/dashboard", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            violations: payloadViolations,
            selectedLocation,
          }),
        });
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.message ?? "Falha ao carregar o dashboard de velocidade.");
        }

        if (isMounted) {
          setDashboardData(payload as SpeedDashboardData);
        }
      } catch (dashboardError) {
        if (isMounted) {
          setDashboardData(null);
          setStatus(
            dashboardError instanceof Error
              ? dashboardError.message
              : "Falha ao carregar o dashboard de velocidade.",
          );
        }
      } finally {
        if (isMounted) {
          setIsLoadingDashboard(false);
        }
      }
    }

    void loadDashboard();

    return () => {
      isMounted = false;
    };
  }, [selectedLocation, violations]);

  const vehicleSummary = useMemo(() => {
    const uniqueVehicles = Array.from(new Set(filteredViolations.map((item) => item.vehicle)));
    const linkedVehicleSet = new Set(
      filteredViolations.filter((item) => item.linked).map((item) => item.vehicle),
    );
    const linkedVehicles = uniqueVehicles.filter((vehicle) => linkedVehicleSet.has(vehicle));
    const unlinkedVehicles = uniqueVehicles.filter((vehicle) => !linkedVehicleSet.has(vehicle));
    const topSpeed = filteredViolations.reduce((highest, item) => Math.max(highest, item.maxSpeed), 0);

    return {
      uniqueVehicles,
      linkedVehicles,
      unlinkedVehicles,
      topSpeed,
    };
  }, [filteredViolations]);

  const topOffenders = dashboardData?.topOffenders ?? [];
  const violationsByLocation = dashboardData?.violationsByLocation ?? [];
  const dashboardSummary = dashboardData?.summary ?? {
    totalAlertsCurrentMonth: 0,
    highestSpeed: 0,
    highestSpeedVehicle: null,
    highestSpeedLocation: null,
    topLocation: null,
    topLocationCount: 0,
  };

  const resetAnalysis = useCallback(() => {
    setViolations([]);
    setFileName(null);
    setSheetName(null);
    setError(null);
    setStatus("Carregue um relatorio de velocidade para iniciar.");
    setSelectedLocation("todos");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const exportViolations = useCallback(() => {
    if (!filteredViolations.length) {
      setStatus("Nao ha ocorrencias para exportar.");
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(buildViolationExportRows(filteredViolations));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Ocorrencias");

    const baseName = (fileName ?? "velocidade")
      .replace(/\.(xlsx|xls)$/i, "")
      .replace(/[\\/:*?"<>|]+/g, "-");

    XLSX.writeFile(workbook, `${baseName}-ocorrencias.xlsx`);
  }, [fileName, filteredViolations]);

  const processFile = useCallback((file: File) => {
    setIsProcessing(true);
    setError(null);
    setStatus(`Analisando ${file.name}...`);
    setSelectedLocation("todos");

    const reader = new FileReader();

    reader.onload = (event) => {
      const result = event.target?.result;

      if (!(result instanceof ArrayBuffer)) {
        setError("Falha ao abrir o arquivo selecionado.");
        setIsProcessing(false);
        return;
      }

      const analysis = analyzeSpeedWorkbook(file.name, result);
      setFileName(file.name);
      setSheetName(analysis.sheetName);
      setViolations(analysis.violations);
      setError(analysis.error ?? null);
      setStatus(
        analysis.error
          ? analysis.error
          : `${analysis.violations.length} ocorrencias acima de 130 km/h foram encontradas.`,
      );
      setIsProcessing(false);
    };

    reader.onerror = () => {
      setError("Falha ao ler o arquivo selecionado.");
      setIsProcessing(false);
    };

    reader.readAsArrayBuffer(file);
  }, []);

  function onSelectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      processFile(file);
    }
  }

  function onDropFile(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.18),_transparent_20%),linear-gradient(180deg,#020617_0%,#0f172a_45%,#020617_100%)]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <ModuleNav />

        <header className="rounded-3xl border border-white/10 bg-slate-950/70 p-6 shadow-2xl shadow-black/25 backdrop-blur-sm">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <Badge>Velocidade</Badge>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Analise de velocidade integrada com a frota
              </h1>
              <p className="mt-3 text-sm text-slate-400 sm:text-base">
                Leia relatorios XLSX, detecte eventos acima de 130 km/h e cruze os veiculos com a
                base oficial da frota.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button variant="secondary" onClick={resetAnalysis}>
                <RefreshCw className="mr-2 size-4" />
                Nova analise
              </Button>
              <Button onClick={() => fileInputRef.current?.click()} disabled={isProcessing}>
                <Upload className="mr-2 size-4" />
                Enviar relatorio
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
                ? "border-sky-400 bg-sky-400/10"
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
            <h2 className="mt-5 text-xl font-semibold text-white">
              Arraste o relatorio de velocidade ou clique para selecionar
            </h2>
            <p className="mt-3 text-sm text-slate-400">Arquivos suportados: `.xlsx` e `.xls`.</p>
            <p className="mt-4 text-sm text-sky-300">{isProcessing ? "Processando..." : status}</p>
          </label>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle>Conexao com Frota</CardTitle>
                  <CardDescription>Cruzamento automatico com a base da frota.</CardDescription>
                </div>
                <Badge variant="secondary">{isLoadingFleet ? "Sincronizando" : "Ativo"}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Registros na base de frota</p>
                <p className="mt-1 text-xl font-semibold text-white">{fleetVehicleCount}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Veiculos vinculados</p>
                <p className="mt-1 text-xl font-semibold text-white">{vehicleSummary.linkedVehicles.length}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Arquivo atual</p>
                <p className="mt-1 text-sm text-slate-300">
                  {fileName ? `${fileName}${sheetName ? ` • aba ${sheetName}` : ""}` : "Nenhum arquivo carregado"}
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            title="Alertas no Mes"
            value={String(dashboardSummary.totalAlertsCurrentMonth)}
            subtitle="Ocorrencias do mes atual"
          />
          <KpiCard
            title="Maior Velocidade"
            value={`${dashboardSummary.highestSpeed} km/h`}
            subtitle={dashboardSummary.highestSpeedVehicle ?? "Sem registros"}
          />
          <KpiCard
            title="Local Critico"
            value={dashboardSummary.topLocation ?? "---"}
            subtitle={
              dashboardSummary.topLocationCount
                ? `${dashboardSummary.topLocationCount} ocorrencias`
                : "Sem ocorrencias"
            }
          />
          <KpiCard
            title="Veiculos com Infracao"
            value={String(vehicleSummary.uniqueVehicles.length)}
            subtitle={`${filteredViolations.length} ocorrencias no filtro atual`}
          />
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <Card>
            <CardHeader>
              <CardTitle>Top Infratores</CardTitle>
              <CardDescription>
                Cinco veiculos com mais ocorrencias de excesso de velocidade.
              </CardDescription>
            </CardHeader>
            <CardContent className="h-80">
              {isLoadingDashboard ? (
                <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] text-sm text-slate-500">
                  Carregando dashboard...
                </div>
              ) : topOffenders.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topOffenders}>
                    <XAxis
                      dataKey="vehicle"
                      stroke="#94a3b8"
                      tickLine={false}
                      axisLine={false}
                      interval={0}
                      angle={-15}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip
                      cursor={{ fill: "rgba(148,163,184,0.06)" }}
                      contentStyle={{
                        backgroundColor: "#020617",
                        borderColor: "rgba(255,255,255,0.12)",
                        borderRadius: 16,
                      }}
                      formatter={(value) => [`${Number(value)} ocorrencias`, "Excessos"]}
                      labelFormatter={(label) => `Veiculo: ${label}`}
                    />
                    <Bar dataKey="count" radius={[10, 10, 0, 0]}>
                      {topOffenders.map((entry, index) => (
                        <Cell key={`${entry.vehicle}-${entry.count}`} fill={BAR_COLORS[index % BAR_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] text-sm text-slate-500">
                  Carregue um relatorio para visualizar o ranking.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Infrações por Local</CardTitle>
              <CardDescription>
                Distribuicao percentual das ocorrencias agrupadas por cidade/unidade.
              </CardDescription>
            </CardHeader>
            <CardContent className="h-80">
              {isLoadingDashboard ? (
                <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] text-sm text-slate-500">
                  Carregando dashboard...
                </div>
              ) : violationsByLocation.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={violationsByLocation}
                      dataKey="count"
                      nameKey="location"
                      innerRadius={70}
                      outerRadius={110}
                      paddingAngle={2}
                    >
                      {violationsByLocation.map((entry, index) => (
                        <Cell key={`${entry.location}-${entry.count}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#020617",
                        borderColor: "rgba(255,255,255,0.12)",
                        borderRadius: 16,
                      }}
                      formatter={(value) => [`${Number(value)} ocorrencias`, "Total"]}
                      labelFormatter={(label) => `Local: ${label}`}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] text-sm text-slate-500">
                  Carregue um relatorio para visualizar a distribuicao.
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        {vehicleSummary.unlinkedVehicles.length ? (
          <Card>
            <CardHeader>
              <CardTitle>Veiculos sem vinculo</CardTitle>
              <CardDescription>
                Estes veiculos apareceram no relatorio de velocidade, mas nao foram encontrados na base oficial da frota.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {vehicleSummary.unlinkedVehicles.map((vehicle) => (
                <span
                  key={vehicle}
                  className="rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-sm text-amber-200"
                >
                  {vehicle}
                </span>
              ))}
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <CardTitle>Ocorrencias de Velocidade</CardTitle>
              <CardDescription>Relatorio consolidado para analise e exportacao.</CardDescription>
            </div>
            <div className="flex flex-wrap gap-3">
              <Select value={selectedLocation} onChange={(event) => setSelectedLocation(event.target.value)}>
                <option value="todos">Filtrar por Local</option>
                {locationOptions.map((location) => (
                  <option key={location} value={location}>
                    {location}
                  </option>
                ))}
              </Select>
              <Button variant="outline" onClick={exportViolations} disabled={!filteredViolations.length}>
                <Download className="mr-2 size-4" />
                Exportar XLSX
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {error ? (
              <div className="mb-4 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="size-4" />
                  <span>{error}</span>
                </div>
              </div>
            ) : null}

            {!error && filteredViolations.length ? (
              <div className="mb-4 rounded-2xl border border-sky-400/20 bg-sky-400/10 px-4 py-3 text-sm text-sky-200">
                <div className="flex flex-wrap items-center gap-4">
                  <span className="inline-flex items-center gap-2">
                    <Gauge className="size-4" />
                    Limite analisado: 130 km/h
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <Link2 className="size-4" />
                    {vehicleSummary.linkedVehicles.length} veiculos vinculados com a frota
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <span>Local:</span>
                    {selectedLocation === "todos" ? "todos" : selectedLocation}
                  </span>
                </div>
              </div>
            ) : null}

            <Table>
              <TableScroll>
                <table className="min-w-full divide-y divide-white/10 text-sm">
                  <thead className="sticky top-0 bg-slate-950/95 backdrop-blur-sm">
                    <tr className="text-left text-slate-400">
                      <th className="px-4 py-3 font-medium">Veiculo</th>
                      <th className="px-4 py-3 font-medium">Cidade/Local</th>
                      <th className="px-4 py-3 font-medium">Motorista</th>
                      <th className="px-4 py-3 font-medium">Inicio</th>
                      <th className="px-4 py-3 font-medium">Fim</th>
                      <th className="px-4 py-3 font-medium">Duracao</th>
                      <th className="px-4 py-3 font-medium">Velocidade Maxima</th>
                      <th className="px-4 py-3 font-medium">Endereco</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 bg-black/10">
                    {filteredViolations.length ? (
                      filteredViolations.map((violation) => {
                        return (
                          <tr
                            key={`${violation.vehicle}-${violation.startLabel}-${violation.endLabel}`}
                            className="text-slate-200 transition hover:bg-white/[0.03]"
                          >
                            <td className="whitespace-nowrap px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span>{violation.vehicle}</span>
                                <span
                                  className={cn(
                                    "rounded-full px-2 py-0.5 text-xs",
                                    violation.linked
                                      ? "bg-emerald-400/10 text-emerald-200"
                                      : "bg-amber-400/10 text-amber-200",
                                  )}
                                >
                                  {violation.linked ? "vinculado" : "sem vinculo"}
                                </span>
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3">{violation.location ?? "---"}</td>
                            <td className="whitespace-nowrap px-4 py-3">{violation.driver}</td>
                            <td className="whitespace-nowrap px-4 py-3">{violation.startLabel}</td>
                            <td className="whitespace-nowrap px-4 py-3">{violation.endLabel}</td>
                            <td className="whitespace-nowrap px-4 py-3">{violation.durationMinutes} min</td>
                            <td className="whitespace-nowrap px-4 py-3 text-rose-300">
                              {violation.maxSpeed} km/h
                            </td>
                            <td className="min-w-72 px-4 py-3">{violation.address}</td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={8} className="px-4 py-14 text-center text-slate-500">
                          {isProcessing
                            ? "Processando relatorio..."
                            : "Nenhuma ocorrencia encontrada para o filtro atual."}
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
