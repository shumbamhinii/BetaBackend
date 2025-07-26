"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseText = void 0;
const axios_1 = __importDefault(require("axios"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const PYTHON_NLP_URL = process.env.PYTHON_NLP_URL || 'http://localhost:8000';
const parseText = async (req, res) => {
    const { text } = req.body;
    try {
        const response = await axios_1.default.post(`${PYTHON_NLP_URL}/nlp/parse`, { text });
        res.json(response.data);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to parse text' });
    }
};
exports.parseText = parseText;
