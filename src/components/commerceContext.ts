import { createContext, useContext } from "react";
import type { CommerceData } from "../services/commerceModel";

export const CommerceContext = createContext<CommerceData | null>(null);

export function useCommerce(): CommerceData {
  const data = useContext(CommerceContext);
  if (!data) throw new Error("CommerceProvider is required");
  return data;
}
