import { NextRequest, NextResponse } from "next/server";
import { DetailService } from "../services/DetailService";
import { RevenueService } from "../services/RevenueService";
import type { RevenueDetailLevel } from "../repositories/IRevenueRepository";
import {
  ServiceDetailLevel,
  MetricMode,
  NewServiceDetailLevel,
} from "../repositories/IDetailRepository";

export class DetailController {
  constructor(
    private detailService: DetailService = new DetailService(),
    private revenueService: RevenueService = new RevenueService(),
  ) {}

  public async handleGetDetail(req: NextRequest): Promise<NextResponse> {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");

    if (type === "new_service" || type === "new-service") {
      return this.handleGetNewServiceDetail(req);
    }
    if (type === "revenue") {
      return this.handleGetRevenueDetail(req);
    }
    return this.handleGetServiceDetail(req);
  }

  public async handleGetServiceDetail(req: NextRequest): Promise<NextResponse> {
    try {
      const { searchParams } = new URL(req.url);
      const periodsRaw = searchParams.get("periods");
      if (!periodsRaw) {
        return NextResponse.json({ error: "Missing required parameter: periods" }, { status: 400 });
      }

      const periods = periodsRaw.split(",").map((p) => p.trim());
      const level = (searchParams.get("level") as ServiceDetailLevel) || null;
      const entityId = searchParams.get("entityId") || null;
      const metricMode = (searchParams.get("metricMode") as MetricMode) || null;

      const rows = await this.detailService.getServiceDetails({
        periods,
        level,
        entityId,
        metricMode,
      });

      return NextResponse.json({ rows, total: rows.length });
    } catch (err) {
      console.error("[DetailController] Error in handleGetServiceDetail:", err);
      return NextResponse.json(
        { error: "Internal server error", message: String(err) },
        { status: 500 },
      );
    }
  }

  public async handleGetNewServiceDetail(req: NextRequest): Promise<NextResponse> {
    try {
      const { searchParams } = new URL(req.url);
      const periodsRaw = searchParams.get("periods");
      if (!periodsRaw) {
        return NextResponse.json({ error: "Missing required parameter: periods" }, { status: 400 });
      }

      const periods = periodsRaw.split(",").map((p) => p.trim());
      const level = (searchParams.get("level") as NewServiceDetailLevel) || null;
      const entityId = searchParams.get("entityId") || null;

      const rows = await this.detailService.getNewServiceDetails({
        periods,
        level,
        entityId,
      });

      return NextResponse.json({ rows, total: rows.length });
    } catch (err) {
      console.error("[DetailController] Error in handleGetNewServiceDetail:", err);
      return NextResponse.json(
        { error: "Internal server error", message: String(err) },
        { status: 500 },
      );
    }
  }

  public async handleGetRevenueDetail(req: NextRequest): Promise<NextResponse> {
    try {
      const { searchParams } = new URL(req.url);
      const periodsRaw = searchParams.get("periods");
      if (!periodsRaw) {
        return NextResponse.json({ error: "Missing required parameter: periods" }, { status: 400 });
      }

      const periods = periodsRaw.split(",").map((p) => p.trim());
      const level = (searchParams.get("level") as RevenueDetailLevel) || null;
      const entityId = searchParams.get("entityId") || null;

      const yearsRaw = searchParams.get("years");
      let years: number[];
      if (yearsRaw) {
        years = yearsRaw
          .split(",")
          .map((y) => parseInt(y.trim(), 10))
          .filter((y) => !isNaN(y));
      } else {
        const uniqueYears = Array.from(
          new Set(
            periods
              .map((p) => parseInt(p.slice(0, 4), 10))
              .filter((y) => !isNaN(y)),
          ),
        );
        years = uniqueYears.length > 0 ? uniqueYears : [new Date().getFullYear()];
      }

      const rows = await this.revenueService.getRevenueDetails(
        { periods, level, entityId },
        years,
      );

      return NextResponse.json({ rows, total: rows.length });
    } catch (err) {
      console.error("[DetailController] Error in handleGetRevenueDetail:", err);
      return NextResponse.json(
        { error: "Internal server error", message: String(err) },
        { status: 500 },
      );
    }
  }
}
