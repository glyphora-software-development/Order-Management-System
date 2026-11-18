import { Fragment, useEffect, useState, type ReactNode } from "react";
import { CommerceContext } from "./commerceContext";
import { openWorkspace, subscribeCommerce } from "../services/commerceClient";
import type { CommerceData } from "../services/commerceModel";

export default function CommerceProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<CommerceData>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let version = 0;
    function refresh() {
      const request = ++version;
      void openWorkspace().then((snapshot) => {
        if (request !== version) return;
        setData(snapshot);
        setError("");
      }, (cause: unknown) => {
        if (request !== version) return;
        setError(cause instanceof Error ? cause.message : "无法读取业务资料");
      });
    }
    const unsubscribe = subscribeCommerce(refresh);
    refresh();
    return () => {
      version++;
      unsubscribe();
    };
  }, [attempt]);

  if (error) return (
    <section role="alert" className="ui-feedback ui-feedback-error">
      <p>{error}</p>
      <button className="ui-button" onClick={() => setAttempt(attempt + 1)}>重试</button>
    </section>
  );
  if (!data) return <div className="ui-loading" role="status"><i className="ui-spinner" aria-hidden="true" />正在加载订单和库存…</div>;
  return <CommerceContext.Provider value={data}>
    <Fragment key={data.demo?.generation ?? "local"}>{children}</Fragment>
  </CommerceContext.Provider>;
}
