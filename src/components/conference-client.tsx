"use client";

import {
  useCallback,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { FileCheck2, RefreshCw, Upload } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ModuleNav } from "@/components/module-nav";
import { Table, TableScroll } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { ConferenceResult, ConferenceStatus } from "@/types/fuel";

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const litersFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 3,
});

function formatCurrency(value: number): string {
  return currencyFormatter.format(value || 0);
}

function formatLiters(value: number): string {
  return `${litersFormatter.format(value || 0)} L`;
}

function formatDateLabel(value: string): string {
  if (!value) {
    return "-";
  }
  return new Intl.DateTimeFormat("pt-BR").format(new Date(`${value}T00:00:00`));
}

function getStatusLabel(status: ConferenceStatus): string {
  if (status === "CONFORME") {
    return "Conforme";
  }
  if (status === "DIVERGENTE") {
    return "Divergente";
  }
  return "Nao lancado";
}

function getStatusStyles(status: ConferenceStatus): string {
  if (status === "CONFORME") {
    return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
  }
  if (status === "DIVERGENTE") {
    return "border-amber-400/20 bg-amber-400/10 text-amber-200";
  }
  return "border-rose-400/20 bg-rose-400/10 text-rose-200";
}

function SummaryCard({
  title,
  value,
  subtitle,
  tone,
}: {
  title: string;
  value: string;
  subtitle: string;
  tone?: "default" | "danger" | "warning";
}) {
  return (
    <Card className="bg-white/5">
      <CardContent className="p-5">
        <p className="text-sm text-slate-400">{title}</p>
        <p
          className={cn(
            "mt-3 text-2xl font-semibold",
            tone === "danger" ? "text-rose-300" : tone === "warning" ? "text-amber-300" : "text-white",
          )}
        >
          {value}
        </p>
        <p className="mt-2 text-sm text-slate-500">{subtitle}</p>
      </CardContent>
    </Card>
  );
}

export default function ConferenceClient() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<ConferenceResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [status, setStatus] = useState("Envie a fatura em PDF do posto para conferir com o Infleet.");
  const [onlyProblems, setOnlyProblems] = useState(false);

  const handleUpload = useCallback(async (file: File) => {
    setIsUploading(true);
    setStatus(`Conferindo ${file.name} com os lancamentos do Infleet...`);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/fatura-conference", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.message ?? "Falha ao conferir a fatura.");
      }

      const conference = payload as ConferenceResult;
      setResult(conference);
      setStatus(
        conference.message ??
          `Conferencia concluida: ${conference.naoLancadoCount} nao lancado(s) e ${conference.divergenteCount} divergente(s).`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao conferir a fatura.");
      setResult(null);
    } finally {
      setIsUploading(false);
    }
  }, []);

  function onSelectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      void handleUpload(file);
    }
    event.target.value = "";
  }

  function onDropFile(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      void handleUpload(file);
    }
  }

  const visibleMatches = (result?.matches ?? []).filter(
    (match) => !onlyProblems || match.status !== "CONFORME",
  );

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(34,197,94,0.18),_transparent_20%),linear-gradient(180deg,#020617_0%,#0f172a_45%,#020617_100%)]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <ModuleNav />

        <header className="rounded-3xl border border-white/10 bg-slate-950/70 p-6 shadow-2xl shadow-black/25 backdrop-blur-sm">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <Badge>Conferencia</Badge>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Conferencia de faturas
              </h1>
              <p className="mt-3 text-sm text-slate-400 sm:text-base">
                Envie o PDF da fatura do posto e o sistema compara cada abastecimento com o que esta
                lancado no Infleet, apontando o que nao foi lancado ou esta divergente.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                <Upload className="mr-2 size-4" />
                {isUploading ? "Conferindo..." : "Enviar fatura PDF"}
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
              accept=".pdf,application/pdf"
              onChange={onSelectFile}
              className="hidden"
            />
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.24em] text-slate-400">
              Upload da fatura
            </div>
            <h2 className="mt-5 text-xl font-semibold text-white">
              Arraste a fatura ou clique para selecionar
            </h2>
            <p className="mt-3 text-sm text-slate-400">Formato aceito: `.pdf` (relatorio de detalhamento do posto).</p>
            <p className="mt-4 text-sm text-emerald-300">{status}</p>
          </label>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle>Dados da fatura</CardTitle>
                  <CardDescription>Cabecalho identificado no PDF.</CardDescription>
                </div>
                <FileCheck2 className="size-5 text-emerald-300" />
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Posto</p>
                <p className="mt-1 font-medium text-slate-200">{result?.header.supplier ?? "-"}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Nº Fatura</p>
                  <p className="mt-1 font-medium text-slate-200">{result?.header.invoiceNumber || "-"}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Periodo</p>
                  <p className="mt-1 font-medium text-slate-200">
                    {result?.periodStart
                      ? `${formatDateLabel(result.periodStart)} a ${formatDateLabel(result.periodEnd)}`
                      : "-"}
                  </p>
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Total da fatura</p>
                <p className="mt-1 font-medium text-slate-200">
                  {result
                    ? `${formatLiters(result.faturaTotalLiters)} • ${formatCurrency(result.faturaTotalValue)}`
                    : "-"}
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        {result ? (
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <SummaryCard
                title="Lancamentos na fatura"
                value={String(result.totalLines)}
                subtitle="Abastecimentos detalhados no PDF"
              />
              <SummaryCard
                title="Conformes"
                value={String(result.conformeCount)}
                subtitle="Batem com o Infleet"
              />
              <SummaryCard
                title="Divergentes"
                value={String(result.divergenteCount)}
                subtitle="Encontrados, mas com diferencas"
                tone="warning"
              />
              <SummaryCard
                title="Nao lancados"
                value={String(result.naoLancadoCount)}
                subtitle="Cobrados, mas ausentes no Infleet"
                tone="danger"
              />
            </section>

            <Card>
              <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <CardTitle>Resultado da conferencia</CardTitle>
                  <CardDescription>
                    Cada linha da fatura comparada com o lancamento correspondente no Infleet.
                  </CardDescription>
                </div>
                <Button
                  variant={onlyProblems ? "default" : "outline"}
                  size="sm"
                  onClick={() => setOnlyProblems((current) => !current)}
                >
                  {onlyProblems ? "Mostrando apenas pendencias" : "Mostrar apenas pendencias"}
                </Button>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableScroll>
                    <table className="min-w-full divide-y divide-white/10 text-sm">
                      <thead className="sticky top-0 bg-slate-950/95 backdrop-blur-sm">
                        <tr className="text-left text-slate-400">
                          <th className="px-4 py-3 font-medium">Status</th>
                          <th className="px-4 py-3 font-medium">Data</th>
                          <th className="px-4 py-3 font-medium">Placa</th>
                          <th className="px-4 py-3 font-medium">Combustivel</th>
                          <th className="px-4 py-3 font-medium">Qtde fatura</th>
                          <th className="px-4 py-3 font-medium">Valor fatura</th>
                          <th className="px-4 py-3 font-medium">Veiculo Infleet</th>
                          <th className="px-4 py-3 font-medium">Observacoes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 bg-black/10">
                        {visibleMatches.length ? (
                          visibleMatches.map((match, index) => (
                            <tr
                              key={`${match.line.documentNumber}-${match.line.plate}-${index}`}
                              className="text-slate-200 transition hover:bg-white/[0.03]"
                            >
                              <td className="whitespace-nowrap px-4 py-3">
                                <span
                                  className={cn(
                                    "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium",
                                    getStatusStyles(match.status),
                                  )}
                                >
                                  {getStatusLabel(match.status)}
                                </span>
                              </td>
                              <td className="whitespace-nowrap px-4 py-3">{formatDateLabel(match.line.date)}</td>
                              <td className="whitespace-nowrap px-4 py-3 font-medium">{match.line.rawPlate}</td>
                              <td className="whitespace-nowrap px-4 py-3 text-slate-400">{match.line.fuelType}</td>
                              <td className="whitespace-nowrap px-4 py-3">{formatLiters(match.line.quantity)}</td>
                              <td className="whitespace-nowrap px-4 py-3">{formatCurrency(match.line.totalCost)}</td>
                              <td className="whitespace-nowrap px-4 py-3 text-slate-400">
                                {match.matchedRecord?.vehicle ?? "-"}
                              </td>
                              <td className="px-4 py-3 text-slate-400">
                                {match.status === "NAO_LANCADO" ? (
                                  <span className="text-rose-200">Sem lancamento no Infleet nesta data/placa.</span>
                                ) : match.divergences.length ? (
                                  <ul className="list-disc space-y-1 pl-4 text-amber-200">
                                    {match.divergences.map((reason) => (
                                      <li key={reason}>{reason}</li>
                                    ))}
                                  </ul>
                                ) : (
                                  <span className="text-emerald-300">OK</span>
                                )}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={8} className="px-4 py-14 text-center text-slate-500">
                              {result.totalLines
                                ? "Nenhuma pendencia para exibir."
                                : "Nenhum lancamento reconhecido no PDF."}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </TableScroll>
                </Table>
              </CardContent>
            </Card>

            {result.infleetOnly.length ? (
              <Card>
                <CardHeader>
                  <CardTitle>Lancados no Infleet, ausentes na fatura</CardTitle>
                  <CardDescription>
                    Abastecimentos deste posto no periodo que estao no Infleet mas nao apareceram na fatura
                    (vinculo por nome do posto).
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableScroll>
                      <table className="min-w-full divide-y divide-white/10 text-sm">
                        <thead className="sticky top-0 bg-slate-950/95 backdrop-blur-sm">
                          <tr className="text-left text-slate-400">
                            <th className="px-4 py-3 font-medium">Data</th>
                            <th className="px-4 py-3 font-medium">Veiculo</th>
                            <th className="px-4 py-3 font-medium">Placa</th>
                            <th className="px-4 py-3 font-medium">Fornecedor</th>
                            <th className="px-4 py-3 font-medium">Quantidade</th>
                            <th className="px-4 py-3 font-medium">Valor</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 bg-black/10">
                          {result.infleetOnly.map((record) => (
                            <tr key={record.id} className="text-slate-200 transition hover:bg-white/[0.03]">
                              <td className="whitespace-nowrap px-4 py-3">{formatDateLabel(record.date)}</td>
                              <td className="whitespace-nowrap px-4 py-3">{record.vehicle}</td>
                              <td className="whitespace-nowrap px-4 py-3 text-slate-400">{record.plate || "-"}</td>
                              <td className="whitespace-nowrap px-4 py-3">{record.supplier}</td>
                              <td className="whitespace-nowrap px-4 py-3">{formatLiters(record.quantity)}</td>
                              <td className="whitespace-nowrap px-4 py-3">{formatCurrency(record.totalCost)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </TableScroll>
                  </Table>
                </CardContent>
              </Card>
            ) : null}
          </>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <RefreshCw className={cn("size-6 text-slate-500", isUploading && "animate-spin")} />
              <p className="text-sm text-slate-400">
                {isUploading
                  ? "Lendo o PDF e comparando com o Infleet..."
                  : "Os resultados da conferencia aparecerao aqui apos o envio da fatura."}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
