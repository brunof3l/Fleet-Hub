"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { RefreshCw, UserPlus } from "lucide-react";

import { ModuleNav } from "@/components/module-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableScroll } from "@/components/ui/table";
import type { AdminUserView, UserRole } from "@/lib/auth";

const initialForm = {
  nome: "",
  email: "",
  senha: "",
  role: "user" as UserRole,
};

function formatDateTime(value: string | null): string {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

export default function AdminClient({ currentUserEmail }: { currentUserEmail: string }) {
  const [users, setUsers] = useState<AdminUserView[]>([]);
  const [form, setForm] = useState(initialForm);
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/admin/users", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.message ?? "Falha ao carregar usuarios.");
      }
      setUsers(payload.users as AdminUserView[]);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao carregar usuarios.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setStatus("");
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.message ?? "Falha ao criar usuario.");
      }
      setStatus(payload.message ?? "Usuario criado.");
      setForm(initialForm);
      await loadUsers();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao criar usuario.");
    } finally {
      setIsSaving(false);
    }
  }

  async function patchUser(user: AdminUserView, body: Record<string, unknown>, confirmMessage?: string) {
    if (confirmMessage && !window.confirm(confirmMessage)) {
      return;
    }
    setBusyId(user.id);
    setStatus("");
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.message ?? "Falha ao atualizar usuario.");
      }
      setStatus(payload.message ?? "Usuario atualizado.");
      await loadUsers();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao atualizar usuario.");
    } finally {
      setBusyId(null);
    }
  }

  async function removeUser(user: AdminUserView) {
    if (!window.confirm(`Remover o usuario ${user.email}? Esta acao nao pode ser desfeita.`)) {
      return;
    }
    setBusyId(user.id);
    setStatus("");
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.message ?? "Falha ao remover usuario.");
      }
      setStatus(payload.message ?? "Usuario removido.");
      await loadUsers();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao remover usuario.");
    } finally {
      setBusyId(null);
    }
  }

  function resetPassword(user: AdminUserView) {
    const novaSenha = window.prompt(`Nova senha para ${user.email} (minimo 8 caracteres):`);
    if (novaSenha === null) {
      return;
    }
    if (novaSenha.length < 8) {
      setStatus("A senha deve ter ao menos 8 caracteres.");
      return;
    }
    void patchUser(user, { novaSenha });
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(34,197,94,0.18),_transparent_20%),linear-gradient(180deg,#020617_0%,#0f172a_45%,#020617_100%)]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <ModuleNav />

        <header className="rounded-3xl border border-white/10 bg-slate-950/70 p-6 shadow-2xl shadow-black/25 backdrop-blur-sm">
          <Badge>Admin</Badge>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Gestao de usuarios
          </h1>
          <p className="mt-3 text-sm text-slate-400 sm:text-base">
            Cadastre, ative/desative, redefina senha e remova os acessos ao Fleet Hub.
          </p>
        </header>

        <section className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
          <Card>
            <CardHeader>
              <CardTitle>Novo usuario</CardTitle>
              <CardDescription>O usuario recebera acesso a todos os modulos.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="grid gap-4" onSubmit={createUser}>
                <Input
                  placeholder="Nome"
                  value={form.nome}
                  onChange={(event) => setForm((current) => ({ ...current, nome: event.target.value }))}
                />
                <Input
                  type="email"
                  placeholder="E-mail"
                  value={form.email}
                  onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                />
                <Input
                  type="password"
                  placeholder="Senha (minimo 8 caracteres)"
                  value={form.senha}
                  onChange={(event) => setForm((current) => ({ ...current, senha: event.target.value }))}
                />
                <Select
                  value={form.role}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, role: event.target.value as UserRole }))
                  }
                >
                  <option value="user">Usuario (acesso aos modulos)</option>
                  <option value="admin">Administrador (gerencia usuarios)</option>
                </Select>
                <Button type="submit" disabled={isSaving}>
                  <UserPlus className="mr-2 size-4" />
                  {isSaving ? "Salvando..." : "Criar usuario"}
                </Button>
                {status ? <p className="text-sm text-emerald-300">{status}</p> : null}
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <div>
                <CardTitle>Usuarios cadastrados</CardTitle>
                <CardDescription>{users.length} usuario(s).</CardDescription>
              </div>
              <Button variant="secondary" size="sm" onClick={() => void loadUsers()} disabled={isLoading}>
                <RefreshCw className={isLoading ? "size-4 animate-spin" : "size-4"} />
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableScroll>
                  <table className="min-w-full divide-y divide-white/10 text-sm">
                    <thead className="sticky top-0 bg-slate-950/95 backdrop-blur-sm">
                      <tr className="text-left text-slate-400">
                        <th className="px-4 py-3 font-medium">Nome</th>
                        <th className="px-4 py-3 font-medium">E-mail</th>
                        <th className="px-4 py-3 font-medium">Papel</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium">Ultimo login</th>
                        <th className="px-4 py-3 font-medium text-right">Acoes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 bg-black/10">
                      {users.length ? (
                        users.map((user) => (
                          <tr key={user.id} className="text-slate-200 transition hover:bg-white/[0.03]">
                            <td className="whitespace-nowrap px-4 py-3">
                              {user.nome}
                              {user.email === currentUserEmail ? (
                                <span className="ml-2 text-xs text-emerald-300">(voce)</span>
                              ) : null}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-slate-400">{user.email}</td>
                            <td className="whitespace-nowrap px-4 py-3">
                              {user.role === "admin" ? "Administrador" : "Usuario"}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3">
                              <span
                                className={
                                  user.ativo
                                    ? "inline-flex items-center rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200"
                                    : "inline-flex items-center rounded-full border border-rose-400/20 bg-rose-400/10 px-3 py-1 text-xs text-rose-200"
                                }
                              >
                                {user.ativo ? "Ativo" : "Inativo"}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-slate-400">
                              {formatDateTime(user.ultimoLogin)}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex justify-end gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={busyId === user.id}
                                  onClick={() =>
                                    void patchUser(
                                      user,
                                      { ativo: !user.ativo },
                                      user.ativo ? `Desativar ${user.email}?` : undefined,
                                    )
                                  }
                                >
                                  {user.ativo ? "Desativar" : "Ativar"}
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={busyId === user.id}
                                  onClick={() => resetPassword(user)}
                                >
                                  Senha
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={busyId === user.id || user.email === currentUserEmail}
                                  onClick={() => void removeUser(user)}
                                  className="border-rose-500/30 text-rose-200 hover:bg-rose-500/10 hover:text-rose-100 disabled:border-white/10 disabled:text-slate-500"
                                >
                                  Remover
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                            {isLoading ? "Carregando..." : "Nenhum usuario cadastrado."}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </TableScroll>
              </Table>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
