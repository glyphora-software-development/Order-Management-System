import { COMMERCE_SCHEMA_VERSION, type CommerceData, type Product } from "./commerceModel.ts";
import { parseMinor } from "./orderModel.ts";
import { CUSTOMER_KEY } from "./masterDataStorage.ts";
import {
  decodeOrderData,
  LEGACY_ORDER_KEY,
  migrateV1Orders,
  ORDER_BACKUP_KEY,
  ORDER_DATA_KEY,
  OrderDataError,
} from "./orderRepository.ts";

export const COMMERCE_DB = "glyphora-oms-commerce";
export const COMMERCE_STORE = "commerce";
export const PRODUCT_SOURCE_KEY = "glyphora-oms-products";
const DATA_KEY = "data";
const BACKUP_KEY = "migration-backup";

export interface CommerceRepository {
  read(): Promise<CommerceData>;
  transact<T>(change: (draft: CommerceData) => T): Promise<T>;
}

type SourceBackup = {
  v2Orders: string | null;
  v1Orders: string | null;
  v1Backup: string | null;
  products: string | null;
  customers?: string | null;
};

function migrateProducts(raw: string | null): Product[] {
  if (raw === null) return [];
  const data: unknown = JSON.parse(raw);
  if (!Array.isArray(data)) throw new Error("旧商品资料不是列表");

  const ids = new Set<string>();
  const skus = new Set<string>();
  return data.map((product) => {
    if (!product || typeof product.id !== "string" || !product.id.trim() ||
        typeof product.sku !== "string" || !product.sku.trim() ||
        typeof product.name !== "string" || !product.name.trim() ||
        typeof product.createdAt !== "string" || !Number.isFinite(Date.parse(product.createdAt)) ||
        typeof product.active !== "boolean" || typeof product.price !== "number" ||
        ids.has(product.id) || skus.has(product.sku.toLowerCase())) {
      throw new Error("旧商品记录格式无效或存在重复编号");
    }
    ids.add(product.id);
    skus.add(product.sku.toLowerCase());
    return {
      id: product.id,
      sku: product.sku,
      name: product.name,
      priceMinor: parseMinor(String(product.price)),
      active: product.active,
      createdAt: product.createdAt,
      currentStock: 0,
      lowStockThreshold: 0,
    };
  });
}

function migrate(backup: SourceBackup): CommerceData {
  if (backup.v2Orders === null && backup.v1Orders !== null && backup.v1Backup !== null &&
      backup.v1Orders !== backup.v1Backup) {
    throw new Error("V1 订单原文与备份不一致");
  }
  const v1 = backup.v1Orders ?? backup.v1Backup;
  const orders = backup.v2Orders !== null
    ? decodeOrderData(backup.v2Orders).orders
    : v1 !== null ? migrateV1Orders(v1).orders : [];

  return {
    schemaVersion: COMMERCE_SCHEMA_VERSION,
    orders: orders.map((source) => {
      const order = { ...source, legacyPaymentStatus: source.demoPaymentStatus };
      delete order.demoPaymentStatus;
      return order;
    }),
    products: migrateProducts(backup.products),
    payments: [],
    movements: [],
    legacySource: Object.values(backup).some((entry) => entry != null),
  };
}

function checkSnapshot(value: CommerceData | undefined): CommerceData {
  if (!value || value.schemaVersion !== COMMERCE_SCHEMA_VERSION ||
      !Array.isArray(value.orders) || !Array.isArray(value.products) ||
      !Array.isArray(value.payments) || !Array.isArray(value.movements) ||
      (value.demo !== undefined && (!value.demo || !Number.isSafeInteger(value.demo.version) ||
        !Number.isSafeInteger(value.demo.generation) || !Array.isArray(value.demo.customers)))) {
    throw new OrderDataError("业务资料版本或格式无效，原资料已保留");
  }
  return value;
}

export function createIndexedCommerceRepository(
  getFactory: () => IDBFactory,
  getStorage: () => Pick<Storage, "getItem">,
  dbName = COMMERCE_DB,
): CommerceRepository {
  let opening: Promise<IDBDatabase> | undefined;
  let ready: Promise<void> | undefined;

  function open() {
    opening ??= new Promise<IDBDatabase>((resolve, reject) => {
      let blocked = false;
      const request = getFactory().open(dbName, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(COMMERCE_STORE);
      request.onerror = () => reject(new OrderDataError("无法打开订单和库存存储", { cause: request.error }));
      request.onblocked = () => {
        blocked = true;
        reject(new OrderDataError("存储升级受阻，请关闭其他演示页面后重试"));
      };
      request.onsuccess = () => {
        const db = request.result;
        if (blocked) {
          db.close();
          return;
        }
        db.onversionchange = () => {
          db.close();
          opening = undefined;
          ready = undefined;
        };
        resolve(db);
      };
    }).catch((error) => {
      opening = undefined;
      throw error;
    });
    return opening;
  }

  async function run<T>(
    mode: IDBTransactionMode,
    key: string,
    change: (stored: unknown, store: IDBObjectStore, abort: (error: unknown) => void) => T,
  ): Promise<T> {
    const db = await open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(COMMERCE_STORE, mode);
      const store = transaction.objectStore(COMMERCE_STORE);
      let result: T;
      let cause: unknown;
      const abort = (error: unknown) => {
        cause = error;
        transaction.abort();
      };
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () => reject(cause ?? new OrderDataError(
        "业务资料写入失败，事务已回滚", { cause: transaction.error },
      ));
      const request = store.get(key);
      request.onsuccess = () => {
        try {
          result = change(request.result, store, abort);
        } catch (error) {
          abort(error);
        }
      };
    });
  }

  function initialize() {
    // Commit the exact source bytes before parsing. Both transactions serialize across tabs.
    ready ??= run("readwrite", BACKUP_KEY, (stored, store) => {
      if (stored !== undefined) return;
      const storage = getStorage();
      const backup: SourceBackup = {
        v2Orders: storage.getItem(ORDER_DATA_KEY),
        v1Orders: storage.getItem(LEGACY_ORDER_KEY),
        v1Backup: storage.getItem(ORDER_BACKUP_KEY),
        products: storage.getItem(PRODUCT_SOURCE_KEY),
        customers: storage.getItem(CUSTOMER_KEY),
      };
      store.put(backup, BACKUP_KEY);
    }).then(() => run("readwrite", DATA_KEY, (stored, store, abort) => {
      if (stored !== undefined) {
        checkSnapshot(stored as CommerceData);
        return;
      }
      const request = store.get(BACKUP_KEY);
      request.onsuccess = () => {
        try {
          store.put(migrate(request.result as SourceBackup), DATA_KEY);
        } catch (cause) {
          abort(cause);
        }
      };
    })).catch((error) => {
      ready = undefined;
      const message = error instanceof Error ? error.message : "未知错误";
      throw new OrderDataError("无法加载或迁移业务资料，旧资料已保留。 " + message, { cause: error });
    });
    return ready;
  }

  return {
    async read() {
      await initialize();
      return run("readonly", DATA_KEY, (stored) => checkSnapshot(stored as CommerceData));
    },
    async transact(change) {
      await initialize();
      return run("readwrite", DATA_KEY, (stored, store) => {
        const draft = checkSnapshot(stored as CommerceData);
        const result = change(draft);
        store.put(draft, DATA_KEY);
        return result;
      });
    },
  };
}
