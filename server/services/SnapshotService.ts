import { ISnapshotRepository, SnapshotsPayload } from "../repositories/ISnapshotRepository";
import { SnapshotRepository } from "../repositories/SnapshotRepository";

export class SnapshotService {
  constructor(private snapshotRepo: ISnapshotRepository = new SnapshotRepository()) {}

  public async getSnapshots(years: number[], tenure: string | null = null): Promise<SnapshotsPayload> {
    return this.snapshotRepo.findSnapshotsByYears(years, tenure);
  }
}
