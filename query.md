1. Layanan aktif per bulan dalam 1 tahun tampilan operasional  
   *SELECT*   
       *CAST(LEFT(cse.Period, 2\) AS UNSIGNED) AS month,*  
       *CAST(CONCAT('20', RIGHT(cse.Period, 2)) AS UNSIGNED) AS year,*  
       *c.BranchId AS branch\_id,*  
       *c.BranchCity AS branch,*  
       *s.ServiceGroup AS service\_group\_id,*  
       *sg.Description AS service\_group,*  
       *cse.ServiceId AS service\_id,*  
       *s.ServiceType AS service,*  
       *SUM(*  
           *CASE*  
               *WHEN cse.CustStatus IN ('AC', 'FR') THEN 1*  
               *ELSE 0*  
           *END*  
       *) AS total\_active,*  
       *SUM(*  
           *CASE*  
               *WHEN cse.CustStatus IN ('BL', 'NA') THEN 1*  
               *ELSE 0*  
           *END*  
       *) AS total\_churn*  
   *FROM CustomerServiceExcerpt cse*  
   *LEFT JOIN Services s*  
       *ON s.ServiceId \= cse.ServiceId*  
   *LEFT JOIN ServiceGroup sg*  
       *ON sg.ServiceGroup \= s.ServiceGroup*  
   *LEFT JOIN (*  
       *SELECT*  
           *c.CustId,*  
           *IFNULL(c.DisplayBranchId, c.BranchId) AS BranchId,*  
           *nb.BranchCity*  
       *FROM Customer c*  
       *LEFT JOIN NusaBranch nb*  
           *ON nb.BranchId \= IFNULL(c.DisplayBranchId, c.BranchId)*  
   *) c*  
       *ON c.CustId \= cse.CustId*  
   *WHERE cse.CustId IN (*  
       *SELECT CustId*  
       *FROM Customer*  
       *WHERE BranchId \= '020'*  
   *)*  
   *AND s.ServiceCategory \= 'access\_home'*  
   *AND cse.Period REGEXP '^(0\[1-9\]|1\[0-2\])25$'*  
   *GROUP BY*  
       *cse.Period,*  
       *c.BranchId,*  
       *c.BranchCity,*  
       *s.ServiceGroup,*  
       *sg.Description,*  
       *cse.ServiceId,*  
       *s.ServiceType;*  
     
2. Detail list customer nya tampilan operasional  
   *SELECT*  
       *cse.CustServId AS customer\_service\_id,*  
       *cse.CustId AS customer\_id,*  
       *c.CustName AS customer\_name,*  
       *c.installation\_address AS address,*  
       *c.BranchId AS branch\_id,*  
       *c.BranchCity AS branch,*  
       *s.ServiceGroup AS service\_group\_id,*  
       *sg.Description AS service\_group,*  
       *s.ServiceId AS service\_id,*  
       *s.ServiceType AS service,*  
       *c.SalesId AS sales\_id,*  
       *c.sales\_name,*  
       *c.ManagerSalesId AS manager\_sales\_id,*  
       *c.manager\_sales\_name,*  
       *cse.CustStatus AS status,*  
       *csact.insertTime AS active\_at*  
   *FROM CustomerServiceExcerpt cse*  
   *LEFT JOIN Services s ON*  
       *s.ServiceId \= cse.ServiceId*  
   *LEFT JOIN ServiceGroup sg ON*  
       *sg.ServiceGroup \= s.ServiceGroup*  
   *LEFT JOIN (*  
       *SELECT*  
           *cs.CustServId,*  
           *c.CustId,*  
           *c.CustName,*  
           *cs.installation\_address,*  
           *IFNULL(c.DisplayBranchId, c.BranchId) AS BranchId,*  
           *nb.BranchCity,*  
           *cs.SalesId,*  
           *CONCAT\_WS(' ', sls.EmpFName, sls.EmpLName) AS sales\_name,*  
           *cs.ManagerSalesId,*  
           *CONCAT\_WS(' ', mgr.EmpFName, mgr.EmpLName) AS manager\_sales\_name*  
       *FROM CustomerServices cs*  
       *LEFT JOIN Customer c ON*  
           *c.CustId \= cs.CustId*  
       *LEFT JOIN NusaBranch nb ON*  
           *nb.BranchId \= IFNULL(c.DisplayBranchId, c.BranchId)*  
       *LEFT JOIN Employee sls ON*  
           *sls.EmpId \= cs.SalesId*  
       *LEFT JOIN Employee mgr ON*  
           *mgr.EmpId \= cs.ManagerSalesId*  
   *) c ON*  
       *c.CustServId \= cse.CustServId*  
   *LEFT JOIN (*  
       *SELECT*  
           *cscsl.custServId,*  
           *cscsl.insertTime,*  
           *ROW\_NUMBER() OVER (*  
               *PARTITION BY cscsl.custServId*  
               *ORDER BY cscsl.insertTime ASC*  
           *) AS rn*  
       *FROM CustomerServiceChangeStatusLog cscsl*  
       *WHERE cscsl.status IN ('AC', 'FR')*  
   *) csact ON*  
       *csact.custServId \= cse.CustServId*  
       *AND csact.rn \= 1*  
   *WHERE cse.CustId IN (*  
       *SELECT CustId*  
       *FROM Customer*  
       *WHERE BranchId \= '020'*  
   *)*  
   *AND s.ServiceCategory \= 'access\_home'*  
   *AND cse.Period \= '1225';*  
     
     
     
3. Layanan aktif per bulan dalam 1 tahun tampilan sales  
   *SELECT*  
       *CAST(LEFT(cse.Period, 2\) AS UNSIGNED) AS month,*  
       *CAST(CONCAT('20', RIGHT(cse.Period, 2)) AS UNSIGNED) AS year,*  
       *c.BranchId AS branch\_id,*  
       *c.BranchCity AS branch,*  
       *c.ManagerSalesId AS manager\_sales\_id,*  
       *c.manager\_sales\_name,*  
       *c.SalesId AS sales\_id,*  
       *c.sales\_name,*  
       *SUM(*  
           *CASE*  
               *WHEN cse.CustStatus IN ('AC', 'FR') THEN 1*  
               *ELSE 0*  
           *END*  
       *) AS total\_active,*  
       *SUM(*  
           *CASE*  
               *WHEN cse.CustStatus IN ('BL', 'NA') THEN 1*  
               *ELSE 0*  
           *END*  
       *) AS total\_churn*  
   *FROM CustomerServiceExcerpt cse*  
   *LEFT JOIN Services s ON*  
       *s.ServiceId \= cse.ServiceId*  
   *LEFT JOIN (*  
       *SELECT*  
           *cs.CustServId,*  
           *IFNULL(c.DisplayBranchId, c.BranchId) AS BranchId,*  
           *nb.BranchCity,*  
           *cs.ManagerSalesId,*  
           *CONCAT\_WS(' ', mgr.EmpFName, mgr.EmpLName) AS manager\_sales\_name,*  
           *cs.SalesId,*  
           *CONCAT\_WS(' ', sls.EmpFName, sls.EmpLName) AS sales\_name*  
       *FROM CustomerServices cs*  
       *LEFT JOIN Customer c ON*  
           *c.CustId \= cs.CustId*  
       *LEFT JOIN NusaBranch nb ON*  
           *nb.BranchId \= IFNULL(c.DisplayBranchId, c.BranchId)*  
       *LEFT JOIN Employee mgr ON*  
           *mgr.EmpId \= cs.ManagerSalesId*  
       *LEFT JOIN Employee sls ON*  
           *sls.EmpId \= cs.SalesId*  
   *) c ON*  
       *c.CustServId \= cse.CustServId*  
   *WHERE cse.CustId IN (*  
       *SELECT CustId*  
       *FROM Customer*  
       *WHERE BranchId \= '020'*  
   *)*  
   *AND s.ServiceCategory \= 'access\_home'*  
   *AND cse.Period REGEXP '^(0\[1-9\]|1\[0-2\])25$'*  
   *GROUP BY*  
       *cse.Period,*  
       *c.BranchId,*  
       *c.BranchCity,*  
       *c.ManagerSalesId,*  
       *c.manager\_sales\_name,*  
       *c.SalesId,*  
       *c.sales\_name*  
   *ORDER BY*  
       *year,*  
       *month,*  
       *branch,*  
       *manager\_sales\_name,*  
       *sales\_name;*  
     
4. Detail list customer nya tampilan sales (sama seperti yang operasional)  
5. Pertumbuhan baru per bulan tampilan sales  
   *SELECT*  
       *MONTH(t.activated\_at) AS month,*  
       *YEAR(t.activated\_at) AS year,*  
       *IFNULL(c.DisplayBranchId, c.BranchId) AS branch\_id,*  
       *nb.BranchCity AS branch,*  
       *cs.ManagerSalesId AS manager\_sales\_id,*  
       *CONCAT\_WS(' ', mgr.EmpFName, mgr.EmpLName) AS manager\_sales\_name,*  
       *cs.SalesId AS sales\_id,*  
       *CONCAT\_WS(' ', sls.EmpFName, sls.EmpLName) AS sales\_name,*  
       *COUNT(DISTINCT t.customer\_service\_id) AS total\_new*  
   *FROM (*  
       *SELECT*  
           *cs.CustServId AS customer\_service\_id,*  
           *IFNULL(csact2.activated\_at, csact.activation\_date) AS activated\_at*  
       *FROM CustomerServices cs*  
       *LEFT JOIN (*  
           *SELECT*  
               *cshn.cust\_serv\_id AS customer\_service\_id,*  
               *MIN(cshn.insert\_time) AS activation\_date*  
           *FROM CustomerServicesHistoryNew cshn*  
           *WHERE cshn.description LIKE 'Activation%'*  
           *OR cshn.description LIKE 'Free%'*  
           *GROUP BY*  
               *cshn.cust\_serv\_id*  
       *) csact ON*  
           *csact.customer\_service\_id \= cs.CustServId*  
       *LEFT JOIN (*  
           *SELECT*  
               *cscsl.custServId AS customer\_service\_id,*  
               *cscsl.insertTime AS activated\_at,*  
               *ROW\_NUMBER() OVER (*  
                   *PARTITION BY cscsl.custServId*  
                   *ORDER BY cscsl.insertTime ASC*  
               *) AS rn*  
           *FROM CustomerServiceChangeStatusLog cscsl*  
           *WHERE cscsl.status IN ('AC', 'FR')*  
       *) csact2 ON*  
           *csact2.customer\_service\_id \= cs.CustServId*  
           *AND csact2.rn \= 1*  
   *) t*  
   *LEFT JOIN CustomerServices cs ON*  
       *cs.CustServId \= t.customer\_service\_id*  
   *LEFT JOIN Customer c ON*  
       *c.CustId \= cs.CustId*  
   *LEFT JOIN NusaBranch nb ON*  
       *nb.BranchId \= IFNULL(c.DisplayBranchId, c.BranchId)*  
   *LEFT JOIN Services s ON*  
       *s.ServiceId \= cs.ServiceId*  
   *LEFT JOIN Employee mgr ON*  
       *mgr.EmpId \= cs.ManagerSalesId*  
   *LEFT JOIN Employee sls ON*  
       *sls.EmpId \= cs.SalesId*  
   *WHERE s.ServiceCategory \= 'access\_home'*  
   *AND c.BranchId \= '020'*  
   *AND t.activated\_at \>= '2025-01-01'*  
   *AND t.activated\_at \< '2026-01-01'*  
   *GROUP BY*  
       *YEAR(t.activated\_at),*  
       *MONTH(t.activated\_at),*  
       *IFNULL(c.DisplayBranchId, c.BranchId),*  
       *nb.BranchCity,*  
       *cs.ManagerSalesId,*  
       *mgr.EmpFName,*  
       *mgr.EmpLName,*  
       *cs.SalesId,*  
       *sls.EmpFName,*  
       *sls.EmpLName*  
   *ORDER BY*  
       *year,*  
       *month,*  
       *branch,*  
       *manager\_sales\_name,*  
       *sales\_name;*  
 


6. Detail pertumbuhan baru  
   *SELECT*  
       *cs.CustServId AS customer\_service\_id,*  
       *c.CustId AS customer\_id,*  
       *c.CustName AS customer\_name,*  
       *cs.installation\_address AS address,*  
       *IFNULL(c.DisplayBranchId, c.BranchId) AS branch\_id,*  
       *nb.BranchCity AS branch,*  
       *s.ServiceGroup AS service\_group\_id,*  
       *sg.Description AS service\_group,*  
       *s.ServiceId AS service\_id,*  
       *s.ServiceType AS service,*  
       *cs.ManagerSalesId AS manager\_sales\_id,*  
       *CONCAT\_WS(' ', mgr.EmpFName, mgr.EmpLName) AS manager\_sales\_name,*  
       *cs.SalesId AS sales\_id,*  
       *CONCAT\_WS(' ', sls.EmpFName, sls.EmpLName) AS sales\_name,*  
       *cs.CustStatus AS status,*  
       *t.activated\_at*  
   *FROM (*  
       *SELECT*  
           *cs.CustServId AS customer\_service\_id,*  
           *IFNULL(csact2.activated\_at, csact.activation\_date) AS activated\_at*  
       *FROM CustomerServices cs*  
       *LEFT JOIN (*  
           *SELECT*  
               *cshn.cust\_serv\_id AS customer\_service\_id,*  
               *MIN(cshn.insert\_time) AS activation\_date*  
           *FROM CustomerServicesHistoryNew cshn*  
           *WHERE cshn.description LIKE 'Activation%'*  
           *OR cshn.description LIKE 'Free%'*  
           *GROUP BY*  
               *cshn.cust\_serv\_id*  
       *) csact ON*  
           *csact.customer\_service\_id \= cs.CustServId*  
       *LEFT JOIN (*  
           *SELECT*  
               *cscsl.custServId AS customer\_service\_id,*  
               *cscsl.insertTime AS activated\_at,*  
               *ROW\_NUMBER() OVER (*  
                   *PARTITION BY cscsl.custServId*  
                   *ORDER BY cscsl.insertTime ASC*  
               *) AS rn*  
           *FROM CustomerServiceChangeStatusLog cscsl*  
           *WHERE cscsl.status IN ('AC', 'FR')*  
       *) csact2 ON*  
           *csact2.customer\_service\_id \= cs.CustServId*  
           *AND csact2.rn \= 1*  
   *) t*  
   *LEFT JOIN CustomerServices cs ON*  
       *cs.CustServId \= t.customer\_service\_id*  
   *LEFT JOIN Customer c ON*  
       *c.CustId \= cs.CustId*  
   *LEFT JOIN NusaBranch nb ON*  
       *nb.BranchId \= IFNULL(c.DisplayBranchId, c.BranchId)*  
   *LEFT JOIN Services s ON*  
       *s.ServiceId \= cs.ServiceId*  
   *LEFT JOIN ServiceGroup sg ON*  
       *sg.ServiceGroup \= s.ServiceGroup*  
   *LEFT JOIN Employee mgr ON*  
       *mgr.EmpId \= cs.ManagerSalesId*  
   *LEFT JOIN Employee sls ON*  
       *sls.EmpId \= cs.SalesId*  
   *WHERE s.ServiceCategory \= 'access\_home'*  
   *AND c.BranchId \= '020'*  
   *AND t.activated\_at \>= '2025-01-01'*  
   *AND t.activated\_at \< '2026-01-01'*  
   *ORDER BY*  
       *t.activated\_at,*  
       *nb.BranchCity,*  
       *manager\_sales\_name,*  
       *sales\_name,*  
       *c.CustName;*  
     
7. Total pendapatan per branch per bulan tampilan sales  
   *SELECT*  
       *MONTH(gj.TglTransaksi) AS month,*  
       *YEAR(gj.TglTransaksi) AS year,*  
       *SUBSTRING(gj.NoPerkiraan, \-6, 3\) AS branch\_id,*  
       *nb.BranchCity AS branch,*  
       *SUM(gj.Kredit \- gj.Debet) AS total*  
   *FROM GeneralJournal gj*  
   *LEFT JOIN Panjar\_Penjualan\_Breakdown ppb ON*  
       *ppb.id \= gj.SumberId*  
       *AND gj.Sumber \= 'pnjr'*  
   *LEFT JOIN NewCustomerInvoice nci ON*  
       *nci.AI \= IFNULL(ppb.invoiceAI, gj.SumberId)*  
   *LEFT JOIN CustomerInvoiceTemp cit ON*  
       *cit.InvoiceNum \= nci.Id*  
       *AND cit.Urut \= nci.No*  
   *LEFT JOIN Services s ON*  
       *s.ServiceId \= cit.ServiceId*  
   *LEFT JOIN NusaBranch nb ON*  
       *nb.BranchId \= SUBSTRING(gj.NoPerkiraan, \-6, 3\)*  
   *WHERE gj.KodeCabang \= '020'*  
   *AND s.ServiceCategory \= 'access\_home'*  
   *AND gj.NoPerkiraan LIKE '400%'*  
   *AND gj.TglTransaksi \>= '2025-01-01'*  
   *AND gj.TglTransaksi \< '2026-01-01'*  
   *GROUP BY*  
       *YEAR(gj.TglTransaksi),*  
       *MONTH(gj.TglTransaksi),*  
       *SUBSTRING(gj.NoPerkiraan, \-6, 3),*  
       *nb.BranchCity*  
   *ORDER BY*  
       *year,*  
       *month,*  
       *branch;*  
     
8. Pendapatan yang sudah bayar  
   *SELECT*  
       *MONTH(gj.TglTransaksi) AS month,*  
       *YEAR(gj.TglTransaksi) AS year,*  
       *SUBSTRING(gj.NoPerkiraan, \-6, 3\) AS branch\_id,*  
       *nb.BranchCity AS branch,*  
       *SUM(gj.Kredit \- gj.Debet) AS total*  
   *FROM GeneralJournal gj*  
   *LEFT JOIN Panjar\_Penjualan\_Breakdown ppb ON*  
       *ppb.id \= gj.SumberId*  
       *AND gj.Sumber \= 'pnjr'*  
   *LEFT JOIN NewCustomerInvoice nci ON*  
       *nci.AI \= IFNULL(ppb.invoiceAI, gj.SumberId)*  
   *LEFT JOIN CustomerInvoiceTemp cit ON*  
       *cit.InvoiceNum \= nci.Id*  
       *AND cit.Urut \= nci.No*  
   *LEFT JOIN Services s ON*  
       *s.ServiceId \= cit.ServiceId*  
   *LEFT JOIN NusaBranch nb ON*  
       *nb.BranchId \= SUBSTRING(gj.NoPerkiraan, \-6, 3\)*  
   *LEFT JOIN NewCustomerInvoiceBatch ncib ON*  
       *ncib.AI \= nci.AI*  
   *LEFT JOIN (*  
       *SELECT DISTINCT*  
           *ncib.batchNo*  
       *FROM NewCustomerInvoice nci*  
       *LEFT JOIN NewCustomerInvoiceBatch ncib ON*  
           *ncib.AI \= nci.AI*  
       *WHERE nci.Type LIKE 'RA%'*  
       *AND IFNULL(nci.JournalDate, nci.TransDate) \< '2026-01-01'*  
       *AND ncib.batchNo IS NOT NULL*  
   *) nci2 ON*  
       *nci2.batchNo \= ncib.batchNo*  
   *WHERE gj.KodeCabang \= '020'*  
   *AND s.ServiceCategory \= 'access\_home'*  
   *AND gj.NoPerkiraan LIKE '400%'*  
   *AND nci2.batchNo IS NOT NULL*  
   *AND gj.TglTransaksi \>= '2025-01-01'*  
   *AND gj.TglTransaksi \< '2026-01-01'*  
   *GROUP BY*  
       *YEAR(gj.TglTransaksi),*  
       *MONTH(gj.TglTransaksi),*  
       *SUBSTRING(gj.NoPerkiraan, \-6, 3),*  
       *nb.BranchCity*  
   *ORDER BY*  
       *year,*  
       *month,*  
       *branch;*  
     
9. Detail list customer berdasarkan perndapatan  
   *SELECT*  
       *cit.CustServId AS customer\_service\_id,*  
       *cit.CustId AS customer\_id,*  
       *c.CustName AS customer\_name,*  
       *cs.installation\_address AS address,*  
       *SUBSTRING(gj.NoPerkiraan, \-6, 3\) AS branch\_id,*  
       *nb.BranchCity AS branch,*  
       *cit.ServiceGroup AS service\_group\_id,*  
       *sg.Description AS service\_group,*  
       *cit.ServiceId AS service\_id,*  
       *s.ServiceType AS service,*  
       *cs.ManagerSalesId AS manager\_sales\_id,*  
       *CONCAT\_WS(' ', mgr.EmpFName, mgr.EmpLName) AS manager\_sales\_name,*  
       *cs.SalesId AS sales\_id,*  
       *CONCAT\_WS(' ', sls.EmpFName, sls.EmpLName) AS sales\_name,*  
       *nci.AI AS invoice\_ai,*  
       *nci.Id AS invoice\_id,*  
       *nci.Description AS invoice\_description,*  
       *ncib.batchNo AS batch\_no,*  
       *nci2.receipt\_id,*  
       *gj.TglTransaksi AS billing\_date,*  
       *gj.Kredit \- gj.Debet AS total*  
   *FROM GeneralJournal gj*  
   *LEFT JOIN Panjar\_Penjualan\_Breakdown ppb ON*  
       *ppb.id \= gj.SumberId*  
       *AND gj.Sumber \= 'pnjr'*  
   *LEFT JOIN NewCustomerInvoice nci ON*  
       *nci.AI \= IFNULL(ppb.invoiceAI, gj.SumberId)*  
   *LEFT JOIN CustomerInvoiceTemp cit ON*  
       *cit.InvoiceNum \= nci.Id*  
       *AND cit.Urut \= nci.No*  
   *LEFT JOIN CustomerServices cs ON*  
       *cs.CustServId \= cit.CustServId*  
   *LEFT JOIN Customer c ON*  
       *c.CustId \= cit.CustId*  
   *LEFT JOIN NusaBranch nb ON*  
       *nb.BranchId \= SUBSTRING(gj.NoPerkiraan, \-6, 3\)*  
   *LEFT JOIN Services s ON*  
       *s.ServiceId \= cit.ServiceId*  
   *LEFT JOIN ServiceGroup sg ON*  
       *sg.ServiceGroup \= cit.ServiceGroup*  
   *LEFT JOIN Employee mgr ON*  
       *mgr.EmpId \= cs.ManagerSalesId*  
   *LEFT JOIN Employee sls ON*  
       *sls.EmpId \= cs.SalesId*  
   *LEFT JOIN NewCustomerInvoiceBatch ncib ON*  
       *ncib.AI \= nci.AI*  
   *LEFT JOIN (*  
       *SELECT*  
           *ncib.batchNo,*  
           *GROUP\_CONCAT(*  
               *DISTINCT nci.Id*  
               *ORDER BY nci.Date DESC*  
           *) AS receipt\_id*  
       *FROM NewCustomerInvoice nci*  
       *LEFT JOIN NewCustomerInvoiceBatch ncib ON*  
           *ncib.AI \= nci.AI*  
       *WHERE nci.Type LIKE 'RA%'*  
       *AND IFNULL(nci.JournalDate, nci.TransDate) \< '2026-01-01'*  
       *AND ncib.batchNo IS NOT NULL*  
       *GROUP BY*  
           *ncib.batchNo*  
   *) nci2 ON*  
       *nci2.batchNo \= ncib.batchNo*  
   *WHERE gj.KodeCabang \= '020'*  
   *AND s.ServiceCategory \= 'access\_home'*  
   *AND gj.NoPerkiraan LIKE '400%'*  
   *AND gj.TglTransaksi \>= '2025-01-01'*  
   *AND gj.TglTransaksi \< '2026-01-01'*  
   *ORDER BY*  
       *gj.TglTransaksi,*  
       *nb.BranchCity,*  
       *manager\_sales\_name,*  
       *sales\_name,*  
       *c.CustName;*  
     
   Tgl aktif dan status perlu didiskusikan. Karena itu bisa berubah-ubah.  
10. Total homepaid and homeconnect  
    *SELECT*  
        *MONTH(nci.InsertDate) AS month,*  
        *YEAR(nci.InsertDate) AS year,*  
        *IFNULL(c.DisplayBranchId, c.BranchId) AS branch\_id,*  
        *nb.BranchCity AS branch,*  
        *SUM(*  
            *CASE*  
                *WHEN nci2.batchNo IS NOT NULL THEN cit.CustTotSubsFee*  
                *ELSE 0*  
            *END*  
        *) AS total\_paid,*  
        *SUM(cit.CustTotSubsFee) AS total\_all*  
    *FROM CustomerInvoiceTemp cit*  
    *LEFT JOIN InvoiceTypeMonth itm ON*  
        *itm.InvoiceType \= cit.InvoiceType*  
    *LEFT JOIN NewCustomerInvoice nci ON*  
        *nci.Id \= cit.InvoiceNum*  
        *AND nci.No \= cit.Urut*  
    *LEFT JOIN NewCustomerInvoiceBatch ncib ON*  
        *ncib.AI \= nci.AI*  
    *LEFT JOIN (*  
        *SELECT*  
            *ncib.batchNo,*  
            *MIN(IFNULL(nci.JournalDate, nci.TransDate)) AS paid\_at*  
        *FROM NewCustomerInvoice nci*  
        *LEFT JOIN NewCustomerInvoiceBatch ncib ON*  
            *ncib.AI \= nci.AI*  
        *WHERE (*  
            *nci.Type LIKE 'RA%'*  
            *OR nci.Type \= 'payment'*  
        *)*  
        *AND ncib.batchNo IS NOT NULL*  
        *GROUP BY*  
            *ncib.batchNo*  
    *) nci2 ON*  
        *nci2.batchNo \= ncib.batchNo*  
    *LEFT JOIN Services s ON*  
        *s.ServiceId \= cit.ServiceId*  
    *LEFT JOIN Customer c ON*  
        *c.CustId \= cit.CustId*  
    *LEFT JOIN NusaBranch nb ON*  
        *nb.BranchId \= IFNULL(c.DisplayBranchId, c.BranchId)*  
    *WHERE s.ServiceCategory \= 'access\_home'*  
    *AND c.BranchId \= '020'*  
    *AND cit.RInvoiceNum \= 0*  
    *AND cit.Reverse \= 0*  
    *AND nci.InsertDate \>= '2026-01-01'*  
    *AND nci.InsertDate \< '2027-01-01'*  
    *GROUP BY*  
        *YEAR(nci.InsertDate),*  
        *MONTH(nci.InsertDate),*  
        *IFNULL(c.DisplayBranchId, c.BranchId),*  
        *nb.BranchCity*  
    *ORDER BY*  
        *year,*  
        *month,*  
        *branch;*  
      
11. Total pendapatan tahun ini  
    *SELECT*  
    	*SUM(gj.Kredit \- gj.Debet) total*  
    *FROM GeneralJournal gj*  
    *LEFT JOIN Panjar\_Penjualan\_Breakdown ppb ON*  
    	*ppb.id \= gj.SumberId*   
    	*AND gj.Sumber \= 'pnjr'*  
    *LEFT JOIN NewCustomerInvoice nci ON*  
    	*nci.AI \= IFNULL(ppb.invoiceAI, gj.SumberId)*  
    *LEFT JOIN CustomerInvoiceTemp cit ON*  
    	*cit.InvoiceNum \= nci.Id*  
    	*AND cit.Urut \= nci.No*  
    *LEFT JOIN Services s ON*  
    	*s.ServiceId \= cit.ServiceId*  
    *LEFT JOIN NusaBranch nb ON*  
    	*nb.BranchId \= SUBSTRING(gj.NoPerkiraan, \-6, 3\)*  
    *WHERE gj.KodeCabang \= '020'*  
    *AND s.ServiceCategory \= 'access\_home'*  
    *AND gj.NoPerkiraan LIKE '400%'*  
    *AND YEAR(gj.TglTransaksi) \= '2025'*

