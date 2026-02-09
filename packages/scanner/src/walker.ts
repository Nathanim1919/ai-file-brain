// Simple recursive directory walker
import fs from "fs/promises";
import path from "path";


export const walkDirectory = async (
    dir: string,
    fileList: string[] = [],
): Promise<string[]> => {
    const files = await fs.readdir(dir);


    for (const file of files) {
        const fullpath = path.join(dir, file);
        const stat = await fs.stat(fullpath);

        if (stat.isDirectory()) {
            await walkDirectory(fullpath, fileList);
        } else {
            fileList.push(fullpath);
        }
    }

    return fileList;
}