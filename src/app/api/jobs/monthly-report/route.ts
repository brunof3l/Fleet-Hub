import { getCronSecret } from "@/lib/env";
import {
  cleanupRetention,
  getPreviousMonthRange,
  getRecordsByPeriod,
  getReportLogByMonth,
  upsertReportLog,
} from "@/lib/fleet-service";
import { buildMonthlyReportWorkbook, sendMonthlyReportEmail } from "@/lib/reporting";

export const runtime = "nodejs";

function isAuthorized(request: Request): boolean {
  const secret = getCronSecret();
  if (!secret) {
    return true;
  }

  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ message: "Nao autorizado." }, { status: 401 });
  }

  try {
    const payload = await request.json().catch(() => ({}));
    const range = payload?.reportMonth
      ? {
          reportMonth: String(payload.reportMonth),
          periodStart: String(payload.periodStart ?? payload.reportMonth),
          periodEnd: String(payload.periodEnd ?? payload.reportMonth),
        }
      : getPreviousMonthRange();

    const existing = await getReportLogByMonth(range.reportMonth);
    if (existing?.status === "sent") {
      return Response.json({
        message: `O relatorio de ${range.reportMonth} ja foi enviado anteriormente.`,
        reportMonth: range.reportMonth,
      });
    }

    const records = await getRecordsByPeriod(range.periodStart, range.periodEnd);
    const workbook = await buildMonthlyReportWorkbook({
      records,
      reportMonth: range.reportMonth,
      periodStart: range.periodStart,
      periodEnd: range.periodEnd,
    });

    const sentTo = await sendMonthlyReportEmail({
      fileName: workbook.fileName,
      fileBuffer: workbook.buffer,
      reportMonth: range.reportMonth,
      rowCount: records.length,
    });

    await upsertReportLog({
      report_month: range.reportMonth,
      period_start: range.periodStart,
      period_end: range.periodEnd,
      file_name: workbook.fileName,
      status: "sent",
      sent_to: sentTo,
      rows_count: records.length,
      sent_at: new Date().toISOString(),
      error_message: null,
    });

    const cleanup = await cleanupRetention(60);

    return Response.json({
      reportMonth: range.reportMonth,
      fileName: workbook.fileName,
      sentTo,
      rows: records.length,
      deletedFuelRows: cleanup.deletedFuelRows,
    });
  } catch (error) {
    const range = getPreviousMonthRange();
    const message =
      error instanceof Error ? error.message : "Falha ao gerar e enviar relatorio mensal.";

    await upsertReportLog({
      report_month: range.reportMonth,
      period_start: range.periodStart,
      period_end: range.periodEnd,
      file_name: `relatorio-frota-${range.reportMonth}.xlsx`,
      status: "failed",
      sent_to: "nao-enviado",
      rows_count: 0,
      sent_at: null,
      error_message: message,
    }).catch(() => undefined);

    return Response.json({ message }, { status: 500 });
  }
}
