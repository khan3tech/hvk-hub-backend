// Payslip PDF rendering (025-white-labeling FR-006: the organization's logo and color).
import PDFDocument from "pdfkit";
import { logger } from "../../lib/logger.js";

export interface PayslipBranding {
  organizationName: string;
  primaryColor: string;
  logo: Buffer | null;
}

export interface PayslipForPdf {
  id: string;
  periodMonth: number;
  periodYear: number;
  earnings: unknown;
  deductions: unknown;
  statutoryDeductions: unknown;
  netPay: number;
  currency: string | null;
  generatedAt: Date;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function lines(value: unknown): Array<[string, number]> {
  if (Array.isArray(value)) {
    return value.map((l: { name?: string; amount?: number }) => [String(l.name ?? "Item"), Number(l.amount ?? 0)]);
  }
  if (value && typeof value === "object") return Object.entries(value as Record<string, number>).map(([k, v]) => [k, Number(v)]);
  return [];
}

export function renderPayslipPdf(payslip: PayslipForPdf, employee: { name: string; email: string }, branding: PayslipBranding): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50, info: { Title: `Payslip ${MONTHS[payslip.periodMonth - 1]} ${payslip.periodYear}`, Author: branding.organizationName } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const money = (n: number) => `${payslip.currency ? `${payslip.currency} ` : ""}${n.toFixed(2)}`;
    const width = doc.page.width - 100;

    // Header band in the brand color, logo at the left.
    doc.rect(0, 0, doc.page.width, 90).fill(branding.primaryColor);
    let textX = 50;
    if (branding.logo) {
      try {
        doc.image(branding.logo, 50, 20, { fit: [120, 50] });
        textX = 185;
      } catch (err) {
        logger.warn({ err }, "payslip logo could not be embedded");
      }
    }
    doc.fillColor("#FFFFFF").fontSize(18).text(branding.organizationName, textX, 28, { width: doc.page.width - textX - 50 });
    doc.fontSize(11).text(`Payslip — ${MONTHS[payslip.periodMonth - 1]} ${payslip.periodYear}`, textX, 54);

    doc.fillColor("#111111").fontSize(11).text(employee.name, 50, 115).fillColor("#555555").text(employee.email);
    doc.moveDown(1.5);

    const section = (title: string, rows: Array<[string, number]>) => {
      if (rows.length === 0) return;
      doc.fillColor(branding.primaryColor).fontSize(12).text(title, 50);
      doc.moveDown(0.3);
      for (const [name, amount] of rows) {
        const y = doc.y;
        doc.fillColor("#111111").fontSize(10).text(name, 50, y, { width: width - 150 });
        doc.text(money(amount), 50 + width - 150, y, { width: 150, align: "right" });
      }
      doc.moveDown(1);
    };
    section("Earnings", lines(payslip.earnings));
    section("Deductions", lines(payslip.deductions));
    section("Statutory deductions", lines(payslip.statutoryDeductions));

    const y = doc.y + 4;
    doc.moveTo(50, y).lineTo(50 + width, y).strokeColor(branding.primaryColor).stroke();
    doc.fillColor("#111111").fontSize(13).text("Net pay", 50, y + 10, { width: width - 150 });
    doc.text(money(payslip.netPay), 50 + width - 150, y + 10, { width: 150, align: "right" });
    doc.fillColor("#777777").fontSize(8).text(`Generated ${payslip.generatedAt.toISOString().slice(0, 10)} · ${payslip.id}`, 50, doc.page.height - 70);
    doc.end();
  });
}
