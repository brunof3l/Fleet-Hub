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
import * as XLSX from "xlsx";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableScroll } from "@/components/ui/table";
import { analyzeSpeedWorkbook, buildViolationExportRows, normalizeVehicleKey } from "@/lib/speed-analysis";
import { cn } from "@/lib/utils";
import type { DashboardSummary } from "@/types/fuel";
import type { SpeedViolation } from "@/types/speed";
import { ModuleNav } from "./module-nav";

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

export default function SpeedDashboardClient() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [violations, setViolations] = useState<SpeedViolation[]>([]);
  const [knownVehicles, setKnownVehicles] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [sheetName, setSheetName] = useState<string | null>(null);
  const [status, setStatus] = useState("Carregue um relatorio de velocidade para iniciar.");
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoadingFleet, setIsLoadingFleet] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadFleetContext() {
      setIsLoadingFleet(true);

      try {
        const response = await fetch("/api/dashboard", { cache: "no-store" });
        const payload = (await response.json()) as DashboardSummary;

        if (!response.ok) {
          throw new Error(payload.message ?? "Falha ao carregar a frota do modulo de combustivel.");
        }

        if (isMounted) {
          setKnownVehicles(payload.vehicleOptions ?? []);
        }
      } catch {
        if (isMounted) {
          setKnownVehicles([]);
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

  const knownVehicleSet = useMemo(
    () => new Set(knownVehicles.map((vehicle) => normalizeVehicleKey(vehicle))),
    [knownVehicles],
  );

  const vehicleSummary = useMemo(() => {
    const uniqueVehicles = Array.from(new Set(violations.map((item) => item.vehicle)));
    const linkedVehicles = uniqueVehicles.filter((vehicle) =>
      knownVehicleSet.has(normalizeVehicleKey(vehicle)),
    );
    const unlinkedVehicles = uniqueVehicles.filter(
      (vehicle) => !knownVehicleSet.has(normalizeVehicleKey(vehicle)),
    );
    const topSpeed = violations.reduce((highest, item) => Math.max(highest, item.maxSpeed), 0);

    return {
      uniqueVehicles,
      linkedVehicles,
      unlinkedVehicles,
      topSpeed,
    };
  }, [knownVehicleSet, violations]);

  const resetAnalysis = useCallback(() => {
    setViolations([]);
    setFileName(null);
    setSheetName(null);
    setError(null);
    setStatus("Carregue um relatorio de velocidade para iniciar.");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const exportViolations = useCallback(() => {
    if (!violations.length) {
      setStatus("Nao ha ocorrencias para exportar.");
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(buildViolationExportRows(violations));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Ocorrencias");

    const baseName = (fileName ?? "velocidade")
      .replace(/\.(xlsx|xls)$/i, "")
      .replace(/[\\/:*?"<>|]+/g, "-");

    XLSX.writeFile(workbook, `${baseName}-ocorrencias.xlsx`);
  }, [fileName, violations]);

  const processFile = useCallback((file: File) => {
    setIsProcessing(true);
    setError(null);
    setStatus(`Analisando ${file.name}...`);

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
                base de combustivel.
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
                  <CardTitle>Conexao com Combustivel</CardTitle>
                  <CardDescription>Cruzamento automatico com a base da frota.</CardDescription>
                </div>
                <Badge variant="secondary">{isLoadingFleet ? "Sincronizando" : "Ativo"}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Veiculos no modulo de combustivel</p>
                <p className="mt-1 text-xl font-semibold text-white">{knownVehicles.length}</p>
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
            title="Ocorrencias"
            value={String(violations.length)}
            subtitle="Eventos validos acima do limite"
          />
          <KpiCard
            title="Veiculos com Infracao"
            value={String(vehicleSummary.uniqueVehicles.length)}
            subtitle="Quantidade de veiculos distintos"
          />
          <KpiCard
            title="Maior Velocidade"
            value={`${vehicleSummary.topSpeed} km/h`}
            subtitle="Pico encontrado no relatorio"
          />
          <KpiCard
            title="Vinculados a Combustivel"
            value={String(vehicleSummary.linkedVehicles.length)}
            subtitle="Veiculos encontrados na base atual"
          />
        </section>

        {vehicleSummary.unlinkedVehicles.length ? (
          <Card>
            <CardHeader>
              <CardTitle>Veiculos sem vinculo</CardTitle>
              <CardDescription>
                Estes veiculos apareceram no relatorio de velocidade, mas nao foram encontrados na base de combustivel.
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
              <Button variant="outline" onClick={exportViolations} disabled={!violations.length}>
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

            {!error && violations.length ? (
              <div className="mb-4 rounded-2xl border border-sky-400/20 bg-sky-400/10 px-4 py-3 text-sm text-sky-200">
                <div className="flex flex-wrap items-center gap-4">
                  <span className="inline-flex items-center gap-2">
                    <Gauge className="size-4" />
                    Limite analisado: 130 km/h
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <Link2 className="size-4" />
                    {vehicleSummary.linkedVehicles.length} veiculos vinculados com combustivel
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
                      <th className="px-4 py-3 font-medium">Motorista</th>
                      <th className="px-4 py-3 font-medium">Inicio</th>
                      <th className="px-4 py-3 font-medium">Fim</th>
                      <th className="px-4 py-3 font-medium">Duracao</th>
                      <th className="px-4 py-3 font-medium">Velocidade Maxima</th>
                      <th className="px-4 py-3 font-medium">Endereco</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 bg-black/10">
                    {violations.length ? (
                      violations.map((violation) => {
                        const linked = knownVehicleSet.has(normalizeVehicleKey(violation.vehicle));

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
                                    linked
                                      ? "bg-emerald-400/10 text-emerald-200"
                                      : "bg-amber-400/10 text-amber-200",
                                  )}
                                >
                                  {linked ? "vinculado" : "sem vinculo"}
                                </span>
                              </div>
                            </td>
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
                        <td colSpan={7} className="px-4 py-14 text-center text-slate-500">
                          {isProcessing
                            ? "Processando relatorio..."
                            : "Nenhuma ocorrencia encontrada ainda."}
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
