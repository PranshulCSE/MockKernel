import express from "express";
// Register all Mongoose models (discriminators need evaluation order)
import './models/index.js';
const app = express();
import dotenv from "dotenv";
dotenv.config();

const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Hello, World!");
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});