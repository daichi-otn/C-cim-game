// CI 用に、Vite の起動完了を待つ。外部の wait-on パッケージには依存しない。
const url = process.argv[2] ?? "http://127.0.0.1:5173/";
const timeout = Number(process.argv[3] ?? 30000);
const started = Date.now();

while (Date.now() - started < timeout) {
  try {
    const response = await fetch(url);
    if (response.ok) {
      console.log(`server ready: ${url}`);
      process.exit(0);
    }
  } catch {
    // 起動中は接続できないので、短く待って再試行する。
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
}

console.error(`server did not start within ${timeout}ms: ${url}`);
process.exit(1);
