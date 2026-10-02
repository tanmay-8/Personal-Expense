import { ObjectId } from "mongodb";
import { getDatabase } from "../config/database.js";

export const EXPENSE_CATEGORIES = ["Food", "Commute", "Utilities", "Shopping", "Rent", "Entertainment", "Travel", "Health", "Subscription", "Home", "Other"];
export const PAYMENT_METHODS = ["Cash", "Card", "UPI", "Bank transfer", "Other"];

function dateIsValid(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime());
}

function toId(value) {
  return ObjectId.isValid(value) ? new ObjectId(value) : null;
}

function cleanExpense(input) {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount must be greater than zero");
  if (!dateIsValid(input.date)) throw new Error("A valid date is required");
  if (!EXPENSE_CATEGORIES.includes(input.category)) throw new Error("Invalid category");
  return {
    amount: Math.round(amount * 100) / 100,
    date: input.date,
    category: input.category,
    description: String(input.description || "").trim().slice(0, 240),
    paymentMethod: PAYMENT_METHODS.includes(input.paymentMethod) ? input.paymentMethod : "Other",
    tripId: input.tripId && toId(input.tripId) ? toId(input.tripId) : null,
  };
}

function cleanTrip(input) {
  const name = String(input.name || "").trim().slice(0, 100);
  if (!name) throw new Error("Trip name is required");
  if (!dateIsValid(input.startDate) || !dateIsValid(input.endDate)) throw new Error("Valid trip dates are required");
  if (input.endDate < input.startDate) throw new Error("Trip end date cannot be before its start date");
  const budget = input.budget === "" || input.budget == null ? null : Number(input.budget);
  if (budget !== null && (!Number.isFinite(budget) || budget < 0)) throw new Error("Trip budget must be zero or more");
  return { name, destination: String(input.destination || "").trim().slice(0, 120), startDate: input.startDate, endDate: input.endDate, budget, notes: String(input.notes || "").trim().slice(0, 500) };
}

async function collections() {
  const db = await getDatabase();
  return { expenses: db.collection("expenses"), trips: db.collection("trips") };
}

export async function initializeDatabase() {
  const { expenses, trips } = await collections();
  await expenses.createIndex({ date: -1 });
  await expenses.createIndex({ tripId: 1, date: -1 });
  await trips.createIndex({ startDate: -1 });
}

export async function listExpenses(query = {}) {
  const { expenses } = await collections();
  const filter = {};
  if (query.month && /^\d{4}-\d{2}$/.test(query.month)) filter.date = { $gte: `${query.month}-01`, $lte: `${query.month}-31` };
  if (query.category && EXPENSE_CATEGORIES.includes(query.category)) filter.category = query.category;
  if (query.tripId) {
    const id = toId(query.tripId);
    if (!id) return [];
    filter.tripId = id;
  }
  return expenses.find(filter).sort({ date: -1, createdAt: -1 }).toArray();
}

export async function createExpense(input) {
  const { expenses, trips } = await collections();
  const expense = cleanExpense(input);
  if (expense.tripId && !(await trips.findOne({ _id: expense.tripId }))) throw new Error("Trip not found");
  const now = new Date();
  const result = await expenses.insertOne({ ...expense, createdAt: now, updatedAt: now });
  return expenses.findOne({ _id: result.insertedId });
}

export async function updateExpense(id, input) {
  const expenseId = toId(id);
  if (!expenseId) throw new Error("Invalid expense id");
  const { expenses, trips } = await collections();
  const expense = cleanExpense(input);
  if (expense.tripId && !(await trips.findOne({ _id: expense.tripId }))) throw new Error("Trip not found");
  const result = await expenses.findOneAndUpdate({ _id: expenseId }, { $set: { ...expense, updatedAt: new Date() } }, { returnDocument: "after" });
  if (!result) throw new Error("Expense not found");
  return result;
}

export async function deleteExpense(id) {
  const { expenses } = await collections();
  const result = await expenses.deleteOne({ _id: toId(id) });
  if (!result.deletedCount) throw new Error("Expense not found");
}

export async function listTrips() {
  const { trips, expenses } = await collections();
  const allTrips = await trips.find().sort({ startDate: -1 }).toArray();
  return Promise.all(allTrips.map(async (trip) => ({ ...trip, spent: (await expenses.aggregate([{ $match: { tripId: trip._id } }, { $group: { _id: null, total: { $sum: "$amount" } } }]).toArray())[0]?.total || 0 })));
}

export async function createTrip(input) {
  const { trips } = await collections();
  const trip = { ...cleanTrip(input), createdAt: new Date(), updatedAt: new Date() };
  const result = await trips.insertOne(trip);
  return trips.findOne({ _id: result.insertedId });
}

export async function updateTrip(id, input) {
  const { trips } = await collections();
  const result = await trips.findOneAndUpdate({ _id: toId(id) }, { $set: { ...cleanTrip(input), updatedAt: new Date() } }, { returnDocument: "after" });
  if (!result) throw new Error("Trip not found");
  return result;
}

export async function deleteTrip(id) {
  const tripId = toId(id);
  const { expenses, trips } = await collections();
  const result = await trips.deleteOne({ _id: tripId });
  if (!result.deletedCount) throw new Error("Trip not found");
  await expenses.updateMany({ tripId }, { $set: { tripId: null, updatedAt: new Date() } });
}

export async function getDashboard(month) {
  const expenses = await listExpenses({ month });
  const categoryTotals = Object.fromEntries(EXPENSE_CATEGORIES.map((category) => [category, 0]));
  const paymentTotals = Object.fromEntries(PAYMENT_METHODS.map((method) => [method, 0]));
  for (const expense of expenses) {
    categoryTotals[expense.category] += expense.amount;
    paymentTotals[expense.paymentMethod] += expense.amount;
  }
  return { total: expenses.reduce((sum, expense) => sum + expense.amount, 0), count: expenses.length, categoryTotals, paymentTotals, expenses };
}