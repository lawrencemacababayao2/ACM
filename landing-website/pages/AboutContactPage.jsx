import { useState } from "react";
import { Send } from "lucide-react";
import { PageHeader, Page } from "../components/Eyebrow";
import { useLang } from "../src/lang";

export default function AboutContactPage() {
  const { bis } = useLang();
  const [sent, setSent] = useState(false);
  return (
    <Page>
      <PageHeader eyebrow={bis("About")} title={bis("Contact us")} desc={bis("Send a message and the office will respond within one to two business days.")} />
      <div className="max-w-xl mx-auto card p-6 sm:p-7">
        {sent ? (
          <div className="flex flex-col items-center justify-center text-center py-10">
            <div className="seal mb-4"><Send size={20} /></div>
            <h3 className="font-semibold text-[16px]" style={{ color: "var(--paddy)" }}>{bis("Message sent")}</h3>
            <p className="text-[13.5px] mt-2" style={{ color: "#5c6b57" }}>{bis("The office will get back to you within one to two business days.")}</p>
            <button onClick={() => setSent(false)} className="mt-5 text-[13.5px] font-semibold" style={{ color: "var(--growth-dark)", background: "none", border: "none", cursor: "pointer" }}>{bis("Send another message")}</button>
          </div>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); setSent(true); }} className="flex flex-col gap-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[12.5px] font-semibold" style={{ color: "var(--paddy)" }}>{bis("Name")}</label>
                <input required className="w-full mt-1.5 px-4 py-3 rounded-xl text-[13.5px]" style={{ border: "1px solid var(--line)" }} placeholder="Juan Dela Cruz" />
              </div>
              <div>
                <label className="text-[12.5px] font-semibold" style={{ color: "var(--paddy)" }}>{bis("Email")}</label>
                <input required type="email" className="w-full mt-1.5 px-4 py-3 rounded-xl text-[13.5px]" style={{ border: "1px solid var(--line)" }} placeholder="you@example.com" />
              </div>
            </div>
            <div>
              <label className="text-[12.5px] font-semibold" style={{ color: "var(--paddy)" }}>{bis("Subject")}</label>
              <input required className="w-full mt-1.5 px-4 py-3 rounded-xl text-[13.5px]" style={{ border: "1px solid var(--line)" }} placeholder={bis("What is this regarding?")} />
            </div>
            <div>
              <label className="text-[12.5px] font-semibold" style={{ color: "var(--paddy)" }}>{bis("Message")}</label>
              <textarea required rows={5} className="w-full mt-1.5 px-4 py-3 rounded-xl text-[13.5px] resize-none" style={{ border: "1px solid var(--line)" }} placeholder={bis("How can the office help you?")} />
            </div>
            <button type="submit" className="btn-primary justify-center mt-1">{bis("Send Message")} <Send size={16} /></button>
          </form>
        )}
      </div>
    </Page>
  );
}