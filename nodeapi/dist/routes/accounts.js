"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const accountsController_js_1 = require("../controllers/accountsController.js");
const router = express_1.default.Router();
router.get('/', accountsController_js_1.getAccounts);
router.post('/', accountsController_js_1.createAccount);
exports.default = router;
