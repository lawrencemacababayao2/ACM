export default function StatCard({ icon: Icon, value, label }) {
  return (
    <div className="card p-5 sm:p-6 flex items-center gap-4">
      <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "var(--mist)", color: "var(--growth-dark)" }}>
        <Icon size={22} />
      </div>
      <div>
        <div className="text-2xl font-bold" style={{ color: "var(--paddy)" }}>{value}</div>
        <div className="text-[12.5px]" style={{ color: "#5c6b57" }}>{label}</div>
      </div>
    </div>
  );
}
