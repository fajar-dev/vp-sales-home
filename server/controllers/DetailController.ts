import { NextRequest, NextResponse } from "next/server";
import { DetailService } from "../services/DetailService";
import { RevenueService } from "../services/RevenueService";
import type { RevenueDetailLevel } from "../repositories/IRevenueRepository";
import {
  ServiceDetailLevel,
  MetricMode,
  NewServiceSubMetric,
} from "../repositories/IDetailRepository";

/**
 * Unified detail endpoint behind every clickable label/cell of the
 * dashboards. `type` selects the data source:
 *  - `service`      → monthly status rows (total aktif / churn / blok)
 *  - `new_service`  → activation-driven rows (with funnel subMetric)
 *  - `revenue`      → journal lines (with optional unpaid-only gap view)
 */
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

  private parsePeriods(searchParams: URLSearchParams): string[] | null {
    const periodsRaw = searchParams.get("periods");
    if (!periodsRaw) return null;
    return periodsRaw
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
  }

  public async handleGetServiceDetail(req: NextRequest): Promise<NextResponse> {
    try {
      const { searchParams } = new URL(req.url);
      const periods = this.parsePeriods(searchParams);
      if (!periods) {
        return NextResponse.json({ error: "Parameter wajib tidak ada: periods" }, { status: 400 });
      }

      const level = (searchParams.get("level") as ServiceDetailLevel) || null;
      const entityId = searchParams.get("entityId") || null;
      // `metric` is what the pages send; `metricMode` kept for compatibility.
      const metricMode = ((searchParams.get("metric") ||
        searchParams.get("metricMode")) as MetricMode) || null;
      const tenure = searchParams.get("tenure") || null;

      const rows = await this.detailService.getServiceDetails({
        periods,
        level,
        entityId,
        metricMode,
        tenure,
      });

      return NextResponse.json({ rows, total: rows.length });
    } catch (err) {
      console.error("[DetailController] Error in handleGetServiceDetail:", err);
      return NextResponse.json(
        { error: "Gagal memuat detail layanan." },
        { status: 500 },
      );
    }
  }

  public async handleGetNewServiceDetail(req: NextRequest): Promise<NextResponse> {
    try {
      const { searchParams } = new URL(req.url);
      const periods = this.parsePeriods(searchParams);
      if (!periods) {
        return NextResponse.json({ error: "Parameter wajib tidak ada: periods" }, { status: 400 });
      }

      const level = (searchParams.get("level") as ServiceDetailLevel) || null;
      const entityId = searchParams.get("entityId") || null;
      const subMetric = (searchParams.get("subMetric") as NewServiceSubMetric) || null;

      const rows = await this.detailService.getNewServiceDetails({
        periods,
        level,
        entityId,
        subMetric,
      });

      return NextResponse.json({ rows, total: rows.length });
    } catch (err) {
      console.error("[DetailController] Error in handleGetNewServiceDetail:", err);
      return NextResponse.json(
        { error: "Gagal memuat detail layanan baru." },
        { status: 500 },
      );
    }
  }

  public async handleGetRevenueDetail(req: NextRequest): Promise<NextResponse> {
    try {
      const { searchParams } = new URL(req.url);
      const periods = this.parsePeriods(searchParams);
      if (!periods) {
        return NextResponse.json({ error: "Parameter wajib tidak ada: periods" }, { status: 400 });
      }

      const level = (searchParams.get("level") as RevenueDetailLevel) || null;
      const entityId = searchParams.get("entityId") || null;
      const unpaidOnly = searchParams.get("unpaid") === "1";

      const rows = await this.revenueService.getRevenueDetails({
        periods,
        level,
        entityId,
        unpaidOnly,
      });

      return NextResponse.json({ rows, total: rows.length });
    } catch (err) {
      console.error("[DetailController] Error in handleGetRevenueDetail:", err);
      return NextResponse.json(
        { error: "Gagal memuat detail pendapatan." },
        { status: 500 },
      );
    }
  }
}
