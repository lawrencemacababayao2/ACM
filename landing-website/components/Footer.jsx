import { Leaf } from "lucide-react";
import { FaFacebook } from "react-icons/fa";
import { FOOTER_LINKS } from "../data";
import { useLang } from "../src/lang";

export default function Footer({ navigate }) {
  const { bis } = useLang();
  return (
    <footer
      style={{ background: "var(--paddy)" }}
      className="pt-14 pb-8 px-5 sm:px-6 md:px-10 text-white/80"
    >
      <div className="max-w-7xl mx-auto grid sm:grid-cols-2 lg:grid-cols-4 gap-10">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <div className="rounded-full w-11">
              <img
                src="./medina-official-seal.jpg"
                alt="Medina Municipal Seal"
                className="object-cover rounded-full"
              />
            </div>
            <div className="rounded-full w-11">
              <img
                src="./mao-seal.png"
                alt="MAO Seal"
                className="rounded-full"
                style={{ width: 48, height: "auto", maxWidth: "none" }}
              />
            </div>

            <span className="font-bold text-white text-[15px]">
              AgriConnect Medina
            </span>
          </div>
          <p className="text-[13px] leading-relaxed">
            {bis(
              "The public portal of the Municipal Agriculture Office of Medina, Misamis Oriental.",
            )}
          </p>
        </div>
        <div>
          <h4 className="text-white font-semibold text-[13.5px] mb-4">
            {bis("Quick Links")}
          </h4>
          <div className="flex flex-col gap-2 text-[13px]">
            {FOOTER_LINKS.map(([label, p, hash]) => (
              <button
                key={label}
                onClick={() => {
                  navigate(p);
                  if (hash)
                    setTimeout(
                      () =>
                        document
                          .getElementById(hash)
                          ?.scrollIntoView({
                            behavior: "smooth",
                            block: "start",
                          }),
                      150,
                    );
                }}
                className="hover:text-white transition text-left"
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "inherit",
                  padding: 0,
                }}
              >
                {bis(label)}
              </button>
            ))}
          </div>
        </div>
        <div>
          <h4 className="text-white font-semibold text-[13.5px] mb-4">
            {bis("Contact")}
          </h4>
          <div className="flex flex-col gap-2 text-[13px]">
            <span>Poblacion, Medina, Misamis Oriental</span>
            <span>09177196318</span>
            <span>frederickdocdoc6@gmail.com</span>
          </div>
        </div>
        <div>
          <h4 className="text-white font-semibold text-[13.5px] mb-4">
            {bis("Follow the MAO")}
          </h4>
          <div className="flex gap-3">
            <a
              href="https://www.facebook.com/profile.php?id=100072492453972"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Facebook"
              className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{ border: "1px solid rgba(255,255,255,0.3)" }}
            >
              <FaFacebook size={16} />
            </a>
          </div>
        </div>
      </div>
      <div
        className="max-w-7xl mx-auto mt-10 pt-6 text-[12px] flex flex-col sm:flex-row justify-between gap-2"
        style={{ borderTop: "1px solid rgba(255,255,255,0.15)" }}
      >
        <span>
          {bis(
            "© 2026 Municipal Agriculture Office of Medina. All Rights Reserved.",
          )}
        </span>
        <span>
          {bis(
            "Built for farmers, fisherfolk, and livestock raisers of Medina.",
          )}
        </span>
      </div>
    </footer>
  );
}
