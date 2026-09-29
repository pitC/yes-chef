# Server-mediated, app read-only cookbook access

The app is single-user with multiple cookbooks backed by Firestore, so we decided all app reads go via the app-server with `Bearer <cookbook-code>` and the app never writes recipes (authoring happens out-of-app via privileged writer).

Considered Options: direct Firestore SDK access from the client with per-user auth rules.
Consequences: `firestore.js` remains only as a deprecated alias, invalid codes clear and re-prompt, and sync failures fall back to the bundled local recipe.
