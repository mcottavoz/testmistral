# testmistral

App web minimale de chat avec l'API Mistral, utilisant le SDK TypeScript officiel [`@mistralai/mistralai`](https://github.com/mistralai/mistral-ts) et le modèle `mistral-small-latest`.

L'interface de chat est servie par un petit serveur Express, qui est le seul à détenir la clé `MISTRAL_API_KEY` (jamais exposée au navigateur).

## Structure

- `server.mjs` — serveur Express : sert l'interface statique et expose `POST /api/chat` qui appelle l'API Mistral.
- `public/index.html` — interface de chat simple.
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
- Ne committez jamais votre clé : `.env` est ignoré par `.gitignore`.
