"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSqlPool = getSqlPool;
// src/sqlServerClient.ts
const mssql_1 = __importDefault(require("mssql"));
require("dotenv/config");
const sqlConfig = {
    user: process.env.SQLSERVER_USER,
    password: process.env.SQLSERVER_PASSWORD,
    server: process.env.SQLSERVER_HOST || "localhost",
    port: Number(process.env.SQLSERVER_PORT || 1433),
    database: process.env.SQLSERVER_DB || "master",
    options: {
        encrypt: false,
        trustServerCertificate: true,
    },
};
let pool = null;
async function getSqlPool() {
    if (pool && pool.connected)
        return pool;
    pool = await mssql_1.default.connect(sqlConfig);
    return pool;
}
