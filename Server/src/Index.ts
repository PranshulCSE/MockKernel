import express from "express";
import dotenv from "dotenv";
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

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
