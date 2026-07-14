import { NextRequest } from "next/server";
import { SnapshotController } from "@server/controllers/SnapshotController";

const controller = new SnapshotController();

export async function GET(req: NextRequest) {
  return controller.handleGetSnapshots(req);
}
