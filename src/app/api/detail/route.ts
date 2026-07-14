import { NextRequest } from "next/server";
import { DetailController } from "@server/controllers/DetailController";

const controller = new DetailController();

export async function GET(req: NextRequest) {
  return controller.handleGetDetail(req);
}
