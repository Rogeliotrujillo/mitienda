import { jsPDF } from "jspdf";
import {
  Movement,
  Product,
  formatBalboas,
  formatQuantity,
  getStockStatus,
} from "../types";

export type ReportPeriod = "day" | "week" | "month";

export function getPeriodLabel(period: ReportPeriod): string {
  switch (period) {
    case "day":
      return "Reporte del día";
    case "week":
      return "Reporte de la semana";
    case "month":
      return "Reporte del mes";
  }
}

export function isSameDay(dateA: Date, dateB: Date): boolean {
  return (
    dateA.getFullYear() === dateB.getFullYear() &&
    dateA.getMonth() === dateB.getMonth() &&
    dateA.getDate() === dateB.getDate()
  );
}

export function isWithinLastDays(date: Date, days: number, now: Date): boolean {
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );
  const startWindow = new Date(startOfToday);
  startWindow.setDate(startWindow.getDate() - (days - 1));
  return date >= startWindow && date <= now;
}

export function filterMovementsByPeriod(
  movements: Movement[],
  period: ReportPeriod,
  now = new Date()
): Movement[] {
  return movements.filter((m) => {
    const d = new Date(m.timestamp);
    if (period === "day") {
      return isSameDay(d, now);
    }
    if (period === "week") {
      return isWithinLastDays(d, 7, now);
    }
    return isWithinLastDays(d, 30, now);
  });
}

function getStatusText(product: Product): string {
  const status = getStockStatus(product);
  if (status === "red") return "Agotado";
  if (status === "yellow") return "Queda poco";
  return "Suficiente";
}

function escapeCSV(val: string | number): string {
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function downloadCSV(
  period: ReportPeriod,
  products: Product[],
  movements: Movement[]
): void {
  const filtered = filterMovementsByPeriod(movements, period);
  const sales = filtered.filter((m) => m.type === "sale");
  const totalSold = sales.reduce((sum, m) => sum + m.amountBalboas, 0);

  const lines: string[] = [];
  lines.push("Mi tienda - Mercado Público de Penonomé");
  lines.push(`${getPeriodLabel(period)},Generado: ${new Date().toLocaleString("es-PA")}`);
  lines.push(`Total vendido,${formatBalboas(totalSold)}`);
  lines.push("");
  lines.push("MOVIMIENTOS DEL PERIODO");
  lines.push("Fecha,Hora,Tipo,Producto,Cantidad,Unidad,Monto (B/.),Registro");

  if (filtered.length === 0) {
    lines.push("Sin movimientos registrados en este periodo,,,,,,,");
  } else {
    for (const m of filtered) {
      const d = new Date(m.timestamp);
      lines.push(
        [
          escapeCSV(d.toLocaleDateString("es-PA")),
          escapeCSV(
            d.toLocaleTimeString("es-PA", {
              hour: "2-digit",
              minute: "2-digit",
            })
          ),
          escapeCSV(m.type === "sale" ? "Venta" : "Entrada"),
          escapeCSV(m.productName),
          escapeCSV(formatQuantity(m.quantity)),
          escapeCSV(m.unit),
          escapeCSV(m.amountBalboas.toFixed(2)),
          escapeCSV(m.source === "voice" ? "Por voz" : "Manual"),
        ].join(",")
      );
    }
  }

  lines.push("");
  lines.push("ESTADO ACTUAL DEL STOCK");
  lines.push("Producto,Cantidad,Unidad,Estado,Precio unitario (B/.)");
  for (const p of products) {
    lines.push(
      [
        escapeCSV(p.name),
        escapeCSV(formatQuantity(p.quantity)),
        escapeCSV(p.unit),
        escapeCSV(getStatusText(p)),
        escapeCSV(p.pricePerUnit.toFixed(2)),
      ].join(",")
    );
  }

  const csvContent = "\uFEFF" + lines.join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const dateTag = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `mi-tienda-${period}-${dateTag}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadPDF(
  period: ReportPeriod,
  products: Product[],
  movements: Movement[]
): void {
  const filtered = filterMovementsByPeriod(movements, period);
  const sales = filtered.filter((m) => m.type === "sale");
  const entries = filtered.filter((m) => m.type === "entry");
  const totalSold = sales.reduce((sum, m) => sum + m.amountBalboas, 0);

  const redCount = products.filter((p) => getStockStatus(p) === "red").length;
  const yellowCount = products.filter(
    (p) => getStockStatus(p) === "yellow"
  ).length;
  const greenCount = products.filter(
    (p) => getStockStatus(p) === "green"
  ).length;

  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 16;
  let y = 18;

  const ensureSpace = (needed: number) => {
    if (y + needed > 265) {
      doc.addPage();
      y = 18;
    }
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(15, 107, 67);
  doc.text("Mi tienda — Mercado Público de Penonomé", margin, y);
  y += 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(20, 26, 22);
  doc.text(getPeriodLabel(period), margin, y);
  y += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(71, 82, 74);
  doc.text(`Generado el: ${new Date().toLocaleString("es-PA")}`, margin, y);
  y += 8;

  // Summary box
  doc.setDrawColor(200, 210, 200);
  doc.setFillColor(244, 247, 245);
  doc.roundedRect(margin, y, pageWidth - margin * 2, 22, 2, 2, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(20, 26, 22);
  doc.text(`Total vendido: ${formatBalboas(totalSold)}`, margin + 5, y + 8);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(
    `Ventas registradas: ${sales.length}   |   Entradas de stock: ${entries.length}`,
    margin + 5,
    y + 15
  );
  y += 30;

  // Stock status summary
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Resumen actual del stock", margin, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(
    `Agotado (Rojo): ${redCount}   |   Queda poco (Amarillo): ${yellowCount}   |   Suficiente (Verde): ${greenCount}`,
    margin,
    y
  );
  y += 9;

  // Movements table
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Movimientos del periodo", margin, y);
  y += 6;

  doc.setFontSize(9.5);
  doc.setFillColor(232, 237, 233);
  doc.rect(margin, y - 4, pageWidth - margin * 2, 7, "F");
  doc.text("Fecha", margin + 2, y);
  doc.text("Tipo", margin + 30, y);
  doc.text("Producto", margin + 52, y);
  doc.text("Cantidad", margin + 122, y);
  doc.text("Monto", margin + 158, y);
  y += 6;

  doc.setFont("helvetica", "normal");
  if (filtered.length === 0) {
    doc.text("No hay movimientos registrados en este periodo.", margin + 2, y);
    y += 7;
  } else {
    for (const m of filtered) {
      ensureSpace(7);
      const d = new Date(m.timestamp);
      const dateStr = d.toLocaleDateString("es-PA");
      const typeStr = m.type === "sale" ? "Venta" : "Entrada";
      const prodStr =
        m.productName.length > 32
          ? m.productName.slice(0, 30) + "…"
          : m.productName;
      doc.text(dateStr, margin + 2, y);
      doc.text(typeStr, margin + 30, y);
      doc.text(prodStr, margin + 52, y);
      doc.text(`${formatQuantity(m.quantity)} ${m.unit}`, margin + 122, y);
      doc.text(
        m.amountBalboas > 0 ? formatBalboas(m.amountBalboas) : "—",
        margin + 158,
        y
      );
      y += 6;
    }
  }

  y += 6;
  ensureSpace(20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Inventario actual", margin, y);
  y += 6;

  doc.setFontSize(9.5);
  doc.setFillColor(232, 237, 233);
  doc.rect(margin, y - 4, pageWidth - margin * 2, 7, "F");
  doc.text("Producto", margin + 2, y);
  doc.text("Disponible", margin + 96, y);
  doc.text("Estado", margin + 148, y);
  y += 6;

  doc.setFont("helvetica", "normal");
  for (const p of products) {
    ensureSpace(7);
    doc.text(p.name, margin + 2, y);
    doc.text(`${formatQuantity(p.quantity)} ${p.unit}`, margin + 96, y);
    doc.text(getStatusText(p), margin + 148, y);
    y += 6;
  }

  const dateTag = new Date().toISOString().slice(0, 10);
  doc.save(`mi-tienda-${period}-${dateTag}.pdf`);
}
