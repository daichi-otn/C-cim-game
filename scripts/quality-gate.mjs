// M25 の再現可能な品質ゲート。ローカルと CI で同じ順番の検査を実行する。
import { spawnSync } from "node:child_process";
import process from "node:process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const commands = [
  ["run", "typecheck"],
  ["test", "--", "--reporter=dot"],
  ["run", "build"],
  ["run", "release:check"],
];

for (const args of commands) {
  console.log(`\n$ ${npm} ${args.join(" ")}`);
  const result = spawnSync(npm, args, {
    stdio: "inherit",
    env: { ...process.env, VITE_BASE: "/C-cim-game/" },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log("\nM25 の単体テスト・型検査・ビルド・公開前検査に成功しました。");
