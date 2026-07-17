import { NextRequest, NextResponse } from "next/server";
import { SnapshotService } from "../services/SnapshotService";

export class SnapshotController {
  constructor(private snapshotService: SnapshotService = new SnapshotService()) {}

  public async handleGetSnapshots(req: NextRequest): Promise<NextResponse> {
    try {
      const { searchParams } = new URL(req.url);
      const yearsRaw = searchParams.get("years");
      const tenure = searchParams.get("tenure");

      let years: number[];
      if (yearsRaw) {
        years = yearsRaw
          .split(",")
          .map((y) => parseInt(y.trim(), 10))
          .filter((y) => !isNaN(y));
      } else {
        const currentYear = new Date().getFullYear();
        years = [currentYear - 1, currentYear];
      }

      const data = await this.snapshotService.getSnapshots(years, tenure);
      return NextResponse.json(data);
    } catch (err) {
      console.error("[SnapshotController] Error fetching snapshots:", err);
      return NextResponse.json(
        { error: "Gagal memuat data snapshot layanan." },
        { status: 500 },
      );
    }
  }
}
