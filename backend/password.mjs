import { randomBytes, scryptSync } from "node:crypto";
let password = "";
for await (const chunk of process.stdin) password += chunk;
password = password.replace(/\r?\n$/, "");
if (password.length < 14 || password.length > 256)
  throw new Error("Use an admin password of 14–256 characters");
const salt = randomBytes(16).toString("hex");
console.log(salt + ":" + scryptSync(password, salt, 64).toString("hex"));
