import express from "express";
import path from "node:path";
import { Mistral } from "@mistralai/mistralai";

const app = express();
const port = process.env.PORT || 3000;

const apiKey = process.env.MISTRAL_API_KEY;
if (!apiKey) {
  console.error("Erreur : définissez la variable d'environnement MISTRAL_API_KEY.");
  process.exit(1);
}

const client = new Mistral({ apiKey });

const MODELS = [
  "mistral-small-latest",
  "mistral-medium-latest",
  "mistral-large-latest",
  "open-mistral-nemo",
  "ministral-8b-latest",
  "ministral-3b-latest",
];

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(process.cwd(), "public")));

function sanitizeRequest(body) {
  const messages = Array.isArray(body?.messages) ? body.messages : null;
  if (!messages || messages.length === 0) {
    return { error: "Champ 'messages' requis (tableau non vide)." };
  }
  const cleanMessages = messages
    .filter((m) => m && (m.role === "user" || m.role === "assistant" || m.role === "system"))
    .map((m) => ({ role: m.role, content: String(m.content ?? "").slice(0, 32000) }));
  if (cleanMessages.length === 0) {
    return { error: "Aucun message valide." };
  }
  const model = MODELS.includes(body.model) ? body.model : "mistral-small-latest";
  const temperature = Number.isFinite(Number(body.temperature))
    ? Math.min(2, Math.max(0, Number(body.temperature)))
    : 0.7;
  const maxTokens = Number.isInteger(body.maxTokens)
    ? Math.min(8192, Math.max(1, body.maxTokens))
    : undefined;
  return { cleanMessages, model, temperature, maxTokens };
}

app.get("/api/models", (_req, res) => {
  res.json({ models: MODELS });
});

app.post("/api/chat", async (req, res) => {
  const parsed = sanitizeRequest(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  try {
    const chatResponse = await client.chat.complete({
      model: parsed.model,
      messages: parsed.cleanMessages,
      temperature: parsed.temperature,
      ...(parsed.maxTokens ? { maxTokens: parsed.maxTokens } : {}),
    });
    res.json({
      reply: chatResponse.choices[0]?.message?.content ?? "",
      usage: chatResponse.usage ?? null,
    });
  } catch (err) {
    console.error(err);
    res.status(err.statusCode ?? 500).json({ error: "Erreur lors de l'appel à l'API Mistral." });
  }
});

app.post("/api/chat/stream", async (req, res) => {
  const parsed = sanitizeRequest(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  try {
    const stream = await client.chat.stream({
      model: parsed.model,
      messages: parsed.cleanMessages,
      temperature: parsed.temperature,
      ...(parsed.maxTokens ? { maxTokens: parsed.maxTokens } : {}),
    });

    for await (const chunk of stream) {
      const delta = chunk?.data?.choices?.[0]?.delta?.content;
      if (delta) send("delta", { text: delta });
    }
    send("done", {});
  } catch (err) {
    console.error(err);
    send("error", { message: "Erreur lors de l'appel à l'API Mistral." });
  } finally {
    res.end();
  }
});

app.listen(port, () => {
  console.log(`Serveur démarré sur http://localhost:${port}`);
});
