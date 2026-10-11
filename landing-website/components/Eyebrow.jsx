export function Eyebrow({ children }) {
  return <span className="acm-eyebrow"><span className="dot" />{children}</span>;
}

export function SectionHeading({ eyebrow, title, sub, center }) {
  return (
    <div className={`max-w-2xl ${center ? "mx-auto text-center" : ""} mb-12`}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mt-4" style={{ color: "var(--paddy)" }}>{title}</h2>
      {sub && <p className="mt-3 text-[15px] leading-relaxed" style={{ color: "#4b5548" }}>{sub}</p>}
    </div>
  );
}

export function PageHeader({ eyebrow, title, desc }) {
  return (
    <div className="max-w-2xl mx-auto text-center mb-10 md:mb-14">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mt-4" style={{ color: "var(--paddy)" }}>{title}</h1>
      {desc && <p className="mt-3 text-[15px] leading-relaxed" style={{ color: "#4b5548" }}>{desc}</p>}
    </div>
  );
}

export function Page({ children, tint }) {
  return (
    <section className="pt-28 md:pt-32 pb-16 md:pb-20 px-5 sm:px-6 md:px-10 min-h-[60vh]" style={{ background: tint ? "var(--mist)" : "#fff" }}>
      <div className="max-w-7xl mx-auto">{children}</div>
    </section>
  );
}
