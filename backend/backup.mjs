import { DatabaseSync, backup } from "node:sqlite";
const database = new DatabaseSync("/data/field.sqlite");
await backup(database, "/data/field-backup.sqlite");
database.close();
console.log("Consistent backup written to /data/field-backup.sqlite");
