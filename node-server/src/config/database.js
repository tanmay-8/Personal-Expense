import { MongoClient } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

const client = new MongoClient(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017");
let databasePromise;

export async function getDatabase() {
  if (!databasePromise) {
    databasePromise = client.connect().then((connection) =>
      connection.db(process.env.MONGODB_DB_NAME || "personal_expense"),
    );
  }
  return databasePromise;
}

export async function closeDatabase() {
  await client.close();
  databasePromise = undefined;
}