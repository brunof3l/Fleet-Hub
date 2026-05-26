"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import {
  AlertTriangle,
  Download,
  FileSpreadsheet,
  FileUp,
  RefreshCw,
  ShieldAlert,
  Truck,
  Upload,
} from "lucide-react";

import { ModuleNav } from "@/components/module-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableScroll } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { FleetImportResult, FleetOverview, FleetSeedResult, FleetVehicle } from "@/types/fleet";


function formatDateLabel(value: string): string {
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

export default function FleetDashboardClient() {
  const crlvInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [overview, setOverview] = useState<FleetOverview | null>(null);
  const [search, setSearch] = useState("");
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [status, setStatus] = useState("Carregando dados da frota...");
  const [isLoading, setIsLoading] = useState(true);
  const [isSeeding, setIsSeeding] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [lastImport, setLastImport] = useState<FleetImportResult | null>(null);

  const loadFleetOverview = useCallback(async () => {
    setIsLoading(true);

    try {
      const response = await fetch("/api/fleet", { cache: "no-store" });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.message ?? "Falha ao carregar a frota.");
      }

      setOverview(payload as FleetOverview);
      setStatus(payload.message ?? "Frota atualizada com sucesso.");
    } catch (error) {
      setOverview(null);
      setStatus(error instanceof Error ? error.message : "Falha ao carregar a frota.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFleetOverview();
  }, [loadFleetOverview]);

  useEffect(() => {
    if (!overview?.vehicles.length) {
      setSelectedVehicleId(null);
      return;
    }

    if (!selectedVehicleId || !overview.vehicles.some((vehicle) => vehicle.id === selectedVehicleId)) {
      setSelectedVehicleId(overview.vehicles[0]?.id ?? null);
    }
  }, [overview, selectedVehicleId]);

  const filteredVehicles = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    if (!normalizedSearch) {
      return overview?.vehicles ?? [];
    }

    return (overview?.vehicles ?? []).filter((vehicle) =>
      [
        vehicle.plate,
        vehicle.brandModel,
        vehicle.chassis,
        vehicle.renavam,
        vehicle.manufacturingModelYear,
        vehicle.location ?? "",
        vehicle.insuranceStatus ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch),
    );
  }, [overview?.vehicles, search]);

  const selectedVehicle = useMemo(
    () => overview?.vehicles.find((vehicle) => vehicle.id === selectedVehicleId) ?? null,
    [overview?.vehicles, selectedVehicleId],
  );

  const runSeed = useCallback(async () => {
    setIsSeeding(true);
    setStatus("Executando a carga inicial da frota...");

    try {
      const response = await fetch("/api/fleet/seed", {
        method: "POST",
      });
      const payload = (await response.json()) as FleetSeedResult & { message?: string };

      if (!response.ok) {
        throw new Error(payload.message ?? "Falha ao executar a seed da frota.");
      }

      setStatus(payload.message ?? "Seed da frota executada com sucesso.");
      await loadFleetOverview();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao executar a seed.");
    } finally {
      setIsSeeding(false);
    }
  }, [loadFleetOverview]);

  const handleUploadCrlv = useCallback(
    async (file: File) => {
      if (!selectedVehicle) {
        setStatus("Selecione um veiculo da frota antes de anexar o CRLV.");
        return;
      }

      setIsUploading(true);
      setStatus(`Enviando CRLV de ${selectedVehicle.plate}...`);

      try {
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch(`/api/fleet/${selectedVehicle.id}/crlv`, {
          method: "POST",
          body: formData,
        });
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.message ?? "Falha ao anexar o CRLV.");
        }

        setStatus(payload.message ?? "CRLV anexado com sucesso.");
        await loadFleetOverview();
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Falha ao anexar o CRLV.");
      } finally {
        setIsUploading(false);
      }
    },
    [loadFleetOverview, selectedVehicle],
  );

  function onSelectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (file) {
      void handleUploadCrlv(file);
    }

    if (event.target) {
      event.target.value = "";
    }
  }

  const handleImportSpreadsheet = useCallback(
    async (file: File) => {
      setIsImporting(true);
      setStatus(`Importando ${file.name}...`);

      try {
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch("/api/fleet/import", {
          method: "POST",
          body: formData,
        });
        const payload = (await response.json()) as FleetImportResult & { message?: string };

        if (!response.ok) {
          throw new Error(payload.message ?? "Falha ao importar a planilha.");
        }

        setLastImport(payload);
        setStatus(payload.message ?? "Planilha importada com sucesso.");
        await loadFleetOverview();
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Falha ao importar a planilha.");
      } finally {
        setIsImporting(false);
      }
    },
    [loadFleetOverview],
  );

  function onSelectImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (file) {
      void handleImportSpreadsheet(file);
    }

    if (event.target) {
      event.target.value = "";
    }
  }

  const openDownload = useCallback((vehicle: FleetVehicle) => {
    window.open(`/api/fleet/${vehicle.id}/crlv`, "_blank", "noopener,noreferrer");
  }, []);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.16),_transparent_18%),linear-gradient(180deg,#020617_0%,#0f172a_45%,#020617_100%)]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <ModuleNav />

        <header className="rounded-3xl border border-white/10 bg-slate-950/70 p-6 shadow-2xl shadow-black/25 backdrop-blur-sm">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <Badge variant="secondary">Frota</Badge>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Gestao de frota com base nos CRLVs
              </h1>
              <p className="mt-3 text-sm text-slate-400 sm:text-base">
                Cadastre os veiculos oficiais, acompanhe o vencimento do licenciamento e centralize
                os documentos em PDF.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button variant="secondary" onClick={() => void loadFleetOverview()} disabled={isLoading}>
                <RefreshCw className={cn("mr-2 size-4", isLoading && "animate-spin")} />
                Atualizar
              </Button>
              <Button variant="secondary" onClick={() => void runSeed()} disabled={isSeeding || isUploading}>
                <Truck className="mr-2 size-4" />
                {isSeeding ? "Executando seed..." : "Carga inicial"}
              </Button>
              <Button
                variant="secondary"
                onClick={() => importInputRef.current?.click()}
                disabled={isImporting || isUploading || isSeeding}
              >
                <FileSpreadsheet className="mr-2 size-4" />
                {isImporting ? "Importando..." : "Importar Planilha (.xlsx)"}
              </Button>
              <Button onClick={() => crlvInputRef.current?.click()} disabled={!selectedVehicle || isUploading}>
                <Upload className="mr-2 size-4" />
                {isUploading ? "Enviando..." : "Anexar CRLV"}
              </Button>
              <input
                ref={crlvInputRef}
                type="file"
                accept=".pdf,application/pdf"
                onChange={onSelectFile}
                className="hidden"
              />
              <input
                ref={importInputRef}
                type="file"
                accept=".xlsx,.csv"
                onChange={onSelectImportFile}
                className="hidden"
              />
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-emerald-200">
            {status}
          </div>
          {lastImport ? (
            <div className="mt-4 rounded-2xl border border-sky-400/20 bg-sky-400/10 px-4 py-3 text-sm text-sky-100">
              {lastImport.message}
            </div>
          ) : null}
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            title="Veiculos cadastrados"
            value={String(overview?.totalVehicles ?? 0)}
            subtitle="Base oficial da frota"
          />
          <KpiCard
            title="CRLVs anexados"
            value={String(overview?.withCrlvCount ?? 0)}
            subtitle="Documentos disponiveis para download"
          />
          <KpiCard
            title="CRLVs pendentes"
            value={String(overview?.withoutCrlvCount ?? 0)}
            subtitle="Veiculos ainda sem PDF anexado"
          />
          <KpiCard
            title="Capacidade zero"
            value={String(overview?.zeroTankCapacityCount ?? 0)}
            subtitle="Eletricos e reboques"
          />
        </section>

        <section className="grid gap-5 lg:grid-cols-[0.7fr_1.3fr]">
          <Card className={cn(overview?.alerts.length ? "border-rose-500/30" : "border-emerald-500/20")}>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "rounded-2xl border p-3",
                    overview?.alerts.length
                      ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
                      : "border-emerald-500/20 bg-emerald-500/10 text-emerald-200",
                  )}
                >
                  {overview?.alerts.length ? <AlertTriangle className="size-5" /> : <ShieldAlert className="size-5" />}
                </div>
                <div>
                  <CardTitle>Alertas de licenciamento</CardTitle>
                  <CardDescription>
                    Veiculos com menos de 30 dias para o vencimento no calendario do Detran MS.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {overview?.alerts.length ? (
                <div className="space-y-3">
                  {overview.alerts.map((alert) => (
                    <button
                      key={alert.vehicleId}
                      type="button"
                      onClick={() => setSelectedVehicleId(alert.vehicleId)}
                      className="flex w-full items-center justify-between rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-left transition hover:bg-rose-500/15"
                    >
                      <div>
                        <p className="font-medium text-rose-100">{alert.plate}</p>
                        <p className="text-sm text-rose-200/80">{alert.brandModel}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-rose-100">{alert.daysUntilLicensing} dias</p>
                        <p className="text-xs text-rose-200/80">
                          {alert.licensingDueMonthLabel} • {formatDateLabel(alert.licensingDueDate)}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-5 text-sm text-emerald-200">
                  Nenhum veiculo entra na janela critica de 30 dias neste momento.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <CardTitle>Consulta rapida</CardTitle>
                <CardDescription>Pesquise por placa, modelo, chassi, renavam ou ano.</CardDescription>
              </div>
              <Input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar veiculo na frota..."
                className="w-full lg:max-w-sm"
              />
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Fonte</p>
                <p className="mt-2 text-lg font-semibold text-white">{overview?.source ?? "carregando"}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Veiculos filtrados</p>
                <p className="mt-2 text-lg font-semibold text-white">{filteredVehicles.length}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Selecionado</p>
                <p className="mt-2 text-lg font-semibold text-white">{selectedVehicle?.plate ?? "-"}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Documento</p>
                <p className="mt-2 text-lg font-semibold text-white">
                  {selectedVehicle?.hasCrlv ? "Disponivel" : "Pendente"}
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
          <Card>
            <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <CardTitle>Base da frota</CardTitle>
                <CardDescription>Selecione um veiculo para ver os detalhes e anexar o CRLV.</CardDescription>
              </div>
              <span className="text-sm text-slate-500">{filteredVehicles.length} veiculos exibidos</span>
            </CardHeader>
            <CardContent>
              <Table>
                <TableScroll>
                  <table className="min-w-full divide-y divide-white/10 text-sm">
                    <thead className="sticky top-0 bg-slate-950/95 backdrop-blur-sm">
                      <tr className="text-left text-slate-400">
                        <th className="px-4 py-3 font-medium">Placa</th>
                        <th className="px-4 py-3 font-medium">Modelo</th>
                        <th className="px-4 py-3 font-medium">Local</th>
                        <th className="px-4 py-3 font-medium">Status do Seguro</th>
                        <th className="px-4 py-3 font-medium">Tanque</th>
                        <th className="px-4 py-3 font-medium">Licenciamento</th>
                        <th className="px-4 py-3 font-medium">CRLV</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 bg-black/10">
                      {filteredVehicles.length ? (
                        filteredVehicles.map((vehicle) => (
                          <tr
                            key={vehicle.id}
                            className={cn(
                              "cursor-pointer text-slate-200 transition hover:bg-white/[0.03]",
                              selectedVehicleId === vehicle.id && "bg-sky-500/10",
                              vehicle.isLicensingDueSoon && "bg-rose-500/5",
                            )}
                            onClick={() => setSelectedVehicleId(vehicle.id)}
                          >
                            <td className="whitespace-nowrap px-4 py-3 font-medium">{vehicle.plate}</td>
                            <td className="px-4 py-3 text-slate-300">{vehicle.brandModel}</td>
                            <td className="whitespace-nowrap px-4 py-3 text-slate-300">{vehicle.location ?? "-"}</td>
                            <td className="whitespace-nowrap px-4 py-3 text-slate-300">
                              {vehicle.insuranceStatus ?? "-"}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3">{vehicle.tankCapacityLiters} L</td>
                            <td className="whitespace-nowrap px-4 py-3">
                              <div className="flex flex-col">
                                <span>{vehicle.licensingDueMonthLabel}</span>
                                <span
                                  className={cn(
                                    "text-xs",
                                    vehicle.isLicensingDueSoon ? "text-rose-300" : "text-slate-500",
                                  )}
                                >
                                  {formatDateLabel(vehicle.licensingDueDate)}
                                </span>
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3">
                              <span
                                className={cn(
                                  "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium",
                                  vehicle.hasCrlv
                                    ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
                                    : "border-amber-400/20 bg-amber-400/10 text-amber-200",
                                )}
                              >
                                {vehicle.hasCrlv ? "Anexado" : "Pendente"}
                              </span>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={7} className="px-4 py-14 text-center text-slate-500">
                            {isLoading ? "Carregando..." : "Nenhum veiculo encontrado para a busca atual."}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </TableScroll>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Detalhes do veiculo</CardTitle>
              <CardDescription>
                Painel para conferencia cadastral, upload do PDF e download rapido do CRLV.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {selectedVehicle ? (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-slate-500">Placa</p>
                        <p className="mt-2 text-2xl font-semibold text-white">{selectedVehicle.plate}</p>
                      </div>
                      <Badge variant={selectedVehicle.isLicensingDueSoon ? "secondary" : "default"}>
                        {selectedVehicle.isLicensingDueSoon
                          ? `${selectedVehicle.daysUntilLicensing} dias para vencer`
                          : "Licenciamento em dia"}
                      </Badge>
                    </div>
                    <p className="mt-3 text-sm text-slate-300">{selectedVehicle.brandModel}</p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Chassi</p>
                      <p className="mt-2 break-all text-sm text-white">{selectedVehicle.chassis}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Renavam</p>
                      <p className="mt-2 text-sm text-white">{selectedVehicle.renavam}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Local</p>
                      <p className="mt-2 text-sm text-white">{selectedVehicle.location ?? "Nao informado"}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Status do seguro</p>
                      <p className="mt-2 text-sm text-white">{selectedVehicle.insuranceStatus ?? "Nao informado"}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Ano fabricacao/modelo</p>
                      <p className="mt-2 text-sm text-white">{selectedVehicle.manufacturingModelYear}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Capacidade do tanque</p>
                      <p className="mt-2 text-sm text-white">{selectedVehicle.tankCapacityLiters} litros</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Mes do licenciamento</p>
                      <p className="mt-2 text-sm text-white">{selectedVehicle.licensingDueMonthLabel}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Data limite estimada</p>
                      <p className="mt-2 text-sm text-white">{formatDateLabel(selectedVehicle.licensingDueDate)}</p>
                    </div>
                  </div>

                  <div
                    className={cn(
                      "rounded-2xl border px-4 py-4",
                      selectedVehicle.isLicensingDueSoon
                        ? "border-rose-500/30 bg-rose-500/10"
                        : "border-white/10 bg-black/20",
                    )}
                  >
                    <p className="text-xs uppercase tracking-wide text-slate-500">Status do licenciamento</p>
                    <p
                      className={cn(
                        "mt-2 text-sm font-medium",
                        selectedVehicle.isLicensingDueSoon ? "text-rose-200" : "text-emerald-200",
                      )}
                    >
                      {selectedVehicle.isLicensingDueSoon
                        ? `Alerta vermelho: vencimento em ${selectedVehicle.daysUntilLicensing} dias.`
                        : `Sem alerta critico. Proximo vencimento em ${selectedVehicle.daysUntilLicensing} dias.`}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Documento CRLV</p>
                    <div className="mt-3 flex flex-wrap gap-3">
                      <Button onClick={() => crlvInputRef.current?.click()} disabled={isUploading}>
                        <FileUp className="mr-2 size-4" />
                        {selectedVehicle.hasCrlv ? "Substituir PDF" : "Anexar PDF"}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => openDownload(selectedVehicle)}
                        disabled={!selectedVehicle.hasCrlv}
                      >
                        <Download className="mr-2 size-4" />
                        Baixar CRLV
                      </Button>
                    </div>
                    <p className="mt-3 text-sm text-slate-400">
                      {selectedVehicle.hasCrlv
                        ? `Arquivo atual: ${selectedVehicle.crlvFileName ?? "PDF anexado"}`
                        : "Nenhum documento anexado para este veiculo."}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-14 text-center text-sm text-slate-500">
                  Selecione um veiculo na lista para ver os detalhes.
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
