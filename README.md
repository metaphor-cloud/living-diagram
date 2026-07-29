# Living Diagram

Have a conversation with your diagram.

Living Diagram is a browser-only diagramming tool built on [React Flow](https://reactflow.dev). You talk to it - by voice, by text, or by letting it listen to your meeting - and it reads and edits the canvas through a shared set of diagram tools. There is no backend: you bring your own OpenAI API key, and the page talks to `api.openai.com` directly from your browser.

## Three ways to converse

- **Chat** - a text panel driven by the OpenAI Responses API (pick your model). Ask questions ("what talks to the database?") or give instructions ("add a queue between the API and the worker, then tidy it up").
- **Voice** - a live spoken conversation over the OpenAI Realtime API (WebRTC). The assistant answers out loud and edits the diagram while you talk.
- **Meeting mode** - passive listening. The Realtime session is configured text-only and instructed to stay silent; it just listens to the room and calls diagram write tools whenever the conversation warrants an update, with a visible feed of everything it heard and did.

Both AI surfaces use the same MCP-style tool registry (describe, find, add/update/delete nodes and edges, group/ungroup, style, auto-layout, clear), so anything the chat can do, the voice can too. You can always edit manually: drag, connect, resize, delete.

## Diagram features

- Shape nodes (rectangle, rounded, ellipse, diamond) with colors, emoji icons, descriptions and explicit sizing
- Labeled, tinted, resizable groups with arbitrary nesting
- Every React Flow edge path type (bezier, smooth-step, step, straight) with labels, arrowheads, dashing, animation and colors
- Dagre auto-layout that lays out group interiors and resizes groups to fit
- Autosaved to localStorage; chat transcript persists across refreshes until you clear it

## Save, load, export

- **`.ldgz` files** - a compact format: a versioned JSON envelope, gzip-compressed with the browser-native `CompressionStream`. Save and load entirely client-side.
- **Images** - export a high-quality PNG (2x pixel ratio) or SVG of the diagram, rendered from the live canvas at fit-to-content bounds.

## Running it

Use the hosted example (GitHub Pages, deployed from `main` by `.github/workflows/deploy.yml`), or run locally:

```sh
npm install
npm run dev
```

Then open the printed URL, click **Set API key**, and paste an OpenAI API key.

## Your API key

- The key is held in memory only, unless you explicitly tick "remember on this device", which stores it in localStorage.
- It is sent to `api.openai.com` and nowhere else - the app is a static page with no server of its own.
- Voice sessions never use your long-lived key on the wire: the browser mints a short-lived Realtime client secret first and connects with that.
- Usage is billed to your OpenAI account; the model pickers let you trade capability for cost.

## Development

```sh
npm run type-check   # tsc --noEmit
npm test             # vitest
npm run build        # production build (BASE_PATH env sets the Pages base)
```

## License

[MIT](LICENSE)
