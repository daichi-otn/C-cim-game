import { defineConfig } from "vite";

// 公開先のフォルダ名。GitHub Pages では /C-cim-game/ の下に置かれる (VITE_BASE で指定)。
// Netlify などの、ルートに置く公開では、指定しない (/ のまま)。
const base = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.VITE_BASE ?? "/";

export default defineConfig({ base });
