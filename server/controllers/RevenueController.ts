import { NextRequest, NextResponse } from "next/server";
import { RevenueService } from "../services/RevenueService";

export class RevenueController {
  constructor(private revenueService: RevenueService = new RevenueService()) {}

  public async handleGetRevenueSnapshots(req: NextRequest): Promise<NextResponse> {
    try {
      const { searchParams } = new URL(req.url);
      const yearsRaw = searchParams.get("years");

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

      const data = await this.revenueService.getRevenueSnapshots(years);
      return NextResponse.json(data);
    } catch (err) {
      console.error("[RevenueController] Error fetching revenue snapshots:", err);
      return NextResponse.json(
        { error: "Internal server error", message: String(err) },
        { status: 500 },
      );
    }
  }
}
