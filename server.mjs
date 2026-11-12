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

app.use(express.json());
app.use(express.static(path.join(process.cwd(), "public")));

app.post("/api/chat", async (req, res) => {
  try {
    const messages = req.body.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "Champ 'messages' requis (tableau non vide)." });
    }

    const chatResponse = await client.chat.complete({
      model: "mistral-small-latest",
      messages,
    });

    res.json({ reply: chatResponse.choices[0]?.message?.content ?? "" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur lors de l'appel à l'API Mistral." });
  }
});

app.listen(port, () => {
  console.log(`Serveur démarré sur http://localhost:${port}`);
});
