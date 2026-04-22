"use client";

import { useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Format = "python" | "json" | "regex";

interface Config {
  model: string;
  temperature: number;
  maxTokens: number;
}

interface TestCase {
  task: string;
  format: Format;
  solution_criteria?: string;
}

interface EvalResult {
  testCase: TestCase;
  output: string;
  modelScore: number;
  syntaxScore: number;
  score: number;
  reasoning: string;
  strengths: string[];
  weaknesses: string[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_PROMPT = `Please complete the following task:

{task}`;

const MODELS = [
  "claude-haiku-4-5",
  "claude-3-haiku-20240307",
  "claude-3-5-haiku-20241022",
  "claude-3-5-sonnet-20241022",
  "claude-sonnet-4-5",
  "claude-opus-4-5",
];

// ─── ResultCard ───────────────────────────────────────────────────────────────

function ResultCard({
  result,
  index,
}: {
  result: EvalResult;
  index: number;
}) {
  const [expanded, setExpanded] = useState(false);

  const scoreColor =
    result.score >= 8
      ? "text-green-400"
      : result.score >= 6
      ? "text-yellow-400"
      : "text-red-400";

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center gap-4 p-4 hover:bg-gray-700/50 transition-colors text-left"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Index */}
        <div className="flex-shrink-0 text-xs text-gray-500 font-mono w-6 text-center">
          #{index + 1}
        </div>

        {/* Task */}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-200 truncate">{result.testCase.task}</p>
          <p className="text-xs text-gray-500 mt-0.5 truncate">{result.reasoning}</p>
        </div>

        {/* Scores */}
        <div className="flex items-center gap-5 flex-shrink-0">
          <div className="text-center min-w-[48px]">
            <div className="text-xs text-gray-500 mb-0.5">Score</div>
            <div className={`text-xl font-bold ${scoreColor}`}>
              {result.score.toFixed(1)}
            </div>
          </div>
          <svg
            className={`w-4 h-4 text-gray-500 transition-transform flex-shrink-0 ${
              expanded ? "rotate-180" : ""
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-700 p-4 space-y-4">
          {/* Prompt enviado */}
          <div>
            <h4 className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-2">
              User Message Enviado
            </h4>
            <pre className="bg-gray-900 rounded-md p-3 text-xs text-gray-400 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed">
              {result.promptSent?.trim() || "(vazio)"}
            </pre>
          </div>

          {/* Output */}
          <div>
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Generated Output
            </h4>
            <pre className="bg-gray-900 rounded-md p-3 text-xs text-gray-300 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed">
              {result.output.trim() || "(empty)"}
            </pre>
          </div>

          {/* Reasoning */}
          <div>
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Grader Reasoning
            </h4>
            <p className="text-sm text-gray-300 leading-relaxed">
              {result.reasoning}
            </p>
          </div>

          {/* Strengths / Weaknesses */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="text-xs font-semibold text-green-500 uppercase tracking-wider mb-2">
                Strengths
              </h4>
              <ul className="space-y-1.5">
                {(result.strengths ?? []).map((s, i) => (
                  <li key={i} className="flex gap-1.5 text-xs text-gray-300">
                    <span className="text-green-500 flex-shrink-0">+</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-red-500 uppercase tracking-wider mb-2">
                Weaknesses
              </h4>
              <ul className="space-y-1.5">
                {(result.weaknesses ?? []).map((w, i) => (
                  <li key={i} className="flex gap-1.5 text-xs text-gray-300">
                    <span className="text-red-500 flex-shrink-0">−</span>
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Home() {
  const [config, setConfig] = useState<Config>({
    model: "claude-haiku-4-5",
    temperature: 1.0,
    maxTokens: 1000,
  });
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [dataset, setDataset] = useState<TestCase[]>([]);
  const [results, setResults] = useState<EvalResult[]>([]);
  const [activeTab, setActiveTab] = useState<"prompt" | "dataset" | "results">(
    "prompt"
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [generateCount, setGenerateCount] = useState(3);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState("");

  const averageScore =
    results.length > 0
      ? results.reduce((sum, r) => sum + r.score, 0) / results.length
      : null;

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const handleGenerateDataset = async () => {
    setIsGenerating(true);
    setError("");
    try {
      const res = await fetch("/api/generate-dataset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: config.model,
          count: generateCount,
          promptTemplate: prompt,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to generate dataset");
      }
      const data = await res.json();
      setDataset(data.dataset);
      setActiveTab("dataset");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to generate dataset"
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRunEval = async () => {
    if (dataset.length === 0) {
      setError("Add at least one test case to the dataset");
      return;
    }

    setIsRunning(true);
    setResults([]);
    setError("");
    setProgress({ current: 0, total: dataset.length });
    setActiveTab("results");

    try {
      const res = await fetch("/api/run-eval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: config.model,
          temperature: config.temperature,
          maxTokens: config.maxTokens,
          prompt,
          dataset,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Evaluation failed");
      }
      if (!res.body) throw new Error("No response stream");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "result") {
              setResults((prev) => [...prev, data.result]);
              setProgress((prev) => ({ ...prev, current: prev.current + 1 }));
            } else if (data.type === "error") {
              setError(data.message);
            }
          } catch {
            // skip malformed lines
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Evaluation failed");
    } finally {
      setIsRunning(false);
    }
  };

  const updateTestCase = (index: number, updates: Partial<TestCase>) => {
    setDataset((d) =>
      d.map((tc, i) => (i === index ? { ...tc, ...updates } : tc))
    );
  };

  const removeTestCase = (index: number) => {
    setDataset((d) => d.filter((_, i) => i !== index));
  };

  const addTestCase = () => {
    setDataset((d) => [...d, { task: "", solution_criteria: "" }]);
  };

  const exportDataset = () => {
    const blob = new Blob([JSON.stringify(dataset, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "dataset.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const importDataset = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (Array.isArray(data)) {
          setDataset(data);
          setActiveTab("dataset");
        } else {
          setError("Invalid dataset format — expected a JSON array");
        }
      } catch {
        setError("Invalid JSON file");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      {/* ── Header ── */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-white">
              Prompt Evaluation
            </h1>
            <p className="text-xs text-gray-400 mt-0.5">
              Systematically test and iterate on Claude prompts
            </p>
          </div>
          {averageScore !== null && !isRunning && (
            <div
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold border ${
                averageScore >= 8
                  ? "bg-green-900/40 text-green-300 border-green-700"
                  : averageScore >= 6
                  ? "bg-yellow-900/40 text-yellow-300 border-yellow-700"
                  : "bg-red-900/40 text-red-300 border-red-700"
              }`}
            >
              Average Score: {averageScore.toFixed(2)} / 10
            </div>
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Sidebar ── */}
        <aside className="w-60 bg-gray-900 border-r border-gray-800 p-4 overflow-y-auto flex-shrink-0 flex flex-col gap-5">
          {/* API Configuration */}
          <section>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              API Configuration
            </h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">
                  Model
                </label>
                <select
                  value={config.model}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, model: e.target.value }))
                  }
                  className="w-full bg-gray-800 border border-gray-700 rounded px-2.5 py-1.5 text-xs text-gray-100 focus:outline-none focus:border-blue-500"
                >
                  {MODELS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">
                  Temperature{" "}
                  <span className="text-blue-400 font-mono">
                    {config.temperature.toFixed(1)}
                  </span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={config.temperature}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      temperature: parseFloat(e.target.value),
                    }))
                  }
                  className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
                <div className="flex justify-between text-xs text-gray-600 mt-0.5">
                  <span>Precise</span>
                  <span>Creative</span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">
                  Max Tokens
                </label>
                <input
                  type="number"
                  min="100"
                  max="8192"
                  value={config.maxTokens}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      maxTokens: parseInt(e.target.value) || 1000,
                    }))
                  }
                  className="w-full bg-gray-800 border border-gray-700 rounded px-2.5 py-1.5 text-xs text-gray-100 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </section>

          <div className="border-t border-gray-800" />

          {/* Generate Dataset */}
          <section>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Generate Dataset
            </h2>
            <div className="space-y-2">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">
                  Number of Cases
                </label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={generateCount}
                  onChange={(e) =>
                    setGenerateCount(parseInt(e.target.value) || 3)
                  }
                  className="w-full bg-gray-800 border border-gray-700 rounded px-2.5 py-1.5 text-xs text-gray-100 focus:outline-none focus:border-blue-500"
                />
              </div>
              <button
                onClick={handleGenerateDataset}
                disabled={isGenerating || isRunning}
                className="w-full bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium py-2 px-3 rounded transition-colors"
              >
                {isGenerating ? "Generating…" : "Generate with AI"}
              </button>
            </div>
          </section>

          <div className="border-t border-gray-800" />

          {/* Run Evaluation */}
          <section>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Run Evaluation
            </h2>
            <button
              onClick={handleRunEval}
              disabled={isRunning || isGenerating || dataset.length === 0}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold py-2.5 px-4 rounded transition-colors"
            >
              {isRunning ? "Running…" : "▶  Run Eval"}
            </button>

            {isRunning && (
              <div className="mt-3 space-y-1.5">
                <div className="flex justify-between text-xs text-gray-400">
                  <span>Progress</span>
                  <span>
                    {progress.current}/{progress.total}
                  </span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-1.5">
                  <div
                    className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                    style={{
                      width: `${
                        progress.total
                          ? (progress.current / progress.total) * 100
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>
            )}

            {dataset.length > 0 && (
              <p className="text-xs text-gray-500 mt-2 text-center">
                {dataset.length} test case{dataset.length !== 1 ? "s" : ""}
              </p>
            )}

            {averageScore !== null && !isRunning && (
              <div
                className={`mt-3 p-3 rounded-lg text-center border ${
                  averageScore >= 8
                    ? "bg-green-900/30 border-green-800"
                    : averageScore >= 6
                    ? "bg-yellow-900/30 border-yellow-800"
                    : "bg-red-900/30 border-red-800"
                }`}
              >
                <div className="text-xs text-gray-400 mb-0.5">
                  Last Run Average
                </div>
                <div
                  className={`text-3xl font-bold ${
                    averageScore >= 8
                      ? "text-green-400"
                      : averageScore >= 6
                      ? "text-yellow-400"
                      : "text-red-400"
                  }`}
                >
                  {averageScore.toFixed(2)}
                </div>
                <div className="text-xs text-gray-500">/ 10</div>
              </div>
            )}
          </section>
        </aside>

        {/* ── Main Content ── */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Tabs */}
          <div className="bg-gray-900 border-b border-gray-800 px-6 flex-shrink-0">
            <nav className="flex gap-1">
              {(
                [
                  { id: "prompt" as const, label: "Prompt", count: undefined as number | undefined },
                  { id: "dataset" as const, label: "Dataset", count: dataset.length },
                  { id: "results" as const, label: "Results", count: results.length },
                ]
              ).map(({ id, label, count }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    activeTab === id
                      ? "border-blue-500 text-blue-400"
                      : "border-transparent text-gray-400 hover:text-gray-200"
                  }`}
                >
                  {label}
                  {count !== undefined && count > 0 && (
                    <span className="bg-gray-700 text-gray-300 text-xs min-w-[18px] h-[18px] flex items-center justify-center rounded-full px-1">
                      {count}
                    </span>
                  )}
                </button>
              ))}
            </nav>
          </div>

          {/* Error banner */}
          {error && (
            <div className="bg-red-950 border-b border-red-800 px-6 py-2.5 flex items-center justify-between flex-shrink-0">
              <span className="text-sm text-red-300">{error}</span>
              <button
                onClick={() => setError("")}
                className="text-red-500 hover:text-red-300 ml-4 font-bold"
              >
                ✕
              </button>
            </div>
          )}

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto">
            {/* ── Prompt Tab ── */}
            {activeTab === "prompt" && (
              <div className="p-6 h-full flex flex-col" style={{ minHeight: "calc(100vh - 140px)" }}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h2 className="text-base font-semibold text-white">
                      Prompt Template
                    </h2>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Optionally use{" "}
                      <code className="bg-gray-800 text-blue-400 px-1 py-0.5 rounded font-mono text-xs">
                        {"{task}"}
                      </code>{" "}
                      as a placeholder for each test case. If omitted, the task is appended to the end of the prompt.
                    </p>
                  </div>
                  <button
                    onClick={() => setPrompt(DEFAULT_PROMPT)}
                    className="text-xs text-gray-500 hover:text-gray-300 transition-colors whitespace-nowrap ml-4"
                  >
                    Reset to default
                  </button>
                </div>

                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  spellCheck={false}
                  className="flex-1 w-full bg-gray-800 border border-gray-700 rounded-lg p-4 text-sm text-gray-100 font-mono leading-relaxed focus:outline-none focus:border-blue-500 resize-none"
                  style={{ minHeight: "380px" }}
                  placeholder="Enter your prompt template…"
                />

              </div>
            )}

            {/* ── Dataset Tab ── */}
            {activeTab === "dataset" && (
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-semibold text-white">
                    Test Cases
                    {dataset.length > 0 && (
                      <span className="ml-2 text-sm font-normal text-gray-400">
                        ({dataset.length})
                      </span>
                    )}
                  </h2>
                  <div className="flex items-center gap-3">
                    <label className="cursor-pointer text-xs text-gray-400 hover:text-gray-200 transition-colors underline underline-offset-2">
                      Import JSON
                      <input
                        type="file"
                        accept=".json"
                        onChange={importDataset}
                        className="hidden"
                      />
                    </label>
                    {dataset.length > 0 && (
                      <button
                        onClick={exportDataset}
                        className="text-xs text-gray-400 hover:text-gray-200 transition-colors underline underline-offset-2"
                      >
                        Export JSON
                      </button>
                    )}
                    <button
                      onClick={addTestCase}
                      className="bg-gray-700 hover:bg-gray-600 text-white text-xs px-3 py-1.5 rounded transition-colors"
                    >
                      + Add Case
                    </button>
                  </div>
                </div>

                {dataset.length === 0 ? (
                  <div className="text-center py-24 text-gray-600">
                    <div className="text-5xl mb-4">📋</div>
                    <p className="text-base font-medium mb-1">
                      No test cases yet
                    </p>
                    <p className="text-sm">
                      Use &quot;Generate with AI&quot; in the sidebar or add
                      cases manually.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {dataset.map((tc, i) => (
                      <div
                        key={i}
                        className="bg-gray-800 border border-gray-700 rounded-lg p-4"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-semibold text-gray-500 tracking-wider">
                            CASE {i + 1}
                          </span>
                          <button
                            onClick={() => removeTestCase(i)}
                            className="text-xs text-gray-600 hover:text-red-400 transition-colors"
                          >
                            Remove
                          </button>
                        </div>
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-400 mb-1">
                              Task
                            </label>
                            <textarea
                              value={tc.task}
                              onChange={(e) =>
                                updateTestCase(i, { task: e.target.value })
                              }
                              rows={2}
                              className="w-full bg-gray-900 border border-gray-700 rounded px-2.5 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-blue-500 resize-none"
                              placeholder="Describe the task…"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-400 mb-1">
                              Solution Criteria{" "}
                              <span className="text-gray-600 font-normal">
                                (optional — guides the model grader)
                              </span>
                            </label>
                            <input
                              value={tc.solution_criteria ?? ""}
                              onChange={(e) =>
                                updateTestCase(i, {
                                  solution_criteria: e.target.value,
                                })
                              }
                              className="w-full bg-gray-900 border border-gray-700 rounded px-2.5 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
                              placeholder="e.g. should handle edge cases, use proper AWS naming…"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Results Tab ── */}
            {activeTab === "results" && (
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-semibold text-white">
                    Evaluation Results
                    {results.length > 0 && (
                      <span className="ml-2 text-sm font-normal text-gray-400">
                        ({results.length}/{dataset.length})
                      </span>
                    )}
                  </h2>
                  {averageScore !== null && !isRunning && (
                    <span
                      className={`text-sm font-semibold px-3 py-1 rounded-md border ${
                        averageScore >= 8
                          ? "bg-green-900/40 text-green-300 border-green-700"
                          : averageScore >= 6
                          ? "bg-yellow-900/40 text-yellow-300 border-yellow-700"
                          : "bg-red-900/40 text-red-300 border-red-700"
                      }`}
                    >
                      Average: {averageScore.toFixed(2)}/10
                    </span>
                  )}
                </div>

                {results.length === 0 && !isRunning ? (
                  <div className="text-center py-24 text-gray-600">
                    <div className="text-5xl mb-4">📊</div>
                    <p className="text-base font-medium mb-1">No results yet</p>
                    <p className="text-sm">
                      Configure a prompt, add test cases, and click &quot;Run
                      Eval&quot;.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {results.map((result, i) => (
                      <ResultCard key={i} result={result} index={i} />
                    ))}
                    {isRunning && progress.current < progress.total && (
                      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
                        <div className="flex items-center gap-2 text-sm text-gray-400">
                          <span className="inline-block w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                          Evaluating test case {progress.current + 1} of{" "}
                          {progress.total}…
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
