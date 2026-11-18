import { useState } from "react";
import { useCommerce } from "./commerceContext";
import { deleteDemoCustomer, saveDemoCustomer } from "../services/commerceClient";
import { deleteCustomer, getCustomers, saveCustomer, type Customer } from "../services/masterDataStorage";

export function useCustomerDirectory() {
  const { demo } = useCommerce();
  const [legacy, setLegacy] = useState(() => demo ? [] : getCustomers());

  return {
    customers: demo?.customers ?? legacy,
    async save(fields: Omit<Customer, "id" | "createdAt">, id?: string) {
      if (demo) await saveDemoCustomer(fields, id);
      else {
        saveCustomer(fields, id);
        setLegacy(getCustomers());
      }
    },
    async remove(id: string) {
      if (demo) await deleteDemoCustomer(id);
      else {
        deleteCustomer(id);
        setLegacy(getCustomers());
      }
    },
  };
}
