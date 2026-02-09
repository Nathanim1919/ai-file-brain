export const shouldIgnore = (filePath: string, ignored: string[]) => {
    return ignored.some(ignore => filePath.includes(ignore));
}