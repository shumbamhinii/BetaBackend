"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createManualTransaction = exports.getTransactions = void 0;
const index_1 = __importDefault(require("../db/index"));
const getTransactions = async (req, res) => {
    try {
        const result = await index_1.default.query('SELECT * FROM transactions ORDER BY date DESC');
        res.json(result.rows);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch transactions' });
    }
};
exports.getTransactions = getTransactions;
const createManualTransaction = async (req, res) => {
    const { type, amount, description, date, category, account_id } = req.body;
    try {
        const query = `
      INSERT INTO transactions (type, amount, description, date, category, account_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;
        const values = [type, amount, description, date, category, account_id || null];
        const result = await index_1.default.query(query, values);
        res.status(201).json(result.rows[0]);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create transaction' });
    }
};
exports.createManualTransaction = createManualTransaction;
