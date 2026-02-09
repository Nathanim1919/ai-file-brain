import { runScanner } from "../../../../packages/scanner/src/index.js";

export const handleScan = async () => {
    const files = await runScanner();

    console.log(`✅ scanned ${files.length} files`);

}