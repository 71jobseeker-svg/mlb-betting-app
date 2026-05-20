import { readFileSync, writeFileSync } from "fs";

const path = ".env.local";
const buffer = readFileSync(path);

let text =
  buffer[0] === 0xff && buffer[1] === 0xfe
    ? buffer.toString("utf16le")
    : buffer.toString("utf8");

text = text.replace(/^\uFEFF/, "").replace(/\0/g, "").trim();

if (!text) {
  console.error(".env.local is empty");
  process.exit(1);
}

writeFileSync(path, `${text}\n`, { encoding: "utf8" });
console.log("Wrote .env.local as UTF-8");
