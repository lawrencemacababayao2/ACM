import { useState } from "react";
import { QrCode, X } from "lucide-react";
import { useLang } from "../src/lang";

export default function FloatingQR() {
  const { bis } = useLang();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full flex items-center justify-center shadow-lg"
        style={{
          background: "var(--growth)",
          color: "#fff",
          border: "none",
          cursor: "pointer",
        }}
        aria-label="Scan QR code"
      >
        <QrCode size={22} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.4)" }}
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-2xl p-6 sm:p-8 max-w-xs mx-4 shadow-xl text-center"
            onClick={(e) => e.stopPropagation()}
            style={{ border: "1px solid var(--line)" }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3
                className="font-bold text-lg"
                style={{ color: "var(--paddy)" }}
              >
                {bis("Download App")}
              </h3>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "#5c6b57",
                }}
              >
                <X size={20} />
              </button>
            </div>
            <img
              src="/DownloadbyQRcode.png"
              alt="QR Code"
              style={{
                width: 200,
                height: 200,
                margin: "0 auto",
                borderRadius: 12,
              }}
            />
            <p
              className="text-[13px] mt-4 leading-relaxed"
              style={{ color: "#5c6b57" }}
            >
              {bis("Scan to download the AgriConnect Medina app")}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
