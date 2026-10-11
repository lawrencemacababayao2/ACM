import { useEffect, useState } from "react";
import { PageHeader, Page } from "../components/Eyebrow";
import { withIcon } from "../components/icons";
import { SERVICES, SERVICE_DETAILS } from "../data";
import { api } from "../api";
import { useLang } from "../src/lang";

function fallbackDetail(key) {
  const base = SERVICES.find((s) => s.key === key);
  const detail = SERVICE_DETAILS[key];
  if (!base) return null;
  return {
    key, icon: "leaf", title: base.title, intro: detail?.intro || "", img: base.img,
    points: (detail?.points || []).map((p) => ({ title: p.title, desc: p.desc })),
  };
}

export default function ServiceDetailPage({ serviceKey }) {
  const { bis } = useLang();
  const [service, setService] = useState(null);

  useEffect(() => {
    let alive = true;
    api.sections().then((s) => {
      if (!alive) return;
      const list = s?.services;
      const found = (Array.isArray(list) ? list : []).find((x) => x.key === serviceKey);
      setService(found || fallbackDetail(serviceKey));
    }).catch(() => { if (alive) setService(fallbackDetail(serviceKey)); });
    return () => { alive = false; };
  }, [serviceKey]);

  if (!service) return <Page><p style={{ color: "#5c6b57" }}>{bis("Loading service…")}</p></Page>;

  const Cmp = withIcon(service).Icon;

  return (
    <Page>
      <PageHeader eyebrow={bis("Services")} title={bis(service.title)} desc={bis(service.intro)} />
      <div className="grid sm:grid-cols-2 gap-5 max-w-4xl mx-auto">
        {(service.points || []).map((pt, i) => (
          <div key={i} className="card p-6">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4" style={{ background: "var(--growth)", color: "#fff" }}><Cmp size={20} /></div>
            <h3 className="font-semibold text-[15px]" style={{ color: "var(--paddy)" }}>{bis(pt.title)}</h3>
            <p className="text-[13.5px] mt-2 leading-relaxed" style={{ color: "#5c6b57" }}>{bis(pt.desc)}</p>
          </div>
        ))}
      </div>
    </Page>
  );
}