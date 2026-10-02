import { closeDatabase } from "../config/database.js";
import { getDatabase } from "../config/database.js";
import { INITIAL_CATEGORIES } from "../services/expenseService.js";

const database = await getDatabase();
const categories = database.collection("categories");
for (const [name, icon, color] of INITIAL_CATEGORIES) {
  await categories.updateOne(
    { name },
    { $set: { name, icon, color, hidden: false, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
    { upsert: true },
  );
}
console.log(`Seeded ${INITIAL_CATEGORIES.length} categories into ${database.databaseName}.`);
await closeDatabase();