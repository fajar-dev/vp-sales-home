import {
  IRevenueRepository,
  RevenueDetailParams,
  RevenuePayload,
} from "../repositories/IRevenueRepository";
import { RevenueRepository } from "../repositories/RevenueRepository";
import type { EnrichedDetailRow } from "@/components/detail-table-modal";

export class RevenueService {
  constructor(private revenueRepo: IRevenueRepository = new RevenueRepository()) {}

  public async getRevenueSnapshots(years: number[]): Promise<RevenuePayload> {
    return this.revenueRepo.findRevenueSnapshotsByYears(years);
  }

  public async getRevenueDetails(
    params: RevenueDetailParams,
    years: number[],
  ): Promise<EnrichedDetailRow[]> {
    return this.revenueRepo.findRevenueDetails(params, years);
  }
}
