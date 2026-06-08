import { ServiceMonthlySnapshot, OrganizationNode } from "@/types/entities";

function createSnapshot(params: Partial<ServiceMonthlySnapshot>): ServiceMonthlySnapshot {
  const group = params.serviceGroup ?? "Broadband Business";
  const basePrice = group === "Broadband Dedicated" ? 5000000 : group === "Broadband Education" ? 1500000 : 2500000;
  const isActive = params.isActiveEndOfPeriod ?? true;
  return {
    snapshotId: `snap-${Math.random().toString(36).substr(2, 9)}`,
    period: "2026-01",
    serviceId: "SRV-1001",
    custId: "CUST-DEFAULT",
    branchId: "branch-medan",
    leadId: "lead-rani",
    amId: "am-fajar",
    serviceGroup: "Broadband Business",
    activeServiceCount: 1,
    newServiceCount: 0,
    churnServiceCount: 0,
    blockServiceCount: 0,
    isActiveEndOfPeriod: true,
    isRegisteredInPeriod: false,
    isConnectedInPeriod: false,
    isPaidInPeriod: false,
    isChurnedInPeriod: false,
    isBlockedInPeriod: false,
    expectedRevenue: isActive ? basePrice : 0,
    actualRevenue: isActive ? basePrice : 0,
    dataCompletenessStatus: "complete",
    generatedAt: new Date().toISOString(),
    ...params,
  };
}

export const MOCK_ORGANIZATION_NODES: OrganizationNode[] = [
  // Branches
  { id: "branch-medan", code: "MDN", name: "Medan", type: "branch", parentId: null, managerUserId: null, isActive: true },
  { id: "branch-pekanbaru", code: "PKU", name: "Pekanbaru", type: "branch", parentId: null, managerUserId: null, isActive: true },
  { id: "branch-jakarta", code: "JKT", name: "Jakarta", type: "branch", parentId: null, managerUserId: null, isActive: true },
  { id: "branch-surabaya", code: "SUB", name: "Surabaya", type: "branch", parentId: null, managerUserId: null, isActive: true },
  { id: "branch-bali", code: "DPS", name: "Bali", type: "branch", parentId: null, managerUserId: null, isActive: true },
  
  // Lead AMs
  { id: "lead-rani", code: "L-RNI", name: "Rani Wulandari", type: "lead_am", parentId: "branch-medan", managerUserId: null, isActive: true },
  { id: "lead-budi", code: "L-BDI", name: "Budi Santoso", type: "lead_am", parentId: "branch-pekanbaru", managerUserId: null, isActive: true },
  { id: "lead-hendra", code: "L-HDR", name: "Hendra Wijaya", type: "lead_am", parentId: "branch-jakarta", managerUserId: null, isActive: true },
  { id: "lead-dewi", code: "L-DWI", name: "Dewi Lestari", type: "lead_am", parentId: "branch-surabaya", managerUserId: null, isActive: true },
  { id: "lead-ketut", code: "L-KTT", name: "I Ketut Ariawan", type: "lead_am", parentId: "branch-bali", managerUserId: null, isActive: true },
  
  // AMs under Rani (Medan)
  { id: "am-fajar", code: "AM-FJR", name: "Fajar Pratama", type: "am", parentId: "lead-rani", managerUserId: null, isActive: true },
  { id: "am-siti", code: "AM-STI", name: "Siti Rahma", type: "am", parentId: "lead-rani", managerUserId: null, isActive: true },
  { id: "am-dodi", code: "AM-DDI", name: "Dodi Kurniawan", type: "am", parentId: "lead-rani", managerUserId: null, isActive: true },
  
  // AMs under Budi (Pekanbaru)
  { id: "am-andi", code: "AM-AND", name: "Andi Wijaya", type: "am", parentId: "lead-budi", managerUserId: null, isActive: true },
  { id: "am-rina", code: "AM-RNA", name: "Rina Lestari", type: "am", parentId: "lead-budi", managerUserId: null, isActive: true },
  
  // AMs under Hendra (Jakarta)
  { id: "am-aditya", code: "AM-ADT", name: "Aditya Nugraha", type: "am", parentId: "lead-hendra", managerUserId: null, isActive: true },
  { id: "am-chandra", code: "AM-CND", name: "Chandra Kirana", type: "am", parentId: "lead-hendra", managerUserId: null, isActive: true },
  { id: "am-melisa", code: "AM-MLS", name: "Melisa Putri", type: "am", parentId: "lead-hendra", managerUserId: null, isActive: true },
  
  // AMs under Dewi (Surabaya)
  { id: "am-bambang", code: "AM-BBG", name: "Bambang Utomo", type: "am", parentId: "lead-dewi", managerUserId: null, isActive: true },
  { id: "am-eka", code: "AM-EKA", name: "Eka Sari", type: "am", parentId: "lead-dewi", managerUserId: null, isActive: true },
  
  // AMs under Ketut (Bali)
  { id: "am-wayan", code: "AM-WYN", name: "Wayan Darmawan", type: "am", parentId: "lead-ketut", managerUserId: null, isActive: true },
  { id: "am-made", code: "AM-MDE", name: "Made Suarta", type: "am", parentId: "lead-ketut", managerUserId: null, isActive: true },
];

// Build continuous timeline snapshots for both 2025 and 2026
export const MOCK_SNAPSHOTS: ServiceMonthlySnapshot[] = [];

const periods = [
  "2024-12", // Prior year ending bucket for 2025 (baseline)
  "2025-01", "2025-02", "2025-03", "2025-04", "2025-05", 
  "2025-06", "2025-07", "2025-08", "2025-09", "2025-10", 
  "2025-11", "2025-12",
  "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", 
  "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", 
  "2026-11", "2026-12"
];

// Dynamically generate services config
const servicesConfig: Array<{
  serviceId: string;
  branchId: string;
  leadId: string;
  amId: string;
  group: string;
  start: string;
  end: string;
}> = [];

const amConfigs = [
  { branchId: "branch-medan", leadId: "lead-rani", amId: "am-fajar" },
  { branchId: "branch-medan", leadId: "lead-rani", amId: "am-siti" },
  { branchId: "branch-medan", leadId: "lead-rani", amId: "am-dodi" },
  { branchId: "branch-pekanbaru", leadId: "lead-budi", amId: "am-andi" },
  { branchId: "branch-pekanbaru", leadId: "lead-budi", amId: "am-rina" },
  { branchId: "branch-jakarta", leadId: "lead-hendra", amId: "am-aditya" },
  { branchId: "branch-jakarta", leadId: "lead-hendra", amId: "am-chandra" },
  { branchId: "branch-jakarta", leadId: "lead-hendra", amId: "am-melisa" },
  { branchId: "branch-surabaya", leadId: "lead-dewi", amId: "am-bambang" },
  { branchId: "branch-surabaya", leadId: "lead-dewi", amId: "am-eka" },
  { branchId: "branch-bali", leadId: "lead-ketut", amId: "am-wayan" },
  { branchId: "branch-bali", leadId: "lead-ketut", amId: "am-made" },
];

const serviceGroups = ["Broadband Business", "Broadband Dedicated", "Broadband Education"];

let srvIdCounter = 1001;

// 1. Long persisting active services (about 80 services)
for (let i = 0; i < 80; i++) {
  const am = amConfigs[i % amConfigs.length];
  const group = serviceGroups[i % serviceGroups.length];
  servicesConfig.push({
    serviceId: `SRV-${srvIdCounter++}`,
    branchId: am.branchId,
    leadId: am.leadId,
    amId: am.amId,
    group,
    start: "2024-12",
    end: "2026-12"
  });
}

// 2. Services starting in 2025 (about 45 services)
const startPeriods2025 = ["2025-01", "2025-02", "2025-03", "2025-04", "2025-05", "2025-06", "2025-07", "2025-08", "2025-09", "2025-10", "2025-11", "2025-12"];
for (let i = 0; i < 45; i++) {
  const am = amConfigs[(i + 3) % amConfigs.length];
  const group = serviceGroups[(i + 1) % serviceGroups.length];
  const start = startPeriods2025[i % startPeriods2025.length];
  servicesConfig.push({
    serviceId: `SRV-${srvIdCounter++}`,
    branchId: am.branchId,
    leadId: am.leadId,
    amId: am.amId,
    group,
    start,
    end: "2026-12"
  });
}

// 3. Growth services in 2026 (about 55 services)
const startPeriods2026 = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12"];
for (let i = 0; i < 55; i++) {
  const am = amConfigs[(i + 7) % amConfigs.length];
  const group = serviceGroups[(i + 2) % serviceGroups.length];
  const start = startPeriods2026[i % startPeriods2026.length];
  servicesConfig.push({
    serviceId: `SRV-${srvIdCounter++}`,
    branchId: am.branchId,
    leadId: am.leadId,
    amId: am.amId,
    group,
    start,
    end: "2026-12"
  });
}

// 4. Churned services in 2025 (about 32 services)
const churnConfigs2025 = [
  { start: "2024-12", end: "2024-12" }, // Churn in 2025-01
  { start: "2024-12", end: "2025-01" }, // Churn in 2025-02
  { start: "2024-12", end: "2025-02" }, // Churn in 2025-03
  { start: "2024-12", end: "2025-03" }, // Churn in 2025-04
  { start: "2024-12", end: "2025-04" }, // Churn in 2025-05
  { start: "2024-12", end: "2025-05" }, // Churn in 2025-06
  { start: "2024-12", end: "2025-06" }, // Churn in 2025-07
  { start: "2024-12", end: "2025-07" }, // Churn in 2025-08
  { start: "2024-12", end: "2025-08" }, // Churn in 2025-09
  { start: "2024-12", end: "2025-09" }, // Churn in 2025-10
  { start: "2024-12", end: "2025-10" }, // Churn in 2025-11
  { start: "2024-12", end: "2025-11" }, // Churn in 2025-12
  { start: "2025-01", end: "2025-03" }, // Churn in 2025-04
  { start: "2025-02", end: "2025-05" }, // Churn in 2025-06
  { start: "2025-03", end: "2025-07" }, // Churn in 2025-08
  { start: "2025-04", end: "2025-09" }, // Churn in 2025-10
];
for (let i = 0; i < 32; i++) {
  const am = amConfigs[(i + 1) % amConfigs.length];
  const group = serviceGroups[i % serviceGroups.length];
  const config = churnConfigs2025[i % churnConfigs2025.length];
  servicesConfig.push({
    serviceId: `SRV-${srvIdCounter++}`,
    branchId: am.branchId,
    leadId: am.leadId,
    amId: am.amId,
    group,
    start: config.start,
    end: config.end
  });
}

// 5. Churned services in 2026 (about 40 services)
const churnConfigs2026 = [
  { start: "2024-12", end: "2025-12" }, // Churn in 2026-01
  { start: "2024-12", end: "2026-01" }, // Churn in 2026-02
  { start: "2024-12", end: "2026-02" }, // Churn in 2026-03
  { start: "2024-12", end: "2026-03" }, // Churn in 2026-04
  { start: "2024-12", end: "2026-04" }, // Churn in 2026-05
  { start: "2024-12", end: "2026-05" }, // Churn in 2026-06
  { start: "2024-12", end: "2026-06" }, // Churn in 2026-07
  { start: "2024-12", end: "2026-07" }, // Churn in 2026-08
  { start: "2024-12", end: "2026-08" }, // Churn in 2026-09
  { start: "2024-12", end: "2026-09" }, // Churn in 2026-10
  { start: "2024-12", end: "2026-10" }, // Churn in 2026-11
  { start: "2024-12", end: "2026-11" }, // Churn in 2026-12
  { start: "2025-06", end: "2026-03" }, // Churn in 2026-04
  { start: "2025-08", end: "2026-05" }, // Churn in 2026-06
  { start: "2026-01", end: "2026-07" }, // Churn in 2026-08
  { start: "2026-02", end: "2026-09" }, // Churn in 2026-10
];
for (let i = 0; i < 40; i++) {
  const am = amConfigs[(i + 5) % amConfigs.length];
  const group = serviceGroups[(i + 1) % serviceGroups.length];
  const config = churnConfigs2026[i % churnConfigs2026.length];
  servicesConfig.push({
    serviceId: `SRV-${srvIdCounter++}`,
    branchId: am.branchId,
    leadId: am.leadId,
    amId: am.amId,
    group,
    start: config.start,
    end: config.end
  });
}

periods.forEach((period) => {
  servicesConfig.forEach((srv) => {
    // Check if active in this period
    const isActive = period >= srv.start && period <= srv.end;
    
    // Check transitions
    const isRegistered = period === srv.start && period !== "2024-12" && period !== "2025-12";
    
    // Churned transition occurs on the period immediately AFTER the end period
    const srvEndIdx = periods.indexOf(srv.end);
    const isChurned = period > srv.end && srvEndIdx !== -1 && period === periods[srvEndIdx + 1];

    if (isActive || isChurned) {
      // Deterministic pseudo-random flags based on serviceId and period hash
      const hashStr = srv.serviceId + period;
      let hash = 0;
      for (let charIdx = 0; charIdx < hashStr.length; charIdx++) {
        hash = (hash << 5) - hash + hashStr.charCodeAt(charIdx);
        hash |= 0;
      }
      const randVal = Math.abs(hash) % 100;

      // Service ID number used for deterministic connection rate (~75% connect same period)
      const idNum = parseInt(srv.serviceId.replace(/\D/g, "")) || 0;
      const isConnected = isRegistered && (idNum % 4 !== 0); // 75% terhubung di period registrasi

      // Payment logic:
      // - New registered services: ~60% paid (funnel: registered → connect → pay)
      // - Existing active services: ~96% paid (simulate small outstanding gap)
      let isPaid: boolean;
      if (isRegistered) {
        // New service: must be connected first, then ~60% paid
        isPaid = isConnected && (randVal >= 40);
      } else {
        // Existing active: ~96% paid (small gap for outstanding simulation)
        isPaid = isActive && (randVal >= 4);
      }

      // Explicit simulation overrides for specific services to show consecutive outstanding periods
      if (srv.serviceId === "SRV-1002" && ["2026-01", "2026-02", "2026-03"].includes(period)) {
        isPaid = false;
      } else if (srv.serviceId === "SRV-1015" && ["2026-04", "2026-05"].includes(period)) {
        isPaid = false;
      } else if (srv.serviceId === "SRV-1025" && ["2026-07", "2026-08", "2026-09"].includes(period)) {
        isPaid = false;
      } else if (srv.serviceId === "SRV-1040" && ["2026-10", "2026-11"].includes(period)) {
        isPaid = false;
      }

      // Calculate expected & actual revenue
      const basePrice = srv.group === "Broadband Dedicated" ? 5000000 : srv.group === "Broadband Education" ? 1500000 : 2500000;
      const expectedRevenue = isActive ? basePrice : 0;
      const actualRevenue = isPaid ? basePrice : 0;

      MOCK_SNAPSHOTS.push(
        createSnapshot({
          period,
          serviceId: srv.serviceId,
          branchId: srv.branchId,
          leadId: srv.leadId,
          amId: srv.amId,
          serviceGroup: srv.group,
          activeServiceCount: isActive ? 1 : 0,
          newServiceCount: isRegistered ? 1 : 0,
          churnServiceCount: isChurned ? 1 : 0,
          isActiveEndOfPeriod: isActive,
          isRegisteredInPeriod: isRegistered,
          isConnectedInPeriod: isConnected,   // ~75% dari yang registered
          isPaidInPeriod: isPaid,             // connected + ~60% paid (baru), atau 96% (aktif lama)
          isChurnedInPeriod: isChurned,
          expectedRevenue,
          actualRevenue,
        })
      );
    }
  });
});
