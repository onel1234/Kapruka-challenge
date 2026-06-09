import { NextResponse } from "next/server";
import { getActor } from "@/lib/actor";
import { trackOrder } from "@/lib/kapruka";

export const runtime = "nodejs";

function cleanOrderNumber(value: unknown) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

export async function POST(request: Request) {
  try {
    const actor = await getActor();

    if (!actor) {
      return NextResponse.json({ error: "Sign in or continue as guest first." }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const orderNumber = cleanOrderNumber(body.orderNumber ?? body.order_number);

    if (orderNumber.length < 4) {
      return NextResponse.json({ error: "Enter the Kapruka order number from your paid order confirmation." }, { status: 400 });
    }

    const result = await trackOrder(orderNumber);

    if (typeof result === "string") {
      const error = result.replace(/^Error:\s*/i, "").trim() || "Order tracking failed.";
      return NextResponse.json({ error }, { status: result.toLowerCase().includes("not found") ? 404 : 502 });
    }

    return NextResponse.json({ tracking: result });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Order tracking failed.",
      },
      { status: 500 },
    );
  }
}
