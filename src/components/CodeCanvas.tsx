import { useEffect, useMemo, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { EditorView } from "@codemirror/view";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { sql } from "@codemirror/lang-sql";
import { markdown } from "@codemirror/lang-markdown";
import { yaml } from "@codemirror/lang-yaml";
import { cpp } from "@codemirror/lang-cpp";
import { java } from "@codemirror/lang-java";
import { rust } from "@codemirror/lang-rust";
import { go } from "@codemirror/lang-go";
import { Code2, Copy, Download, Maximize2, Minimize2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface CodeCanvasProps {
  code: string;
  language?: string;
  filename?: string;
  onCodeChange?: (code: string) => void;
}

const LANGUAGE_OPTIONS = [
  "text",
  "javascript",
  "typescript",
  "jsx",
  "tsx",
  "python",
  "html",
  "css",
  "json",
  "bash",
  "sql",
  "java",
  "c",
  "cpp",
  "csharp",
  "go",
  "rust",
  "php",
  "yaml",
  "markdown",
];

function detectLanguage(code: string, hint = ""): string {
  const normalized = hint.trim().toLowerCase();
  const aliases: Record<string, string> = {
    js: "javascript",
    ts: "typescript",
    py: "python",
    sh: "bash",
    shell: "bash",
    zsh: "bash",
    yml: "yaml",
    md: "markdown",
    cxx: "cpp",
    "c++": "cpp",
    "c#": "csharp",
  };

  if (normalized) {
    const language = aliases[normalized] || normalized;
    if (LANGUAGE_OPTIONS.includes(language)) return language;
  }

  if (/^\s*#!/.test(code) || /\b(npm|git|cd|grep|sed|chmod)\s+/.test(code)) {
    return "bash";
  }
  if (/<(!DOCTYPE|html|head|body|div|main|section)\b/i.test(code)) {
    return "html";
  }
  if (/\b(interface|type)\s+\w+|\b(const|let)\s+\w+\s*=/.test(code)) {
    return /:\s*(string|number|boolean|React\.|Record<)/.test(code)
      ? "typescript"
      : "javascript";
  }
  if (/\b(def|elif|print)\s*\(?|^\s*from\s+\w+\s+import\b/m.test(code)) {
    return "python";
  }
  if (/^\s*[{[]/.test(code.trim()) && /"\s*:/.test(code)) {
    try {
      JSON.parse(code);
      return "json";
    } catch {
      // Not valid JSON; continue with other heuristics.
    }
  }
  if (/(^|\n)\s*SELECT\b|^\s*(CREATE TABLE|INSERT INTO)\b/im.test(code)) {
    return "sql";
  }

  return "text";
}

const EXTENSIONS: Record<string, string> = {
  text: "txt",
  javascript: "js",
  typescript: "ts",
  jsx: "jsx",
  tsx: "tsx",
  python: "py",
  html: "html",
  css: "css",
  json: "json",
  bash: "sh",
  sql: "sql",
  java: "java",
  c: "c",
  cpp: "cpp",
  csharp: "cs",
  go: "go",
  rust: "rs",
  php: "php",
  yaml: "yml",
  markdown: "md",
};

function getCodeExtensions(language: string) {
  switch (language) {
    case "javascript":
    case "jsx":
      return [javascript({ jsx: language === "jsx" })];
    case "typescript":
    case "tsx":
      return [javascript({ typescript: true, jsx: language === "tsx" })];
    case "python":
      return [python()];
    case "html":
      return [html()];
    case "css":
      return [css()];
    case "json":
      return [json()];
    case "sql":
      return [sql()];
    case "markdown":
      return [markdown()];
    case "yaml":
      return [yaml()];
    case "c":
    case "cpp":
    case "csharp":
      return [cpp()];
    case "java":
      return [java()];
    case "rust":
      return [rust()];
    case "go":
      return [go()];
    default:
      return [];
  }
}

const exileEditorTheme = EditorView.theme({
  "&": {
    height: "100%",
    color: "#f5edda",
    backgroundColor: "#080907",
    fontSize: "13px",
  },
  ".cm-scroller": {
    overflow: "auto",
    fontFamily: "'Cascadia Code', Consolas, monospace",
    lineHeight: "1.7",
  },
  ".cm-gutters": {
    backgroundColor: "#11110d",
    color: "#a9a18e",
    borderRight: "1px solid #4a3c1c",
  },
  ".cm-activeLine": {
    backgroundColor: "#1a1810",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "#10231a",
    color: "#e0c478",
  },
  ".cm-cursor": {
    borderLeftColor: "#e0c478",
  },
  "&.cm-focused": {
    outline: "none",
  },
}, { dark: true });

export default function CodeCanvas({
  code: initialCode,
  language: languageHint,
  filename: filenameHint,
  onCodeChange,
}: CodeCanvasProps) {
  const [code, setCode] = useState(initialCode);
  const [expanded, setExpanded] = useState(false);
  const [language, setLanguage] = useState(() =>
    detectLanguage(initialCode, languageHint),
  );

  useEffect(() => {
    setCode(initialCode);
    setLanguage(detectLanguage(initialCode, languageHint));
  }, [initialCode, languageHint]);

  const extensions = useMemo(
    () => [...getCodeExtensions(language), exileEditorTheme],
    [language],
  );

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success("Code copied to clipboard");
    } catch {
      toast.error("Clipboard access failed. Select the code and copy it manually.");
    }
  };

  const downloadCode = () => {
    const blob = new Blob([code], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    const baseName = (filenameHint || "indi-ai-code")
      .toLowerCase()
      .replace(/\b(?:please\s+)?(?:create|build|make|generate|design|develop|write)\b/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48)
      .replace(/-+$/g, "") || "indi-ai-code";
    anchor.download = `${baseName}.${EXTENSIONS[language] || "txt"}`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    toast.success("Code download started");
  };

  return (
    <section className={`${expanded ? "fixed inset-3 z-[100] flex flex-col" : "w-full"} min-w-0 overflow-hidden rounded-xl border border-[#c4a253]/60 bg-[#080907] text-[#f5edda] shadow-[0_0_24px_rgba(196,162,83,0.10)]`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#c4a253]/40 bg-[#11110d] px-3 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Code2 className="h-4 w-4 text-[#e0c478]" />
          INDI AI Code Canvas
          <span className="text-xs font-normal text-[#a9a18e]">· {language}</span>
        </div>

        <label className="flex items-center gap-2 text-xs text-slate-300">
          Language
          <select
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
            className="rounded-md border border-[#c4a253]/50 bg-[#11110d] px-2 py-1.5 text-sm text-[#f5edda]"
            aria-label="Code language"
          >
            {LANGUAGE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <Button type="button" size="sm" variant="ghost"
          onClick={() => setExpanded(value => !value)}
          aria-label={expanded ? "Collapse code canvas" : "Expand code canvas"}
          title={expanded ? "Collapse workspace" : "Expand workspace"}
          className="h-8 px-2 text-[#e0c478] hover:bg-[#c4a253]/10">
          {expanded ? <Minimize2 className="mr-1 h-4 w-4" /> : <Maximize2 className="mr-1 h-4 w-4" />}
          {expanded ? "Collapse" : "Expand"}
        </Button>
      </div>

      <div className={`${expanded ? "flex-1 min-h-0" : "h-[320px] min-h-[240px] sm:h-[420px]"} overflow-hidden bg-[#080907]`}>
        <CodeMirror
          value={code}
          height="100%"
          theme="dark"
          extensions={extensions}
          onChange={(value) => {
            setCode(value);
            onCodeChange?.(value);
          }}
          basicSetup={{
            lineNumbers: true,
            foldGutter: true,
            highlightActiveLine: true,
            highlightActiveLineGutter: true,
            bracketMatching: true,
            closeBrackets: true,
            autocompletion: true,
            indentOnInput: true,
            syntaxHighlighting: true,
            searchKeymap: true,
          }}
          editable
          aria-label="Editable source code"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#c4a253]/30 bg-[#11110d] px-3 py-2">
        <p className="text-xs text-slate-400">
          {code.split("\n").length} lines · {code.length} characters
        </p>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => void copyCode()}>
            <Copy className="mr-2 h-4 w-4" />
            Copy
          </Button>
          <Button type="button" size="sm" onClick={downloadCode}>
            <Download className="mr-2 h-4 w-4" />
            Download
          </Button>
        </div>
      </div>
    </section>
  );
}
