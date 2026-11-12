# Mistral Chat

Application web de chat avec l'API Mistral, construite avec le SDK TypeScript officiel [`@mistralai/mistralai`](https://github.com/mistralai/mistral-ts) (modèle par défaut : `mistral-small-latest`).

Interface : streaming des réponses (SSE), conversations multiples sauvegardées en local, rendu Markdown avec blocs de code et bouton copier, régénération, arrêt de génération, réglages (modèle, prompt système, température, tokens max) et thème sombre/clair.

La clé `MISTRAL_API_KEY` reste uniquement côté serveur : le navigateur ne communique qu'avec le serveur Express local, jamais directement avec l'API Mistral.

## Structure

- `server.mjs` — serveur Express :
  - `GET /api/models` — liste des modèles disponibles ;
  - `POST /api/chat` — réponse complète (JSON) ;
  - `POST /api/chat/stream` — réponse en streaming (Server-Sent Events).
- `public/` — interface : `index.html`, `styles.css`, `app.js`.
- `.env.example` — exemple de variable d'environnement.

## Installation

```bash
npm install
```

## Configuration

Définissez votre clé API Mistral (obtenable sur [console.mistral.ai](https://console.mistral.ai/)) :

```bash
export MISTRAL_API_KEY="votre_cle_api"
```

Ou créez un fichier `.env` (non versionné) et lancez le serveur avec `node --env-file=.env server.mjs`.

## Exécution locale

```bash
npm start
```

Puis ouvrez [http://localhost:3000](http://localhost:3000) dans votre navigateur.

## Sécurité

- La clé `MISTRAL_API_KEY` reste uniquement côté serveur (`server.mjs`).
- Le serveur valide et nettoie les entrées : modèle sur liste blanche, température bornée, taille des messages limitée.
- Ne committez jamais votre clé : `.env` est ignoré par `.gitignore`.
