import { useEffect, useState } from "react";
import { Eye, EyeOff, RefreshCw, Maximize2, Minimize2, Monitor, Tablet, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import CodeCanvas from "@/components/CodeCanvas";
import { toast } from "sonner";

interface Props {
  content: string;
  originalRequest?: string;
}

const extensionFor: Record<string, string> = {
  javascript: "js",
  js: "js",
  typescript: "ts",
  ts: "ts",
  jsx: "jsx",
  tsx: "tsx",
  python: "py",
  py: "py",
  html: "html",
  css: "css",
  json: "json",
  bash: "sh",
  shell: "sh",
  sql: "sql",
  java: "java",
  c: "c",
  cpp: "cpp",
  rust: "rs",
  go: "go",
  yaml: "yml",
  markdown: "md",
};

function CodeBlock({ code: initialCode, language, originalRequest }: {
  code: string;
  language: string;
  originalRequest?: string;
}) {
  const [code, setCode] = useState(initialCode);
  const [preview, setPreview] = useState(true);
  const [previewVersion, setPreviewVersion] = useState(0);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [device, setDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");

  useEffect(() => {
    setCode(initialCode);
  }, [initialCode]);

  const normalized = language.toLowerCase();
  const isHtml = normalized === "html" ||
    /<!doctype\s+html|<html[\s>]/i.test(code);
  const extension = extensionFor[normalized] || "txt";

  return (
    <section className="my-4 min-w-0 overflow-hidden rounded-xl border border-cyan-500/30 bg-[#080d12]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cyan-500/20 bg-slate-950 px-3 py-3">
        <div>
          <div className="text-sm font-semibold tracking-wide text-cyan-200">
            INDI AI LIVE CANVAS
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {language || "code"} · {isHtml ? "Live webpage workspace" : "Source editor"}
          </div>
        </div>
        {isHtml && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setPreview(value => !value);
              setPreviewExpanded(false);
            }}
            className="h-8 px-2 text-cyan-200 hover:bg-cyan-500/10"
          >
            {preview
              ? <><EyeOff className="mr-1 h-4 w-4" /> Hide preview</>
              : <><Eye className="mr-1 h-4 w-4" /> Show live canvas</>}
          </Button>
        )}
      </div>

      {isHtml && preview && (
        <div className={previewExpanded
          ? "fixed inset-3 z-[110] flex flex-col gap-2 overflow-auto rounded-xl border border-cyan-500/40 bg-[#080d12] p-3 shadow-2xl"
          : "grid min-w-0 grid-cols-1 gap-3 p-3 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,1fr)]"
        }>
          <div className={previewExpanded
            ? "flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-cyan-500/20 bg-white"
            : "flex min-w-0 flex-col overflow-hidden rounded-lg border border-cyan-500/20 bg-white"
          }>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
              <div>
                <div className="text-sm font-semibold text-slate-800">Live website</div>
                <div className="text-xs text-slate-500">Changes render as you edit</div>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant={device === "desktop" ? "secondary" : "ghost"}
                  onClick={() => setDevice("desktop")}
                  className="h-8 px-2 text-slate-700"
                  title="Desktop viewport"
                  aria-label="Desktop viewport"
                >
                  <Monitor className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={device === "tablet" ? "secondary" : "ghost"}
                  onClick={() => setDevice("tablet")}
                  className="h-8 px-2 text-slate-700"
                  title="Tablet viewport"
                  aria-label="Tablet viewport"
                >
                  <Tablet className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={device === "mobile" ? "secondary" : "ghost"}
                  onClick={() => setDevice("mobile")}
                  className="h-8 px-2 text-slate-700"
                  title="Mobile viewport"
                  aria-label="Mobile viewport"
                >
                  <Smartphone className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setPreviewVersion(value => value + 1)}
                  className="h-8 px-2 text-slate-700"
                  title="Reload live website"
                  aria-label="Refresh live website"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setPreviewExpanded(value => !value)}
                  className="h-8 px-2 text-slate-700"
                  title={previewExpanded ? "Restore workspace" : "Expand live canvas"}
                  aria-label={previewExpanded ? "Restore live canvas" : "Expand live canvas"}
                >
                  {previewExpanded
                    ? <Minimize2 className="h-4 w-4" />
                    : <Maximize2 className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className={previewExpanded
              ? "min-h-0 flex-1 overflow-auto bg-slate-200 p-3"
              : "min-h-[420px] overflow-auto bg-slate-200 p-3 sm:min-h-[560px]"
            }>
              <div
                className="mx-auto overflow-hidden rounded-md bg-white shadow-xl transition-[width] duration-200"
                style={{
                  width: device === "desktop" ? "100%" : device === "tablet" ? "768px" : "390px",
                  maxWidth: "100%",
                }}
              >
                <iframe
                  key={previewVersion}
                  title="INDI AI live website canvas"
                  srcDoc={code}
                  sandbox="allow-scripts"
                  referrerPolicy="no-referrer"
                  className={previewExpanded
                    ? "block h-full min-h-[70vh] w-full border-0 bg-white"
                    : "block h-[560px] w-full border-0 bg-white sm:h-[680px]"
                  }
                />
              </div>
            </div>
            <div className="border-t border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
              {device === "desktop" ? "Desktop" : device === "tablet" ? "Tablet · 768px max" : "Mobile · 390px max"}
              {" · "}Sandboxed preview
            </div>
          </div>

          {!previewExpanded && (
            <div className="min-w-0 overflow-hidden rounded-lg border border-cyan-500/20 bg-[#080907]">
              <div className="flex items-center justify-between gap-2 border-b border-cyan-500/20 bg-slate-950 px-3 py-3">
                <div>
                  <div className="text-sm font-semibold text-cyan-100">Source code</div>
                  <div className="text-xs text-slate-400">Edit to update the live canvas</div>
                </div>
                <span className="rounded bg-cyan-500/10 px-2 py-1 text-xs text-cyan-200">
                  Editable
                </span>
              </div>
              <div className="p-2">
                <CodeCanvas
                  code={code}
                  language={language}
                  filename={originalRequest}
                  onCodeChange={setCode}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {(!isHtml || !preview) && (
        <div className="p-3">
          <CodeCanvas
            code={code}
            language={language}
            filename={originalRequest}
            onCodeChange={setCode}
          />
        </div>
      )}
    </section>
  );
}

export default function AssistantContent({ content, originalRequest }: Props) {
  const parts = content.split(/```([a-zA-Z0-9_+#.-]*)[^\S\n]*\n([\s\S]*?)```/g);
  const output = [];

  for (let index = 0; index < parts.length; index += 3) {
    const prose = parts[index];
    if (prose) {
      output.push(
        <div key={`text-${index}`} className="whitespace-pre-wrap break-words">
          {prose}
        </div>,
      );
    }

    if (index + 1 < parts.length) {
      const language = parts[index + 1] || "text";
      const code = parts[index + 2] || "";
      if (code.trim()) {
        output.push(
          <CodeBlock
            key={`code-${index}`}
            code={code.replace(/\n$/, "")}
            language={language}
            originalRequest={originalRequest}
          />,
        );
      }
    }
  }

  return <div className="min-w-0 space-y-2">{output}</div>;
}
