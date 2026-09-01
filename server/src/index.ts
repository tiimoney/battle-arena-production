import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type NextFunction, type Request, type Response } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import { attachUser } from "./auth/middleware.js";
import { authRouter } from "./routes/auth.js";
import { usersRouter } from "./routes/users.js";
import { teamsRouter } from "./routes/teams.js";
import { fixturesRouter } from "./routes/fixtures.js";
import { matchesRouter } from "./routes/matches.js";
import { scoreReportsRouter } from "./routes/scoreReports.js";
import { archivesRouter } from "./routes/archives.js";
import { leagueRouter } from "./routes/league.js";
import { AppError } from "./errors.js";
import { CLIENT_ORIGIN, IS_PRODUCTION } from "./config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Render (and most PaaS hosts) sit behind a reverse proxy that terminates TLS --
// without this, Express sees plain HTTP internally and secure cookies never get set.
app.set("trust proxy", 1);

app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(attachUser);

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/auth", authRouter);
app.use("/users", usersRouter);
app.use("/teams", teamsRouter);
app.use("/fixtures", fixturesRouter);
app.use("/matches", matchesRouter);
app.use("/score-reports", scoreReportsRouter);
app.use("/archives", archivesRouter);
app.use("/league", leagueRouter);

// Single combined deployment: this same process serves the built React app, so the
// client and API share one origin (no cross-site cookie complications). In dev, the
// client instead runs on its own Vite dev server (localhost:5173) and this block is
// skipped entirely.
if (IS_PRODUCTION) {
  const clientDist = path.join(__dirname, "../../client/dist");
  app.use(express.static(clientDist));
  app.get("*", (req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/health")) {
      next();
      return;
    }
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    res.status(err.status).json({ message: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ message: "Something went wrong." });
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`Mocheso League API listening on http://localhost:${port}`);
});
