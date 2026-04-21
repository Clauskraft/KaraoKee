import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Google OAuth Constants
  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  const SCOPES = ["https://www.googleapis.com/auth/photoslibrary.readonly"];
  
  // In-memory token store with TTL expiry to prevent unbounded memory growth
  const TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes
  const tokenStore: Record<string, { value: any; expiresAt: number }> = {};
  const storeToken = (key: string, value: any) => {
    tokenStore[key] = { value, expiresAt: Date.now() + TOKEN_TTL_MS };
  };
  const getToken = (key: string): any | null => {
    const entry = tokenStore[key];
    if (!entry || Date.now() > entry.expiresAt) { delete tokenStore[key]; return null; }
    return entry.value;
  };
  // Periodic cleanup of expired entries
  setInterval(() => {
    const now = Date.now();
    for (const key of Object.keys(tokenStore)) {
      if (now > tokenStore[key].expiresAt) delete tokenStore[key];
    }
  }, 5 * 60 * 1000);

  // 1. Get Auth URL
  app.get("/api/auth/google/url", (req, res) => {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_ID.endsWith(".apps.googleusercontent.com")) {
      return res.json({ 
        error: "OAUTH FEJL: Dit GOOGLE_CLIENT_ID er ugyldigt. Du har muligvis indtastet dit 'Project ID' i stedet. Et ægte Client ID slutter altid på '.apps.googleusercontent.com'." 
      });
    }
    if (!GOOGLE_CLIENT_SECRET) {
      return res.json({ error: "GOOGLE_CLIENT_SECRET mangler i Settings -> Secrets." });
    }
    
    const stateId = (req.query.state as string) || Math.random().toString(36).substring(7);

    // Derive redirect URI from trusted server-side sources only (never trust client-provided origin)
    const appUrl = process.env.APP_URL || `https://${req.header('x-forwarded-host') || req.headers.host}`;
    const redirectUri = `${appUrl}/auth/callback`;

    storeToken(`uri_${stateId}`, redirectUri);

    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent",
      state: stateId, // Pass state to receive it back in callback
    });

    const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    res.json({ url });
  });

  // 2. Callback
  app.get(["/auth/callback", "/auth/callback/"], async (req, res) => {
    const { code, state } = req.query;
    if (!code) return res.send("No code provided");

    const stateStr = state as string;
    // Hent den gemte præcise redirectUri for at undgå mismatch
    const redirectUri = getToken(`uri_${stateStr}`) || (process.env.APP_URL || `https://${req.header('x-forwarded-host') || req.headers.host}`) + "/auth/callback";

    try {
      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code: code as string,
          client_id: GOOGLE_CLIENT_ID!,
          client_secret: GOOGLE_CLIENT_SECRET!,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });

      const tokens = await response.json();
      
      if (tokens.error) {
        throw new Error(tokens.error_description || tokens.error);
      }

      // 3. Store tokens in-memory by state key
      if (state && typeof state === 'string') {
        storeToken(state, tokens);
      }

      // Escape forward-slashes to prevent </script> injection when embedding JSON in a script block
      const safeTokensJson = JSON.stringify(tokens).replace(/\//g, '\\/');
      res.send(`
        <html>
          <body>
            <script>
              (function() {
                var data = ${safeTokensJson};
                localStorage.setItem('google_photos_token', data.access_token);
                if (window.opener) {
                  window.opener.postMessage({ type: 'GOOGLE_AUTH_SUCCESS', tokens: data }, window.location.origin);
                }
                setTimeout(function() {
                  document.body.textContent = "Godkendt! Du kan lukke dette vindue nu.";
                  window.close();
                }, 500);
              })();
            <\/script>
            <p>Authentication successful. You can close this window.</p>
          </body>
        </html>
      `);
    } catch (error: any) {
      res.status(500).send(`Auth failed: ${error.message}`);
    }
  });

  // Fetch token by state
  app.get("/api/auth/token", (req, res) => {
    const state = req.query.state as string;
    if (state) {
      const tokens = getToken(state);
      if (tokens) {
        delete tokenStore[state];
        return res.json({ tokens });
      }
    }
    return res.json({ tokens: null });
  });

  // 3. Fetch Photos (with pagination support)
  app.get("/api/photos/list", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Missing token" });

    const pageToken = req.query.pageToken;
    let url = "https://photoslibrary.googleapis.com/v1/mediaItems?pageSize=50";
    if (pageToken && typeof pageToken === "string") {
      url += `&pageToken=${encodeURIComponent(pageToken)}`;
    }

    try {
      const response = await fetch(url, {
        headers: { Authorization: authHeader },
      });
      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 4. Fetch Albums
  app.get("/api/photos/albums", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Missing token" });

    const pageToken = req.query.pageToken;
    let url = "https://photoslibrary.googleapis.com/v1/albums?pageSize=50";
    if (pageToken && typeof pageToken === "string") {
      url += `&pageToken=${encodeURIComponent(pageToken)}`;
    }

    try {
      const response = await fetch(url, {
        headers: { Authorization: authHeader },
      });
      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 5. Search mediaItems (for Albums)
  app.post("/api/photos/search", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Missing token" });

    const { albumId, pageToken } = req.body;
    
    try {
      const response = await fetch("https://photoslibrary.googleapis.com/v1/mediaItems:search", {
        method: "POST",
        headers: { 
          Authorization: authHeader,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          albumId,
          pageSize: 50,
          pageToken: pageToken || undefined
        })
      });
      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware setup
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
