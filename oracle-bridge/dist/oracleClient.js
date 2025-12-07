"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.queryOracle = queryOracle;
// src/oracleClient.ts
const oracledb_1 = __importDefault(require("oracledb"));
require("dotenv/config");
const oracleConfig = {
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECT,
};
if (!oracleConfig.user ||
    !oracleConfig.password ||
    !oracleConfig.connectString) {
    console.error("[ORACLE] Config tidak lengkap:", oracleConfig);
    throw new Error("ORACLE_* di .env (oracle-bridge) belum lengkap");
}
async function queryOracle(sqlText, binds = {}) {
    let conn;
    try {
        conn = await oracledb_1.default.getConnection(oracleConfig);
        const lowered = sqlText.toLowerCase();
        if (lowered.includes(" delete ") ||
            lowered.includes(" update ") ||
            lowered.includes(" insert ") ||
            lowered.includes(" alter ") ||
            lowered.includes(" drop ")) {
            throw new Error("Write operations to Oracle are not allowed in this app");
        }
        const result = await conn.execute(sqlText, binds, {
            outFormat: oracledb_1.default.OUT_FORMAT_OBJECT,
        });
        return (result.rows || []);
    }
    finally {
        if (conn) {
            try {
                await conn.close();
            }
            catch {
                // ignore error close
            }
        }
    }
}
