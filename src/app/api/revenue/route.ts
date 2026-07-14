import { NextRequest } from "next/server";
import { RevenueController } from "@server/controllers/RevenueController";

const controller = new RevenueController();

export async function GET(req: NextRequest) {
  return controller.handleGetRevenueSnapshots(req);
}
