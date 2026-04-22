import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TestCase {
  task: string;
  solution_criteria?: string;
}

interface GradeResult {
  score: number;
  reasoning: string;
  strengths: string[];
  weaknesses: string[];
}

// ─── Model grader ─────────────────────────────────────────────────────────────

async function gradeByModel(
  client: Anthropic,
  model: string,
  testCase: TestCase,
  output: string
): Promise<GradeResult> {
  const criteriaSection = testCase.solution_criteria
    ? `\nEvaluation Criteria:\n<criteria>\n${testCase.solution_criteria}\n</criteria>\n`
    : "";

  const evalPrompt = `You are an expert evaluator. Assess the quality of the following AI-generated response.

Original Task:
<task>
${testCase.task}
</task>

Solution:
<solution>
${output}
</solution>
${criteriaSection}
Provide your evaluation as a JSON object with exactly these fields:
- "strengths": array of 1-3 key strengths (strings)
- "weaknesses": array of 1-3 areas for improvement (strings)
- "reasoning": a concise overall assessment (string)
- "score": a number from 1 to 10

Keep the response concise and direct.`;

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 600,
      temperature: 0.3, // Low temperature for consistent grading
      messages: [
        { role: "user", content: evalPrompt },
        { role: "assistant", content: "```json" },
      ],
      stop_sequences: ["```"],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "{}";
    const parsed = JSON.parse(text);

    return {
      score: typeof parsed.score === "string" ? parseFloat(parsed.score) : (parsed.score ?? 5),
      reasoning: parsed.reasoning ?? "No reasoning provided",
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
      weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses : [],
    };
  } catch {
    return {
      score: 5,
      reasoning: "Could not parse grader response",
      strengths: [],
      weaknesses: [],
    };
  }
}

// ─── Run a single prompt ──────────────────────────────────────────────────────

async function runPrompt(
  client: Anthropic,
  model: string,
  temperature: number,
  maxTokens: number,
  promptTemplate: string,
  testCase: TestCase
): Promise<{ output: string; promptSent: string }> {
  const hasPlaceholder = promptTemplate.includes("{task}");

  // With {task}: substitute into template → single user message
  // Without {task}: prompt becomes system message, task is the user message
  const requestParams = hasPlaceholder
    ? {
        model,
        max_tokens: maxTokens,
        temperature,
        messages: [
          { role: "user" as const, content: promptTemplate.replace("{task}", testCase.task) },
        ],
      }
    : {
        model,
        max_tokens: maxTokens,
        temperature,
        system: promptTemplate,
        messages: [
          { role: "user" as const, content: testCase.task },
        ],
      };

  const promptSent = hasPlaceholder
    ? promptTemplate.replace("{task}", testCase.task)
    : testCase.task;

  const response = await client.messages.create(requestParams);

  const output = response.content[0].type === "text" ? response.content[0].text : "";
  return { output, promptSent };
}

// ─── SSE Route ────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
        );
      };

      try {
        const body = await request.json();
        const { model, temperature, maxTokens, prompt, dataset } = body;

        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
          send({ type: "error", message: "ANTHROPIC_API_KEY is not configured on the server" });
          controller.close();
          return;
        }

        if (!Array.isArray(dataset) || dataset.length === 0) {
          send({ type: "error", message: "Dataset is empty" });
          controller.close();
          return;
        }

        const client = new Anthropic({ apiKey });
        const evalTemperature =
          typeof temperature === "number" ? temperature : 1.0;
        const evalMaxTokens = typeof maxTokens === "number" ? maxTokens : 1000;

        for (const testCase of dataset as TestCase[]) {
          try {
            // Step 1: generate output from the model
            const { output, promptSent } = await runPrompt(
              client,
              model,
              evalTemperature,
              evalMaxTokens,
              prompt,
              testCase
            );

            // Step 2: grade with model
            const modelGrade = await gradeByModel(
              client,
              model,
              testCase,
              output
            );
            const score = Math.min(10, Math.max(0, modelGrade.score));

            send({
              type: "result",
              result: {
                testCase,
                promptSent,
                output,
                score,
                reasoning: modelGrade.reasoning,
                strengths: modelGrade.strengths,
                weaknesses: modelGrade.weaknesses,
              },
            });
          } catch (err) {
            // Still emit a result so the UI progress advances
            send({
              type: "result",
              result: {
                testCase,
                output: "",
                modelScore: 0,
                syntaxScore: 0,
                score: 0,
                reasoning: `Error: ${
                  err instanceof Error ? err.message : "Unknown error"
                }`,
                strengths: [],
                weaknesses: ["Evaluation failed for this test case"],
              },
            });
          }
        }

        send({ type: "done" });
      } catch (err) {
        send({
          type: "error",
          message: err instanceof Error ? err.message : "Evaluation failed",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
