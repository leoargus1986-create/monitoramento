import { jsPDF } from "jspdf";

interface ExportPdfOptions {
  aiReport: string;
  scenarioName?: string;
  userEmail?: string;
}

export const exportToPDF = ({ aiReport, scenarioName, userEmail }: ExportPdfOptions) => {
  if (!aiReport) return;

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const marginX = 20;
  let yCursor = 35;
  let pageNumber = 1;

  const drawHeader = (pNum: number) => {
    // Top colored stripe (CTTU brand)
    doc.setFillColor(30, 41, 59); // Slate-800
    doc.rect(0, 0, 210, 18, "F");

    doc.setFillColor(79, 70, 229); // Accent indigo-600
    doc.rect(0, 18, 210, 2, "F");

    // Header branding
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text("CTTU RECIFE - AUTARQUIA DE TRÂNSITO E TRANSPORTE URBANO", marginX, 11);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(226, 232, 240);
    doc.text("PAINEL OPERACIONAL DE GEOPROCESSAMENTO E PLANEJAMENTO PREDITIVO", marginX, 15);

    // Page number on right
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text(`PÁG. ${pNum}`, 190, 11, { align: "right" });
  };

  const drawFooter = (pNum: number) => {
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setLineWidth(0.3);
    doc.line(marginX, 282, 190, 282);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text("© 2026 CTTU Recife - Documento de Circulação Interna e Uso Exclusivo da Equipe Executiva.", marginX, 288);
  };

  // Draw first page header
  drawHeader(pageNumber);

  // Title of the Report
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text("DIRETRIZES TÉCNICAS RECOMENDADAS", marginX, yCursor);
  yCursor += 7;

  // Scenario and Timestamp meta
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105); // slate-600
  const scenarioLabel = scenarioName ? `Cenário Simulado: ${scenarioName}` : "Análise Operacional Personalizada";
  doc.text(scenarioLabel, marginX, yCursor);
  yCursor += 5;

  const dateStr = new Date().toLocaleString("pt-BR", {
    timeZone: "America/Recife",
    dateStyle: "medium",
    timeStyle: "short",
  });
  const metaText = `Data de emissão: ${dateStr} (Fuso Recife) | Operador: ${userEmail || "leo.argus1986@gmail.com"}`;
  doc.text(metaText, marginX, yCursor);
  yCursor += 8;

  // Decorative border separating header metadata
  doc.setDrawColor(199, 210, 254); // indigo-200
  doc.setLineWidth(0.5);
  doc.line(marginX, yCursor, 190, yCursor);
  yCursor += 10;

  // Parse lines of the aiReport selectably
  const rawLines = aiReport.split("\n");

  rawLines.forEach((rawLine) => {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      yCursor += 4; // empty line spacing
      return;
    }

    // Check if it is a markdown table row
    if (trimmed.startsWith("|")) {
      // Ignore separator rows (e.g. |---|---|)
      if (trimmed.includes("---")) {
        doc.setDrawColor(226, 232, 240); // slate-200
        doc.setLineWidth(0.2);
        doc.line(marginX, yCursor, 190, yCursor);
        yCursor += 2;
        return;
      }

      // Extract cells: split by | and drop outside empty items
      const rawCols = trimmed.split("|").map(c => c.trim());
      // A valid table row has leading and trailing pipes, so slice accordingly
      const cells = rawCols.slice(1, rawCols.length - 1);
      if (cells.length === 0) return;

      const colCount = cells.length;
      // Define proportional widths for common A4 table configurations:
      // if 3 columns: Category (80mm) | Value (45mm) | Variation (45mm)
      // otherwise, default to equal columns
      let colWidths: number[] = [];
      if (colCount === 3) {
        colWidths = [75, 45, 50];
      } else {
        const eqWidth = 170 / colCount;
        colWidths = Array(colCount).fill(eqWidth);
      }

      // Detect if this is a header row (e.g. contains strong markdown indicators, or is the first row)
      const isHeader = trimmed.includes("**") || rawLine.toLowerCase().includes("categoria") || rawLine.toLowerCase().includes("métrica") || rawLine.toLowerCase().includes("valor");

      // Check page height limit before drawing table row background and text
      if (yCursor > 260) {
        drawFooter(pageNumber);
        doc.addPage();
        pageNumber++;
        drawHeader(pageNumber);
        yCursor = 32;
      }

      if (isHeader) {
        // Draw elegant slate header background
        doc.setFillColor(241, 245, 249); // slate-100
        doc.rect(marginX, yCursor - 4, 170, 7, "F");
        doc.setFont("helvetica", "bold");
        doc.setTextColor(15, 23, 42); // slate-900
        doc.setFontSize(8.5);
      } else {
        doc.setFont("helvetica", "normal");
        doc.setTextColor(71, 85, 105); // slate-600
        doc.setFontSize(8);
      }

      // Draw cell values
      let currentX = marginX;
      cells.forEach((cell, i) => {
        // Strip markdown bold markers within cells
        const cleanedCell = cell.replace(/\*\*/g, "");
        const cellWidth = colWidths[i] || (170 / colCount);
        
        // Split cell text if it overflows its specific column allocation
        const wrappedCell: string[] = doc.splitTextToSize(cleanedCell, cellWidth - 4);
        wrappedCell.forEach((cLine, idx) => {
          doc.text(cLine, currentX + 2, yCursor + (idx * 3.5));
        });
        
        currentX += cellWidth;
      });

      // Calculate maximum height occupied by this row
      let maxCellLines = 1;
      cells.forEach((cell, i) => {
        const cleanedCell = cell.replace(/\*/g, "");
        const cellWidth = colWidths[i] || (170 / colCount);
        const linesCount = doc.splitTextToSize(cleanedCell, cellWidth - 4).length;
        if (linesCount > maxCellLines) maxCellLines = linesCount;
      });

      yCursor += (maxCellLines * 3.5) + 2;

      // Draw bottom row divider border
      doc.setDrawColor(241, 245, 249); // slate-100
      doc.setLineWidth(0.15);
      doc.line(marginX, yCursor - 1, 190, yCursor - 1);
      return;
    }

    let fontSize = 9.5;
    let isBold = false;
    let isItalic = false;
    let fontColor = [51, 65, 85]; // default slate-700
    let textToRender = trimmed;
    let indentX = 0;

    // Check heading structures
    if (trimmed.startsWith("# ")) {
      fontSize = 13;
      isBold = true;
      fontColor = [15, 23, 42]; // slate-900
      textToRender = trimmed.replace(/^#\s+/, "");
      yCursor += 3;
    } else if (trimmed.startsWith("## ")) {
      fontSize = 11;
      isBold = true;
      fontColor = [79, 70, 229]; // indigo-600
      textToRender = trimmed.replace(/^##\s+/, "");
      yCursor += 2;
    } else if (trimmed.startsWith("### ")) {
      fontSize = 10;
      isBold = true;
      fontColor = [67, 56, 202]; // indigo-700
      textToRender = "✦  " + trimmed.replace(/^###\s+/, "");
      yCursor += 1;
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      fontSize = 9;
      indentX = 4;
      textToRender = "• " + trimmed.replace(/^[-*]\s+/, "");
    } else if (trimmed.startsWith(">")) {
      // Treat as quote block blockquote
      fontSize = 9.5;
      isItalic = true;
      indentX = 8;
      fontColor = [67, 56, 202]; // Indigo-700
      textToRender = trimmed.replace(/^>\s*/, "").replace(/^\s*\*\*|\*\*/g, ""); // strip quotes and outer bolds
    } else {
      // Body paragraph
      fontSize = 9;
    }

    // Clean up basic markdown bullet elements or inline bold indicators (**bold**)
    textToRender = textToRender.replace(/\*\*(.*?)\*\*/g, "$1");

    // Format text font
    const fontStyle = isBold && isItalic ? "bolditalic" : isBold ? "bold" : isItalic ? "italic" : "normal";
    doc.setFont("helvetica", fontStyle);
    doc.setFontSize(fontSize);
    doc.setTextColor(fontColor[0], fontColor[1], fontColor[2]);

    // Wrap string with max width reflecting indent
    const wrappedLines: string[] = doc.splitTextToSize(textToRender, 170 - indentX);

    // If it's a blockquote quote, draw the left accent bar
    if (isItalic && trimmed.startsWith(">")) {
      const barHeight = (wrappedLines.length * fontSize * 0.55) + 3;
      doc.setFillColor(199, 210, 254); // indigo-200
      doc.rect(marginX + 2, yCursor - 3, 1.2, barHeight, "F");
    }

    wrappedLines.forEach((line) => {
      // Check if we need to spawn a new page
      if (yCursor > 265) {
        // Draw footer of current page before switching
        drawFooter(pageNumber);

        doc.addPage();
        pageNumber++;
        drawHeader(pageNumber);
        
        yCursor = 32; // Reset cursor for next page under header band
        doc.setFont("helvetica", fontStyle);
        doc.setFontSize(fontSize);
        doc.setTextColor(fontColor[0], fontColor[1], fontColor[2]);
      }

      doc.text(line, marginX + indentX, yCursor);
      yCursor += fontSize * 0.55; // adaptive line spacing based on font size
    });

    yCursor += 2.5; // spacing between paragraphs
  });

  // Finally draw footer of the final page
  drawFooter(pageNumber);

  // Download PDF
  doc.save(`diretrizes_operacionais_cttu_${new Date().toISOString().slice(0,10)}.pdf`);
};
