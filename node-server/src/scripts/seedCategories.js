import { closeDatabase } from "../config/database.js";
import { seedInitialCategories } from "../services/expenseService.js";

const userId = process.env.SEED_USER_ID;
if (!userId) throw new Error("Set SEED_USER_ID to an existing user's MongoDB id");
await seedInitialCategories(userId);
console.log(`Seeded initial categories for user ${userId}.`);
await closeDatabase();