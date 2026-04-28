"use client";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileSearch,
  Loader2,
  ReceiptText,
  RefreshCw,
  Upload,
  XCircle,
} from "lucide-react";

import { CombustivelNav } from "@/components/combustivel-nav";
import { ModuleNav } from "@/components/module-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableScroll } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { AuditProcessResponse, AuditResultRow, AuditStatus } from "@/types/audit";

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const numberFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const supportedMimeTypes = new Set(["application/pdf", "image/png", "image/jpeg"]);

function formatCurrency(value: number): string {
  return currencyFormatter.format(value || 0);
}

function formatNumber(value: number): string {
  return numberFormatter.format(value || 0);
}

function formatDate(value: string): string {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("pt-BR").format(new Date(`${value}T00:00:00`));
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

function getStatusStyles(status: AuditStatus): string {
  if (status === "MATCH_PERFEITO") {
    return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
  }

  if (status === "DIVERGENCIA") {
    return "border-amber-400/20 bg-amber-400/10 text-amber-200";
  }

  return "border-rose-400/20 bg-rose-400/10 text-rose-200";
}

function getStatusLabel(status: AuditStatus): string {
  if (status === "MATCH_PERFEITO") {
    return "Match Perfeito";
  }

  if (status === "DIVERGENCIA") {
    return "Divergencia";
  }

  return "Nao no Sistema";
}

function getFileMimeType(file: File): string {
  if (file.type && supportedMimeTypes.has(file.type)) {
    return file.type;
  }

  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension === "pdf") {
    return "application/pdf";
  }

  if (extension === "png") {
    return "image/png";
  }

  if (extension === "jpg" || extension === "jpeg") {
    return "image/jpeg";
  }

  return file.type;
}

async function convertPdfToImages(file: File): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const pdfBuffer = new Uint8Array(await file.arrayBuffer());
  const pdfDocument = await pdfjs.getDocument(
    {
      data: pdfBuffer,
      disableWorker: true,
      useWorkerFetch: false,
    } as unknown as Parameters<typeof pdfjs.getDocument>[0],
  ).promise;

  const images: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
    const page = await pdfDocument.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.35 });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Nao foi possivel converter o PDF para imagem.");
    }

    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);

    await page.render({
      canvas,
      canvasContext: context,
      viewport,
    }).promise;

    images.push(canvas.toDataURL("image/jpeg", 0.86));
    page.cleanup();
  }

  return images;
}

function ResultIcon({ status }: { status: AuditStatus }) {
  if (status === "MATCH_PERFEITO") {
    return <CheckCircle2 className="size-4 text-emerald-300" />;
  }

  if (status === "DIVERGENCIA") {
    return <AlertTriangle className="size-4 text-amber-300" />;
  }

  return <XCircle className="size-4 text-rose-300" />;
}

export default function InvoiceAuditClient() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState("Envie uma fatura ou cupom para iniciar a conciliacao.");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AuditProcessResponse | null>(null);

  const summary = result?.summary;
  const rows = useMemo(() => result?.results ?? [], [result?.results]);

  const sortedRows = useMemo(
    () =>
      [...rows].sort((left, right) => {
        const statusOrder: Record<AuditStatus, number> = {
          DIVERGENCIA: 0,
          NAO_NO_SISTEMA: 1,
          MATCH_PERFEITO: 2,
        };

        return statusOrder[left.status] - statusOrder[right.status];
      }),
    [rows],
  );

  const processFile = useCallback(async (file: File) => {
    const mimeType = getFileMimeType(file);

    if (!supportedMimeTypes.has(mimeType)) {
      setError("Formato invalido. Use PDF, PNG, JPG ou JPEG.");
      return;
    }

    setIsProcessing(true);
    setError(null);
    setStatus(`Preparando ${file.name} para analise...`);

    try {
      const formData = new FormData();
      formData.append("file", file);

      if (mimeType === "application/pdf") {
        setStatus(`Convertendo paginas do PDF ${file.name}...`);
        const pageImages = await convertPdfToImages(file);
        formData.append("pageImages", JSON.stringify(pageImages));
      }

      setStatus(`Enviando ${file.name} para conciliacao inteligente...`);
      const response = await fetch("/api/auditoria/process", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as AuditProcessResponse | { message?: string };

      if (!response.ok) {
        throw new Error("message" in payload ? payload.message ?? "Falha ao processar auditoria." : "Falha ao processar auditoria.");
      }

      const processed = payload as AuditProcessResponse;
      setResult(processed);
      setStatus(
        processed.extractedCount
          ? `${processed.extractedCount} item(ns) extraido(s) e conciliado(s) com a base.`
          : "A IA nao encontrou abastecimentos validos no documento.",
      );
    } catch (processingError) {
      setError(
        processingError instanceof Error
          ? processingError.message
          : "Falha ao processar a auditoria do documento.",
      );
      setResult(null);
    } finally {
      setIsProcessing(false);
    }
  }, []);

  function onSelectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (file) {
      void processFile(file);
    }
  }

  function onDropFile(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);

    const file = event.dataTransfer.files?.[0];
    if (file) {
      void processFile(file);
    }
  }

  function resetAudit() {
    setResult(null);
    setError(null);
    setStatus("Envie uma fatura ou cupom para iniciar a conciliacao.");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.16),_transparent_20%),linear-gradient(180deg,#020617_0%,#0f172a_45%,#020617_100%)]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <ModuleNav />
        <CombustivelNav />

        <header className="rounded-3xl border border-white/10 bg-slate-950/70 p-6 shadow-2xl shadow-black/25 backdrop-blur-sm">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <Badge variant="secondary">Auditoria de Faturas</Badge>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Conciliacao entre faturas do posto e abastecimentos do sistema
              </h1>
              <p className="mt-3 text-sm text-slate-400 sm:text-base">
                O modelo de visao extrai os itens do documento e cruza placa, data, valor e litragem
                com o banco Neon.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button variant="secondary" onClick={resetAudit}>
                <RefreshCw className="mr-2 size-4" />
                Limpar
              </Button>
              <Button onClick={() => fileInputRef.current?.click()} disabled={isProcessing}>
                {isProcessing ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Upload className="mr-2 size-4" />}
                Enviar documento
              </Button>
            </div>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
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
              accept=".pdf,.png,.jpg,.jpeg"
              onChange={onSelectFile}
              className="hidden"
            />
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.24em] text-slate-400">
              Upload
            </div>
            <h2 className="mt-5 text-xl font-semibold text-white">
              Arraste a fatura ou cupom para conciliacao
            </h2>
            <p className="mt-3 text-sm text-slate-400">
              Suporta `.pdf`, `.png`, `.jpg` e `.jpeg`.
            </p>
            <p className="mt-4 text-sm text-sky-300">{status}</p>
          </label>

          <Card>
            <CardHeader>
              <CardTitle>Como funciona</CardTitle>
              <CardDescription>Fluxo automatizado de leitura e conciliacao.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-center gap-2 text-white">
                  <ReceiptText className="size-4 text-sky-300" />
                  <span className="font-medium">Extracao por visao</span>
                </div>
                <p className="mt-2 text-sm text-slate-400">
                  A IA interpreta cupons, notas e relatorios de varias paginas sem depender de layout fixo.
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-center gap-2 text-white">
                  <FileSearch className="size-4 text-emerald-300" />
                  <span className="font-medium">Match por placa e data</span>
                </div>
                <p className="mt-2 text-sm text-slate-400">
                  O motor de conciliacao busca os abastecimentos do mesmo periodo e compara valor e litros.
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-center gap-2 text-white">
                  <AlertTriangle className="size-4 text-amber-300" />
                  <span className="font-medium">Tolerancias</span>
                </div>
                <p className="mt-2 text-sm text-slate-400">
                  Match perfeito considera diferenca menor que R$ 1,00 e litragem dentro de 0,5L.
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            title="Total Faturado"
            value={formatCurrency(summary?.totalInvoiced ?? 0)}
            subtitle="Somatorio extraido da fatura"
          />
          <KpiCard
            title="Total Sistema"
            value={formatCurrency(summary?.totalSystem ?? 0)}
            subtitle="Somatorio encontrado no banco"
          />
          <KpiCard
            title="Diferenca Identificada"
            value={formatCurrency(summary?.totalDifference ?? 0)}
            subtitle="Fatura menos sistema"
          />
          <KpiCard
            title="Itens Auditados"
            value={String(summary?.totalItems ?? 0)}
            subtitle="Linhas conciliadas pelo motor"
          />
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <Card className="bg-white/5">
            <CardContent className="flex items-center gap-4 p-5">
              <CheckCircle2 className="size-9 text-emerald-300" />
              <div>
                <p className="text-sm text-slate-400">Match Perfeito</p>
                <p className="text-2xl font-semibold text-white">{summary?.perfectCount ?? 0}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white/5">
            <CardContent className="flex items-center gap-4 p-5">
              <AlertTriangle className="size-9 text-amber-300" />
              <div>
                <p className="text-sm text-slate-400">Divergencias</p>
                <p className="text-2xl font-semibold text-white">{summary?.divergenceCount ?? 0}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white/5">
            <CardContent className="flex items-center gap-4 p-5">
              <XCircle className="size-9 text-rose-300" />
              <div>
                <p className="text-sm text-slate-400">Nao no Sistema</p>
                <p className="text-2xl font-semibold text-white">{summary?.missingCount ?? 0}</p>
              </div>
            </CardContent>
          </Card>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Resultado da Auditoria</CardTitle>
            <CardDescription>
              {result?.months.length
                ? `Meses consultados no banco: ${result.months.join(", ")}`
                : "Envie um documento para iniciar a conciliacao."}
            </CardDescription>
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

            <Table>
              <TableScroll>
                <table className="min-w-full divide-y divide-white/10 text-sm">
                  <thead className="sticky top-0 bg-slate-950/95 backdrop-blur-sm">
                    <tr className="text-left text-slate-400">
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Placa</th>
                      <th className="px-4 py-3 font-medium">Data</th>
                      <th className="px-4 py-3 font-medium">Estabelecimento</th>
                      <th className="px-4 py-3 font-medium">Valor Fatura</th>
                      <th className="px-4 py-3 font-medium">Valor Sistema</th>
                      <th className="px-4 py-3 font-medium">Dif. Valor</th>
                      <th className="px-4 py-3 font-medium">Litros Fatura</th>
                      <th className="px-4 py-3 font-medium">Litros Sistema</th>
                      <th className="px-4 py-3 font-medium">Dif. Litros</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 bg-black/10">
                    {sortedRows.length ? (
                      sortedRows.map((row: AuditResultRow) => (
                        <tr key={row.id} className="text-slate-200 transition hover:bg-white/[0.03]">
                          <td className="whitespace-nowrap px-4 py-3">
                            <span
                              className={cn(
                                "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium",
                                getStatusStyles(row.status),
                              )}
                            >
                              <ResultIcon status={row.status} />
                              {getStatusLabel(row.status)}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 font-medium">{row.invoice.placa}</td>
                          <td className="whitespace-nowrap px-4 py-3">{formatDate(row.invoice.dateIso)}</td>
                          <td className="min-w-56 px-4 py-3">{row.invoice.estabelecimento}</td>
                          <td className="whitespace-nowrap px-4 py-3">{formatCurrency(row.invoice.valorTotal)}</td>
                          <td className="whitespace-nowrap px-4 py-3">
                            {row.systemRecord ? formatCurrency(row.systemRecord.totalCost) : "-"}
                          </td>
                          <td
                            className={cn(
                              "whitespace-nowrap px-4 py-3 font-medium",
                              row.totalDifference === null
                                ? "text-slate-500"
                                : Math.abs(row.totalDifference) < 1
                                  ? "text-emerald-300"
                                  : "text-amber-300",
                            )}
                          >
                            {row.totalDifference === null ? "-" : formatCurrency(row.totalDifference)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">{formatNumber(row.invoice.litros)}</td>
                          <td className="whitespace-nowrap px-4 py-3">
                            {row.systemRecord ? formatNumber(row.systemRecord.quantity) : "-"}
                          </td>
                          <td
                            className={cn(
                              "whitespace-nowrap px-4 py-3 font-medium",
                              row.litersDifference === null
                                ? "text-slate-500"
                                : Math.abs(row.litersDifference) <= 0.5
                                  ? "text-emerald-300"
                                  : "text-amber-300",
                            )}
                          >
                            {row.litersDifference === null ? "-" : formatNumber(row.litersDifference)}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={10} className="px-4 py-14 text-center text-slate-500">
                          {isProcessing
                            ? "Processando documento..."
                            : "Nenhum resultado de auditoria disponivel."}
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
