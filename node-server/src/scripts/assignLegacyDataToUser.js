import { ObjectId } from "mongodb";
import { closeDatabase, getDatabase } from "../config/database.js";

const targetUserId = process.argv[2] || process.env.MIGRATE_USER_ID;
if (!ObjectId.isValid(targetUserId)) {
  throw new Error("Usage: node src/scripts/assignLegacyDataToUser.js <userObjectId>");
}

const userId = new ObjectId(targetUserId);
const database = await getDatabase();
const user = await database.collection("users").findOne({ _id: userId }, { projection: { name: 1, email: 1 } });
if (!user) throw new Error(`User ${targetUserId} was not found`);

const ownershipFilter = { $or: [{ userId: null }, { userId: { $exists: false } }] };
const collectionNames = ["expenses", "trips", "categories", "recurringExpenses"];
const counts = {};

for (const name of collectionNames) {
  const collection = database.collection(name);
  if (name === "categories") {
    const legacyCategories = await collection.find(ownershipFilter).toArray();
    let merged = 0;
    let assigned = 0;
    for (const category of legacyCategories) {
      const existing = await collection.findOne({ userId, name: category.name });
      if (existing) {
        await collection.deleteOne({ _id: category._id, ...ownershipFilter });
        merged += 1;
      } else {
        await collection.updateOne({ _id: category._id, ...ownershipFilter }, { $set: { userId } });
        assigned += 1;
      }
    }
    counts[name] = { matched: legacyCategories.length, merged, assigned, ownedByTargetAfter: await collection.countDocuments({ userId }) };
    continue;
  }
  const before = await collection.countDocuments(ownershipFilter);
  const result = await collection.updateMany(ownershipFilter, { $set: { userId } });
  const after = await collection.countDocuments({ userId });
  counts[name] = { matched: before, modified: result.modifiedCount, ownedByTargetAfter: after };
}

console.log(JSON.stringify({ targetUser: { id: targetUserId, ...user }, collections: counts }, null, 2));
await closeDatabase();
