"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAccount = exports.getAccounts = void 0;
const index_js_1 = __importDefault(require("../db/index.js"));
const getAccounts = async (req, res) => {
    try {
        const result = await index_js_1.default.query('SELECT * FROM accounts ORDER BY id');
        res.json(result.rows);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch accounts' });
    }
};
exports.getAccounts = getAccounts;
const createAccount = async (req, res) => {
    const { code, name, type, parent_account_id } = req.body;
    try {
        const query = `
      INSERT INTO accounts (code, name, type, parent_account_id)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;
        const values = [code, name, type, parent_account_id || null];
        const result = await index_js_1.default.query(query, values);
        res.status(201).json(result.rows[0]);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create account' });
    }
};
exports.createAccount = createAccount;
