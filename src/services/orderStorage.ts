import {
  isEditable, isMinorAmount, validateOrderInput, orderTotalForEdit,
  type OrderInput, type OrderStatus, type SalesOrder,
} from "./orderModel.ts";
import { type CommerceRepository } from "./commerceRepository.ts";
import { needsPaymentReview, transitionError, type PaymentInput, type Product } from "./commerceModel.ts";
import { addPayment, browserRuntime, deductStock, findOrder, findProduct, moveStock, requireOperation, restoreStock, type BusinessRuntime } from "./commerceRules.ts";

export * from "./orderModel.ts";

function orderFields(input: OrderInput): OrderInput {
  return {
    customer: input.customer,
    customerId: input.customerId,
    customerSnapshot: input.customerSnapshot && { ...input.customerSnapshot },
    date: input.date,
    remarks: input.remarks,
    items: input.items.map(({ id, productId, sku, name, quantity, priceMinor }) => ({
      id, productId, sku, name, quantity, priceMinor,
    })),
  };
}

type ProductInput = Pick<Product, "sku" | "name" | "priceMinor" | "active" | "lowStockThreshold">;

export function createOrderService(repository: CommerceRepository, runtime: BusinessRuntime = browserRuntime) {
  return {
    read: () => repository.read(),

    createOrder(input: OrderInput, submit = false, operationId = runtime.id()): Promise<SalesOrder> {
      return repository.transact((data) => {
        requireOperation(operationId);
        const previous = data.orders.find((order) => order.creationOperationId === operationId);
        if (previous) return previous;
        const totalMinor = validateOrderInput(input);
        if (!input.customerId?.trim() || input.items.some((item) => !item.productId?.trim())) {
          throw new Error("请选择客户及商品");
        }
        let id: string;
        do {
          id = "ORD-" + runtime.id().slice(0, 8).toUpperCase();
        } while (data.orders.some((existing) => existing.id === id));
        const at = runtime.now();
        const order: SalesOrder = {
          ...orderFields(input), id, status: "draft", totalMinor, createdAt: at,
          submittedAt: submit ? at : undefined,
          creationOperationId: operationId,
          events: [{ status: "draft", at }],
        };
        data.orders.unshift(order);
        return order;
      });
    },

    updateOrder(id: string, input: OrderInput, submit = false): Promise<void> {
      return repository.transact((data) => {
        const order = findOrder(data, id);
        if (!isEditable(order)) throw new Error("订单已锁定或状态已变更");
        const calculated = validateOrderInput(input);
        if (!input.customerId && order.customerId) throw new Error("请选择客户");
        if (input.items.some((item) => !item.productId && !order.items.some(
          (old) => old.id === item.id && !old.productId,
        ))) throw new Error("请选择商品");

        const fields = orderFields(input);
        Object.assign(order, {
          ...fields,
          customer: input.customerId === order.customerId ? order.customer : fields.customer,
          customerSnapshot: input.customerId === order.customerId ? order.customerSnapshot : fields.customerSnapshot,
          totalMinor: orderTotalForEdit(order, fields.items, calculated),
          submittedAt: order.submittedAt ?? (submit ? runtime.now() : undefined),
        });
      });
    },

    updateOrderStatus(id: string, status: OrderStatus, cancellationReason = ""): Promise<void> {
      return repository.transact((data) => {
        const order = findOrder(data, id);
        const blocked = transitionError(order, status, data.payments);
        if (blocked) throw new Error(blocked);
        const reason = status === "cancelled" ? cancellationReason.trim() : undefined;
        if (status === "cancelled" && !reason) throw new Error("请填写取消原因");

        if (status === "confirmed") deductStock(data, order, runtime);
        if (status === "cancelled") restoreStock(data, order, runtime);
        order.status = status;
        order.cancellationReason = reason;
        order.events.push({ status, at: runtime.now(), cancellationReason: reason });
      });
    },

    recordPayment(id: string, input: PaymentInput, operationId: string) {
      return repository.transact((data) => addPayment(data, findOrder(data, id), input, operationId, runtime));
    },

    reconcilePayment(id: string, note: string, operationId: string, verifiedPayment?: PaymentInput) {
      return repository.transact((data) => {
        const order = findOrder(data, id);
        requireOperation(operationId);
        if (order.paymentReview?.operationId === operationId) return;
        if (!needsPaymentReview(order) || order.status === "completed" || order.status === "cancelled") {
          throw new Error("当前订单无需或无法核对付款");
        }
        if (!note.trim()) throw new Error("请填写核对依据");
        order.paymentReview = { at: runtime.now(), note: note.trim(), operationId };
        if (verifiedPayment) addPayment(data, order, verifiedPayment, operationId, runtime);
      });
    },

    saveProduct(input: ProductInput, id?: string, openingStock = 0, operationId = runtime.id()) {
      return repository.transact((data) => {
        requireOperation(operationId);
        const prior = data.products.find((product) => product.creationOperationId === operationId);
        if (!id && prior) return prior;
        if (!id && data.movements.some((entry) => entry.operationId === operationId)) {
          throw new Error("该操作编号已被使用");
        }
        const sku = input.sku.trim();
        const name = input.name.trim();
        if (!sku || !name || !isMinorAmount(input.priceMinor) || !isMinorAmount(input.lowStockThreshold)) {
          throw new Error("请填写有效的商品资料及低库存阈值");
        }
        if (data.products.some((product) => !product.archived && product.id !== id &&
          product.sku.toLowerCase() === sku.toLowerCase())) throw new Error("商品编号 SKU 已存在");

        const fields = { sku, name, priceMinor: input.priceMinor,
          active: input.active, lowStockThreshold: input.lowStockThreshold };
        if (id) {
          const product = findProduct(data, id);
          if (product.archived) throw new Error("商品已删除");
          Object.assign(product, fields);
          return product;
        }
        if (!isMinorAmount(openingStock)) throw new Error("期初库存必须为非负整数");
        const product: Product = {
          ...fields, id: runtime.id(), currentStock: 0, createdAt: runtime.now(),
          creationOperationId: operationId,
        };
        data.products.unshift(product);
        moveStock(data, product, openingStock, "opening", operationId, runtime);
        return product;
      });
    },

    adjustStock(id: string, quantity: number, operationId: string) {
      return repository.transact((data) => {
        requireOperation(operationId);
        if (!Number.isSafeInteger(quantity)) throw new Error("请输入整数调整数量");
        const product = findProduct(data, id);
        const previous = data.movements.find((entry) => entry.operationId === operationId);
        if (previous) {
          if (previous.productId === id && previous.quantity === quantity &&
              (previous.type === "opening" || previous.type === "adjustment")) return;
          throw new Error("该操作编号已被使用");
        }
        if (product.archived) throw new Error("商品已删除");
        const hasHistory = data.movements.some((entry) => entry.productId === id);
        if (hasHistory && quantity === 0) throw new Error("调整数量不可为零");
        moveStock(data, product, quantity, hasHistory ? "adjustment" : "opening", operationId, runtime);
      });
    },

    deleteProduct(id: string) {
      return repository.transact((data) => {
        const product = findProduct(data, id);
        if (product.archived) return;
        const liveDeduction = data.movements.some((entry) =>
          entry.productId === id && entry.type === "deduction" &&
          data.orders.some((order) => order.id === entry.orderId &&
            (order.status === "confirmed" || order.status === "processing")),
        );
        if (product.currentStock > 0 || liveDeduction) throw new Error("请先处理商品库存及待履约订单");
        product.archived = true;
        product.active = false;
      });
    },
  };
}
