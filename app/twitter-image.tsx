import { ImageResponse } from "next/og";

export const alt = "CatFound: Davidson lost & found";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Preview card for GroupMe and group chats (SPEC §12). */
export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 80,
        background: "#0e5c61",
        color: "#ffffff",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ fontSize: 44, fontWeight: 700, opacity: 0.9 }}>CatFound</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ fontSize: 84, fontWeight: 700, lineHeight: 1.05 }}>
          Davidson lost &amp; found
        </div>
        <div style={{ fontSize: 40, color: "#f0b323" }}>Found something? Post it in seconds.</div>
      </div>
    </div>,
    size,
  );
}
