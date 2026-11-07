import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";

const TYPES = {
  pdf: {
    extension: "pdf",
    mime: "application/pdf",
    label: "PDF",
  },
  docx: {
    extension: "docx",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    label: "Word document",
  },
  txt: {
    extension: "txt",
    mime: "text/plain",
    label: "text file",
  },
  csv: {
    extension: "csv",
    mime: "text/csv",
    label: "CSV file",
  },
};

export function detectWhatsAppFileRequest(input) {
  const text = String(input || "").trim();

  if (!text || text.length > 4000) return null;

  const asksToCreate =
    /\b(create|generate|make|prepare|write|build|export|produce|draft|attach)\b/i.test(text) ||
    /\bsend\s+(?:me\s+)?(?:a|an|the)\b/i.test(text);

  if (!asksToCreate) return null;

  if (/\b(?:xlsx|excel workbook|powerpoint|pptx|\.ppt)\b/i.test(text)) {
    return {
      unsupported: true,
      message: "I can currently generate PDF, Word (.docx), text (.txt), and CSV (.csv) attachments. Excel workbooks and PowerPoint files are not supported yet.",
    };
  }

  let type = "pdf";

  if (/\b(?:csv|\.csv)\b/i.test(text)) {
    type = "csv";
  } else if (/\b(?:docx|word document|word file|word format)\b/i.test(text)) {
    type = "docx";
  } else if (/\b(?:plain text|text file|\.txt)\b/i.test(text)) {
    type = "txt";
  }

  const explicitlyRequestsFile =
    /\b(?:pdf|docx|word document|word file|text file|plain text|csv|spreadsheet|document|file|report|resume|résumé|cv|invoice|letter|\.txt|\.pdf|\.csv)\b/i.test(text);

  if (!explicitlyRequestsFile) return null;

  return { type, ...TYPES[type] };
}

function cleanContent(content) {
  let text = String(content || "").trim();

  text = text
    .replace(/^```(?:markdown|md|text|csv|txt)?\s*\n/i, "")
    .replace(/\n```\s*$/, "")
    .slice(0, 16000);

  if (!text.trim()) {
    throw new Error("The AI returned empty document content.");
  }

  return text;
}

function safeFilename(type) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `indi-ai-document-${stamp}.${TYPES[type].extension}`;
}

function toAscii(input) {
  return String(input)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "?");
}

function pdfEscape(input) {
  return toAscii(input)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function wrapPdfText(text, width = 88) {
  const result = [];

  for (const original of text.split(/\r?\n/)) {
    const line = toAscii(original);
    if (!line.trim()) {
      result.push("");
      continue;
    }

    let remaining = line;

    while (remaining.length > width) {
      let cut = remaining.lastIndexOf(" ", width);
      if (cut < 1) cut = width;
      result.push(remaining.slice(0, cut));
      remaining = remaining.slice(cut).trimStart();
    }

    result.push(remaining);
  }

  return result.length ? result : [""];
}

function createPdf(text) {
  const lines = wrapPdfText(text);
  const pages = [];

  for (let i = 0; i < lines.length; i += 50) {
    pages.push(lines.slice(i, i + 50));
  }

  const objects = [];
  const addObject = (value) => {
    objects.push(value);
    return objects.length;
  };

  addObject("<< /Type /Catalog /Pages 2 0 R >>");
  addObject("");
  const fontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  const pageIds = [];

  for (const pageLines of pages) {
    const commands = [
      "BT",
      "/F1 10 Tf",
      "50 790 Td",
      "14 TL",
      ...pageLines.map((line) => `(${pdfEscape(line)}) Tj T*`),
      "ET",
    ].join("\n");

    const contentId = addObject(
      `<< /Length ${Buffer.byteLength(commands, "ascii")} >>\nstream\n${commands}\nendstream`
    );

    const pageId = objects.length + 1;
    pageIds.push(pageId);

    addObject(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`
    );
  }

  objects[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  let output = "%PDF-1.4\n";
  const offsets = [0];

  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(output, "ascii"));
    output += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(output, "ascii");
  output += `xref\n0 ${objects.length + 1}\n`;
  output += "0000000000 65535 f \n";

  for (let i = 1; i < offsets.length; i++) {
    output += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }

  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  output += `startxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(output, "ascii");
}

async function createDocx(text) {
  const children = text.split(/\r?\n/).map((line) => {
    const value = line.trim();

    if (/^###\s+/.test(value)) {
      return new Paragraph({
        text: value.replace(/^###\s+/, ""),
        heading: HeadingLevel.HEADING_3,
      });
    }

    if (/^##\s+/.test(value)) {
      return new Paragraph({
        text: value.replace(/^##\s+/, ""),
        heading: HeadingLevel.HEADING_2,
      });
    }

    if (/^#\s+/.test(value)) {
      return new Paragraph({
        text: value.replace(/^#\s+/, ""),
        heading: HeadingLevel.HEADING_1,
      });
    }

    if (/^[-*]\s+/.test(value)) {
      return new Paragraph({
        text: value.replace(/^[-*]\s+/, ""),
        bullet: { indent: 360 },
      });
    }

    return new Paragraph({
      children: [new TextRun(value)],
    });
  });

  const document = new Document({
    sections: [{ children }],
  });

  return Packer.toBuffer(document);
}

export async function createWhatsAppFile(type, rawContent) {
  if (!Object.hasOwn(TYPES, type)) {
    throw new Error("Unsupported document type.");
  }

  const content = cleanContent(rawContent);
  let buffer;

  if (type === "pdf") {
    buffer = createPdf(content);
  } else if (type === "docx") {
    buffer = await createDocx(content);
  } else {
    buffer = Buffer.from(content + "\n", "utf8");
  }

  if (!buffer?.length || buffer.length > 10 * 1024 * 1024) {
    throw new Error("The generated file is empty or exceeds the 10 MB generation limit.");
  }

  if (type === "pdf" && !buffer.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    throw new Error("PDF validation failed.");
  }

  if (type === "docx" && !buffer.subarray(0, 2).equals(Buffer.from("PK"))) {
    throw new Error("Word document validation failed.");
  }

  const filename = safeFilename(type);

  return {
    filename,
    mimeType: TYPES[type].mime,
    dataUrl: `data:${TYPES[type].mime};base64,${buffer.toString("base64")}`,
  };
}
