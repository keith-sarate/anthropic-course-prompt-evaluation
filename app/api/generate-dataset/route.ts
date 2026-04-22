import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { model, count = 3, promptTemplate = "" } = body;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY is not configured on the server" },
        { status: 500 }
      );
    }

    const client = new Anthropic({ apiKey });

    const prompt = `You are helping build an evaluation dataset for the following AI prompt template:

<prompt_template>
${promptTemplate || "(no prompt provided)"}
</prompt_template>

Generate ${count} diverse and realistic test inputs that could be used with this prompt. Each input should represent a different scenario or edge case that would realistically be given to this prompt.

Return a JSON array where each object has:
- "task": the input text that will replace {task} in the prompt template
- "solution_criteria": a concise description of what a high-quality response to this specific task should include

Example output:
\`\`\`json
[
  {
    "task": "A realistic example input",
    "solution_criteria": "What makes a good answer for this specific task"
  }
]
\`\`\`

Generate exactly ${count} objects. Make the tasks diverse — vary complexity, topic, and edge cases.`;

    const response = await client.messages.create({
      model: model || "claude-haiku-4-5",
      max_tokens: 2000,
      messages: [
        { role: "user", content: prompt },
        { role: "assistant", content: "```json" },
      ],
      stop_sequences: ["```"],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";
    const dataset = JSON.parse(text);

    if (!Array.isArray(dataset)) {
      throw new Error("Generated dataset is not a JSON array");
    }

    return NextResponse.json({ dataset });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to generate dataset";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
