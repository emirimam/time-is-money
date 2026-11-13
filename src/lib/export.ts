import type { ReportRow, Report } from "./report";
import { formatMinutes, hhmm, isoDate } from "./time";

/** Column layout matches the original "Time Sheet" spreadsheet. */
function columns(includePerson: boolean) {
  return [
    "Date",
    ...(includePerson ? ["Person"] : []),
    "Work",
    "Building",
    "Scope",
    "Start",
    "Stop",
    "Time total",
    "Time",
    "Rate",
    "Cost",
  ];
}

function rowValues(r: ReportRow, tz: string, includePerson: boolean) {
  return [
    isoDate(r.start, tz),
    ...(includePerson ? [r.person] : []),
    r.work,
    r.building,
    r.scope,
    hhmm(r.start, tz),
    hhmm(r.end, tz),
    formatMinutes(r.minutes),
    Number((r.minutes / 60).toFixed(2)),
    r.rate,
    r.cost,
  ];
}

function csvCell(v: string | number) {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function reportToCsv(report: Report, tz: string) {
  const includePerson = report.byPerson.length > 1;
  const lines = [columns(includePerson).join(",")];
  for (const r of report.rows) lines.push(rowValues(r, tz, includePerson).map(csvCell).join(","));
  const blanks = includePerson ? 7 : 6;
  lines.push(
    ["Total", ...Array(blanks).fill(""), (report.total.minutes / 60).toFixed(2), "", report.total.cost.toFixed(2)]
      .map(csvCell)
      .join(","),
  );
  // BOM so Excel opens UTF-8 correctly.
  return "﻿" + lines.join("\r\n");
}

export async function reportToXlsx(
  report: Report,
  tz: string,
  sheetName: string,
  currency: string,
): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Time is Money";
  const ws = wb.addWorksheet(sheetName.slice(0, 31));
  const includePerson = report.byPerson.length > 1;
  const cols = columns(includePerson);

  ws.columns = cols.map((header) => ({
    header,
    key: header,
    width: header === "Work" ? 40 : header === "Building" ? 22 : header === "Person" ? 20 : 12,
  }));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];

  for (const r of report.rows) {
    const values = rowValues(r, tz, includePerson);
    const [y, m, d] = (values[0] as string).split("-").map(Number);
    values[0] = new Date(Date.UTC(y, m - 1, d)) as unknown as string;
    ws.addRow(values);
  }

  const moneyFmt = `#,##0.00 "${currency}"`;
  ws.getColumn("Date").numFmt = "yyyy-mm-dd";
  ws.getColumn("Time").numFmt = "0.00";
  ws.getColumn("Rate").numFmt = moneyFmt;
  ws.getColumn("Cost").numFmt = moneyFmt;

  const first = 2;
  const last = report.rows.length + 1;
  const timeCol = ws.getColumn("Time").letter;
  const costCol = ws.getColumn("Cost").letter;
  const totalRow = ws.addRow([]);
  totalRow.getCell(1).value = "Total";
  if (report.rows.length) {
    totalRow.getCell(timeCol).value = {
      formula: `SUM(${timeCol}${first}:${timeCol}${last})`,
      result: Number((report.total.minutes / 60).toFixed(2)),
    };
    totalRow.getCell(costCol).value = {
      formula: `SUM(${costCol}${first}:${costCol}${last})`,
      result: report.total.cost,
    };
  }
  totalRow.font = { bold: true };

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
