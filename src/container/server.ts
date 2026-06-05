import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { runMatchAgent } from "../lib/agent/match_agent.js";

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk: string) => {
      body += chunk;
    });
    req.on("end", () => resolve(body));
  });
}

export async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200);
    res.end("OK");
    return;
  }

  if (req.method === "POST" && req.url === "/match") {
    try {
      const body = await readBody(req);
      const input = JSON.parse(body);

      const results = await runMatchAgent({
        resume: input.resume,
        expectations: input.expectations,
        jobs: input.jobs,
        apiKey: process.env.LLM_DEEPSEEK_APIKEY!,
        baseURL: process.env.LLM_DEEPSEEK_BASEURL || "https://api.deepseek.com/v1",
        modelName: process.env.LLM_DEEPSEEK_MODEL || "deepseek-v4-flash",
        reasoningEffort: process.env.LLM_DEEPSEEK_REASONINGEFFORT || "high",
      });

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(results));
    } catch (err) {
      console.error("[container] match error:", err);
      res.writeHead(500);
      res.end(JSON.stringify({ error: String(err) }));
    }
    return;
  }

  res.writeHead(404);
  res.end("Not Found");
}

const isMain = process.argv[1]?.endsWith("/server.ts") || process.argv[1]?.endsWith("/server.js");
if (isMain) {
  const PORT = parseInt(process.env.PORT || "3000");
  const server = createServer(handleRequest);
  server.listen(PORT, () => {
    console.log(`[container] agent server listening on port ${PORT}`);
  });
}
