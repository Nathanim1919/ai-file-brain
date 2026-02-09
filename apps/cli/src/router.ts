export const routeCommand = async (
    type: "structured" | "ai",
    payload: any
) => {
    if (type === "structured") {
       console.log("Structured command:", payload);
    } else if (type === "ai") {
       console.log("AI command:", payload);
    }
}