import express from "express";
// Register all Mongoose models (discriminators need evaluation order)
import './models/index.js';
import dotenv from "dotenv";
import { connectDB } from "./config/db.js";
import {
  adminProblemRouter,
  publicProblemRouter,
} from "./routes/problemRoutes.js";
import {
  errorHandler,
  notFoundHandler,
} from "./middleware/errorHandler.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "5mb" }));

app.get("/", (_req, res) => {
  res.send("Hello, World!");
});

app.use("/api/problems", publicProblemRouter);
app.use("/api/admin/problems", adminProblemRouter);

app.use(notFoundHandler);
app.use(errorHandler);

async function startServer(): Promise<void> {
  await connectDB();

  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
