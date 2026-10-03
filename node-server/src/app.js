import express from "express";
import dotenv from "dotenv";
import expenseRoutes from "./routes/expenseRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import { requireAuth } from "./middleware/auth.js";
import { initializeAuthDatabase } from "./services/authService.js";
import { initializeDatabase } from "./services/expenseService.js";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "../public")));
app.use(express.json());
app.use(cookieParser());
app.use("/api/auth", authRoutes);
app.use("/api", requireAuth, expenseRoutes);

app.get("/health", (req, res) => {
  res.json({ status: "ok", database: "mongodb" });
});

const PORT = process.env.PORT || 3000;

initializeAuthDatabase()
  .then(() => initializeDatabase())
  .then(() => app.listen(PORT, () => console.log(`Server running on port ${PORT}`)))
  .catch((error) => {
    console.error("Unable to connect to MongoDB:", error.message);
    process.exit(1);
  });