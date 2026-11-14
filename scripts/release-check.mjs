// 公開前の静的な品質ゲート。ビルド後の dist と、公開設定の食い違いを検出する。
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(join(root, file), "utf8");
const failures = [];

function check(name, condition, detail = "") {
  if (condition) {
    console.log(`PASS  ${name}`);
  } else {
    failures.push(`${name}${detail ? `: ${detail}` : ""}`);
    console.log(`FAIL  ${name}${detail ? `  ${detail}` : ""}`);
  }
}

const pkg = JSON.parse(read("package.json"));
const version = pkg.version;
const main = read("src/main.ts");
const readme = read("README.md");
const pages = read(".github/workflows/pages.yml");
const sourceHtml = read("index.html");

check("パッケージが非公開設定", pkg.private === true);
check("アプリの版が package.json と一致", main.includes(`const VERSION = "${version}"`), version);
check("README の現在版が package.json と一致", readme.includes(`現在のバージョン: **${version}**`), version);
check("README の公開先が C-cim-game", readme.includes("https://daichi-otn.github.io/C-cim-game/"));
check("Pages は main の push で起動", /branches:\s*\[main\]/.test(pages));
check("Pages のビルド先が /C-cim-game/", pages.includes("VITE_BASE: /C-cim-game/"));
check("Pages は npm ci と build を使う", pages.includes("npm ci") && pages.includes("npm run build"));
check("Pages は dist を成果物にする", pages.includes("path: dist"));
check("HTML に日本語の lang がある", /<html\s+lang="ja">/.test(sourceHtml));
check("HTML に viewport がある", /name="viewport"/.test(sourceHtml));
check("HTML の id が重複していない", (() => {
  const ids = [...sourceHtml.matchAll(/\bid="([^"']+)"/g)].map((m) => m[1]);
  return ids.length === new Set(ids).size;
})());

const distHtmlPath = join(root, "dist", "index.html");
check("本番 dist/index.html がある", existsSync(distHtmlPath));
if (existsSync(distHtmlPath)) {
  const distHtml = readFileSync(distHtmlPath, "utf8");
  check("本番 HTML がビルド済み asset を参照", /<script[^>]+src="[^"]*\/assets\//.test(distHtml));
  check("本番 HTML が開発用 src/main.ts を参照しない", !distHtml.includes("/src/main.ts"));
  check("本番ライセンス表示が同梱", existsSync(join(root, "dist", "THIRD_PARTY_LICENSES.txt")));
}

if (failures.length) {
  console.error(`\n${failures.length} 件の公開前検査に失敗しました。`);
  process.exit(1);
}
console.log("\n公開前の静的検査にすべて成功しました。");
