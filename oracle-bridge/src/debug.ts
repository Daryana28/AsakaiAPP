// src/debug.ts
import "dotenv/config";

console.log("=== DEBUG START ===");
console.log("ORACLE_USER     =", process.env.ORACLE_USER);
console.log("ORACLE_CONNECT  =", process.env.ORACLE_CONNECT);
console.log("SQLSERVER_USER  =", process.env.SQLSERVER_USER);
console.log("SQLSERVER_DB    =", process.env.SQLSERVER_DB);
console.log("=== DEBUG END ===");

process.exit(0);