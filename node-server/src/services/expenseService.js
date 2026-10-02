import { ObjectId } from "mongodb";
import { getDatabase } from "../config/database.js";

export const PAYMENT_METHODS = ["Cash", "Card", "UPI", "Bank transfer", "Other"];
export const INITIAL_CATEGORIES = [
  ["Food", "🍽️", "#e5735b"], ["Commute", "🚗", "#5b8def"], ["Utilities", "💡", "#e6a23c"],
  ["Shopping", "🛍️", "#b46ee8"], ["Rent", "🏠", "#4c9f70"], ["Entertainment", "🎬", "#e06c9f"],
  ["Travel", "✈️", "#49a6a6"], ["Health", "❤", "#d85b66"], ["Subscription", "↻", "#7c83d4"],
  ["Home", "⌂", "#8b7565"], ["Other", "•", "#718096"],
];

function dateIsValid(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime());
}

function toId(value) {
  return ObjectId.isValid(value) ? new ObjectId(value) : null;
}

async function cleanExpense(input) {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount must be greater than zero");
  if (!dateIsValid(input.date)) throw new Error("A valid date is required");
  const { categories } = await collections();
  if (!(await categories.findOne({ name: input.category, hidden: { $ne: true } }))) throw new Error("Invalid or hidden category");
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
  return {
    expenses: db.collection("expenses"),
    trips: db.collection("trips"),
    categories: db.collection("categories"),
    recurring: db.collection("recurringExpenses"),
  };
}

export async function initializeDatabase() {
  const { expenses, trips, categories, recurring } = await collections();
  await expenses.createIndex({ date: -1 });
  await expenses.createIndex({ tripId: 1, date: -1 });
  await trips.createIndex({ startDate: -1 });
  await categories.createIndex({ name: 1 }, { unique: true });
  await recurring.createIndex({ active: 1, nextRunDate: 1 });
  await expenses.createIndex(
    { recurringExpenseId: 1, date: 1 },
    { unique: true, name: "recurring_occurrence_unique", partialFilterExpression: { recurringExpenseId: { $type: "objectId" } } },
  );
  if ((await categories.countDocuments()) === 0) await seedInitialCategories();
  await generateRecurringExpenses();
}

export async function seedInitialCategories() {
  const { categories } = await collections();
  for (const [name, icon, color] of INITIAL_CATEGORIES) {
    await categories.updateOne({ name }, { $setOnInsert: { name, icon, color, hidden: false, createdAt: new Date(), updatedAt: new Date() } }, { upsert: true });
  }
  return listCategories(true);
}

export async function listCategories(includeHidden = false) {
  const { categories } = await collections();
  return categories.find(includeHidden ? {} : { hidden: { $ne: true } }).sort({ name: 1 }).toArray();
}

function cleanCategory(input) {
  const name = String(input.name || "").trim().slice(0, 40);
  if (!name) throw new Error("Category name is required");
  if (!/^#[0-9a-f]{6}$/i.test(input.color || "")) throw new Error("Category color must be a hex color");
  return { name, icon: String(input.icon || "•").trim().slice(0, 4), color: input.color, hidden: Boolean(input.hidden) };
}

export async function createCategory(input) {
  const { categories } = await collections();
  const category = { ...cleanCategory(input), createdAt: new Date(), updatedAt: new Date() };
  try { const result = await categories.insertOne(category); return categories.findOne({ _id: result.insertedId }); } catch (error) { if (error.code === 11000) throw new Error("Category already exists"); throw error; }
}

export async function updateCategory(id, input) {
  const categoryId = toId(id);
  if (!categoryId) throw new Error("Invalid category id");
  const { categories, expenses, recurring } = await collections();
  const previous = await categories.findOne({ _id: categoryId });
  if (!previous) throw new Error("Category not found");
  const category = cleanCategory(input);
  if (category.name !== previous.name && await categories.findOne({ name: category.name, _id: { $ne: categoryId } })) throw new Error("Category already exists");
  const result = await categories.findOneAndUpdate({ _id: categoryId }, { $set: { ...cleanCategory(input), updatedAt: new Date() } }, { returnDocument: "after" });
  if (!result) throw new Error("Category not found");
  if (category.name !== previous.name) {
    await expenses.updateMany({ category: previous.name }, { $set: { category: category.name, updatedAt: new Date() } });
    await recurring.updateMany({ category: previous.name }, { $set: { category: category.name, updatedAt: new Date() } });
  }
  return result;
}

export async function deleteCategory(id) {
  const categoryId = toId(id);
  const { categories, expenses } = await collections();
  const category = await categories.findOne({ _id: categoryId });
  if (!category) throw new Error("Category not found");
  if (await expenses.findOne({ category: category.name })) throw new Error("Category has expenses; hide it instead");
  await categories.deleteOne({ _id: categoryId });
}

export async function listExpenses(query = {}) {
  const { expenses } = await collections();
  const filter = {};
  if (query.month && /^\d{4}-\d{2}$/.test(query.month)) filter.date = { $gte: `${query.month}-01`, $lte: `${query.month}-31` };
  if (query.category) filter.category = query.category;
  if (query.tripId) {
    const id = toId(query.tripId);
    if (!id) return [];
    filter.tripId = id;
  }
  return expenses.find(filter).sort({ date: -1, createdAt: -1 }).toArray();
}

export async function createExpense(input) {
  const { expenses, trips } = await collections();
  const expense = await cleanExpense(input);
  if (expense.tripId && !(await trips.findOne({ _id: expense.tripId }))) throw new Error("Trip not found");
  const now = new Date();
  const result = await expenses.insertOne({ ...expense, createdAt: now, updatedAt: now });
  return expenses.findOne({ _id: result.insertedId });
}

export async function updateExpense(id, input) {
  const expenseId = toId(id);
  if (!expenseId) throw new Error("Invalid expense id");
  const { expenses, trips } = await collections();
  const expense = await cleanExpense(input);
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
  const categories = await listCategories(true);
  const categoryTotals = Object.fromEntries(categories.map((category) => [category.name, 0]));
  const paymentTotals = Object.fromEntries(PAYMENT_METHODS.map((method) => [method, 0]));
  for (const expense of expenses) {
    categoryTotals[expense.category] += expense.amount;
    paymentTotals[expense.paymentMethod] += expense.amount;
  }
  return { total: expenses.reduce((sum, expense) => sum + expense.amount, 0), count: expenses.length, categoryTotals, paymentTotals, expenses };
}

function occurrenceDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function nextOccurrence(date, frequency) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (frequency === "weekly") next.setDate(next.getDate() + 7);
  else next.setMonth(next.getMonth() + 1);
  return next;
}

function cleanRecurring(input) {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount must be greater than zero");
  if (!dateIsValid(input.startDate)) throw new Error("A valid start date is required");
  if (!['weekly', 'monthly'].includes(input.frequency)) throw new Error("Frequency must be weekly or monthly");
  return { name: String(input.name || input.description || "Recurring expense").trim().slice(0, 100), amount: Math.round(amount * 100) / 100, category: String(input.category || ""), description: String(input.description || "").trim().slice(0, 240), paymentMethod: PAYMENT_METHODS.includes(input.paymentMethod) ? input.paymentMethod : "Other", frequency: input.frequency, startDate: input.startDate, endDate: input.endDate && dateIsValid(input.endDate) ? input.endDate : null, nextRunDate: input.startDate, active: input.active !== false };
}

export async function listRecurring() {
  const { recurring } = await collections();
  return recurring.find().sort({ active: -1, nextRunDate: 1 }).toArray();
}

export async function createRecurring(input) {
  const { recurring, categories } = await collections();
  const rule = cleanRecurring(input);
  if (!(await categories.findOne({ name: rule.category, hidden: { $ne: true } }))) throw new Error("Invalid or hidden category");
  const result = await recurring.insertOne({ ...rule, createdAt: new Date(), updatedAt: new Date() });
  await generateRecurringExpenses();
  return recurring.findOne({ _id: result.insertedId });
}

export async function updateRecurring(id, input) {
  const { recurring, categories } = await collections();
  const rule = cleanRecurring(input);
  if (!(await categories.findOne({ name: rule.category, hidden: { $ne: true } }))) throw new Error("Invalid or hidden category");
  const result = await recurring.findOneAndUpdate({ _id: toId(id) }, { $set: { ...rule, updatedAt: new Date() } }, { returnDocument: "after" });
  if (!result) throw new Error("Recurring expense not found");
  await generateRecurringExpenses();
  return result;
}

export async function deleteRecurring(id) {
  const { recurring } = await collections();
  const result = await recurring.deleteOne({ _id: toId(id) });
  if (!result.deletedCount) throw new Error("Recurring expense not found");
}

export async function generateRecurringExpenses(today = new Date()) {
  const { recurring, expenses } = await collections();
  const rules = await recurring.find({ active: true, nextRunDate: { $lte: occurrenceDate(today) } }).toArray();
  let created = 0;
  for (const rule of rules) {
    let runDate = rule.nextRunDate;
    while (runDate <= occurrenceDate(today) && (!rule.endDate || runDate <= rule.endDate)) {
      const expense = { amount: rule.amount, date: runDate, category: rule.category, description: rule.description || rule.name, paymentMethod: rule.paymentMethod, tripId: null, recurringExpenseId: rule._id, createdAt: new Date(), updatedAt: new Date() };
      const result = await expenses.updateOne({ recurringExpenseId: rule._id, date: runDate }, { $setOnInsert: expense }, { upsert: true });
      if (result.upsertedCount) created += 1;
      runDate = occurrenceDate(nextOccurrence(new Date(`${runDate}T00:00:00`), rule.frequency));
    }
    await recurring.updateOne({ _id: rule._id }, { $set: { nextRunDate: runDate, active: !rule.endDate || runDate <= rule.endDate, updatedAt: new Date() } });
  }
  return { created };
}