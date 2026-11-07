import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";

function safeFilename(value: string) {
  return (value || "indi-ai-document")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 70) || "indi-ai-document";
}

export async function downloadWordDocument(
  content: string,
  title = "INDI-AI-Document",
): Promise<void> {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const paragraphs: Paragraph[] = [];
  let inCode = false;

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inCode = !inCode;
      continue;
    }

    if (inCode) {
      paragraphs.push(new Paragraph({
        children: [new TextRun({
          text: line || " ",
          font: "Consolas",
          size: 19,
        })],
        spacing: { after: 0 },
      }));
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      paragraphs.push(new Paragraph({
        text: heading[2],
        heading: level === 1
          ? HeadingLevel.HEADING_1
          : level === 2
            ? HeadingLevel.HEADING_2
            : HeadingLevel.HEADING_3,
        spacing: { before: 180, after: 100 },
      }));
      continue;
    }

    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    const text = (bullet?.[1] ?? numbered?.[1] ?? line)
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/`([^`]+)`/g, "$1");

    paragraphs.push(new Paragraph({
      text: text || " ",
      bullet: bullet ? { level: 0 } : undefined,
      spacing: { after: 100 },
    }));
  }

  const doc = new Document({
    creator: "INDI AI",
    title,
    sections: [{
      properties: {},
      children: paragraphs.length ? paragraphs : [new Paragraph("")],
    }],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeFilename(title)}.docx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}
