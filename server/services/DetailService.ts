import {
  IDetailRepository,
  ServiceDetailParams,
  NewServiceDetailParams,
} from "../repositories/IDetailRepository";
import { DetailRepository } from "../repositories/DetailRepository";
import type { EnrichedDetailRow } from "@/components/detail-table-modal";

export class DetailService {
  constructor(private detailRepo: IDetailRepository = new DetailRepository()) {}

  public async getServiceDetails(params: ServiceDetailParams): Promise<EnrichedDetailRow[]> {
    return this.detailRepo.findServiceDetails(params);
  }

  public async getNewServiceDetails(params: NewServiceDetailParams): Promise<EnrichedDetailRow[]> {
    return this.detailRepo.findNewServiceDetails(params);
  }
}
