
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const a = process.argv[2], b = process.argv[3];
const h = (d) => fs.readdirSync(d).sort().map(f => [f, crypto.createHash("sha256").update(fs.readFileSync(path.join(d, f))).digest("hex").slice(0,16)]);
const A = h(a), B = h(b);
let same = 0;
for (let i = 0; i < A.length; i++) { const ok = A[i][1] === B[i][1]; if (ok) same++; console.log(A[i][0], ok ? "IDENTICAL" : "DIFFERS " + A[i][1] + " vs " + B[i][1]); }
console.log("determinism: " + same + "/" + A.length + " identical");
