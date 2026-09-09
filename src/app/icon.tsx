/** Generates the Snapshot application icon. */

import { ImageResponse } from "next/og";
import { Camera } from "lucide-react";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/** Renders the icon as a generated PNG response. */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "#e75d45",
          borderRadius: 8,
          display: "flex",
          height: "100%",
          justifyContent: "center",
          width: "100%",
        }}
      >
        <Camera color="white" size={19} strokeWidth={2.25} />
      </div>
    ),
    size,
  );
}