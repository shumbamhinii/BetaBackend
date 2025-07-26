"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const nlpController_js_1 = require("../controllers/nlpController.js");
const router = express_1.default.Router();
router.post('/parse', nlpController_js_1.parseText);
exports.default = router;
