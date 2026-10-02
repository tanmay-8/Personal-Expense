import express from "express";
import dotenv from "dotenv";
import expenseRoutes from "./routes/expenseRoutes.js";
import { initializeDatabase } from "./services/expenseService.js";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "../public")));
app.use(express.json());
app.use("/api", expenseRoutes);

app.get("/health", (req, res) => {
  res.json({ status: "ok", database: "mongodb" });
});

const PORT = process.env.PORT || 3000;

initializeDatabase()
  .then(() => app.listen(PORT, () => console.log(`Server running on port ${PORT}`)))
  .catch((error) => {
    console.error("Unable to connect to MongoDB:", error.message);
    process.exit(1);
  });