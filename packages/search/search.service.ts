import type { SearchQuery } from "./search.types.js";
import { runSearchQuery } from "./search.repository.js";

export const searchFiles = (query: SearchQuery) => {
  return runSearchQuery(query);
};
