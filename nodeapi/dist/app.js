"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const axios_1 = __importDefault(require("axios"));
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
const PORT = 3000;
app.post("/api/parse", async (req, res) => {
    const { method, content } = req.body;
    try {
        if (method === "text") {
            const response = await axios_1.default.post("http://localhost:8000/nlp/parse", {
                text: content,
            });
            res.json(response.data);
        }
        else {
            res.status(400).json({ error: "Unsupported method" });
        }
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal server error" });
    }
});
app.listen(PORT, () => {
    console.log(`Node server running at http://localhost:${PORT}`);
});
