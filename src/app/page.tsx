import Link from "next/link";
import { BarChart3, Fuel, Gauge } from "lucide-react";

import { ModuleNav } from "@/components/module-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const modules = [
  {
    href: "/combustivel",
    title: "Combustivel",
    description: "Upload de planilhas, filtros, graficos, indicadores e base integrada com Neon.",
    icon: Fuel,
  },
  {
    href: "/velocidade",
    title: "Velocidade",
    description: "Leitura de relatorios XLSX, deteccao de ocorrencias e cruzamento com a frota.",
    icon: Gauge,
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(34,197,94,0.16),_transparent_20%),linear-gradient(180deg,#020617_0%,#0f172a_45%,#020617_100%)]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <ModuleNav />

        <header className="rounded-3xl border border-white/10 bg-slate-950/70 p-6 shadow-2xl shadow-black/25 backdrop-blur-sm">
          <Badge>Fleet Hub</Badge>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-5xl">
            Central unificada da frota
          </h1>
          <p className="mt-3 max-w-3xl text-sm text-slate-400 sm:text-base">
            Escolha o modulo para analisar abastecimento ou velocidade, mantendo a mesma base visual
            e o mesmo contexto operacional.
          </p>
        </header>

        <section className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          <Card>
            <CardHeader>
              <CardTitle>Modulos Integrados</CardTitle>
              <CardDescription>Os dois fluxos trabalham no mesmo painel.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              {modules.map((module) => {
                const Icon = module.icon;

                return (
                  <Card key={module.href} className="bg-white/[0.03]">
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between">
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                          <Icon className="size-5 text-emerald-300" />
                        </div>
                        <Badge variant="secondary">Modulo</Badge>
                      </div>
                      <h2 className="mt-4 text-xl font-semibold text-white">{module.title}</h2>
                      <p className="mt-2 text-sm text-slate-400">{module.description}</p>
                      <Button asChild className="mt-5 w-full">
                        <Link href={module.href}>Abrir {module.title}</Link>
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Como se comunicam</CardTitle>
              <CardDescription>Velocidade aproveita o contexto da base de combustivel.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-center gap-2 text-white">
                  <BarChart3 className="size-4 text-sky-300" />
                  <span className="font-medium">Mesma frota</span>
                </div>
                <p className="mt-2 text-sm text-slate-400">
                  O modulo de velocidade cruza os veiculos do relatorio com os veiculos existentes no
                  modulo de combustivel.
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-center gap-2 text-white">
                  <Fuel className="size-4 text-emerald-300" />
                  <span className="font-medium">Combustivel</span>
                </div>
                <p className="mt-2 text-sm text-slate-400">
                  Mantem upload, filtros, indicadores, historico e exportacao da operacao.
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-center gap-2 text-white">
                  <Gauge className="size-4 text-amber-300" />
                  <span className="font-medium">Velocidade</span>
                </div>
                <p className="mt-2 text-sm text-slate-400">
                  Detecta ocorrencias acima de 130 km/h e destaca veiculos ainda sem vinculo na base.
                </p>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
