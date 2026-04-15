"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

interface StudentRef {
  nis: string;
  name: string;
  parentName?: string;
}

interface ClassAcademicRef {
  className: string;
  academicYear: { year: string };
}

export interface PrintPayment {
  id: string;
  amount: string;
  scholarshipAmount: string;
  paymentDate: string;
  notes: string | null;
  transactionId?: string | null;
  tuition: {
    id: string;
    period: string;
    year: number;
    feeAmount: string;
    scholarshipAmount: string;
    discountAmount: string;
    paidAmount: string;
    status: string;
    student: StudentRef;
    classAcademic: ClassAcademicRef;
  } | null;
  feeBill: {
    id: string;
    period: string;
    year: number;
    amount: string;
    paidAmount: string;
    status: string;
    student: StudentRef;
    classAcademic?: ClassAcademicRef;
    feeService: { name: string; category: "TRANSPORT" | "ACCOMMODATION" };
  } | null;
  serviceFeeBill: {
    id: string;
    period: string;
    year: number;
    amount: string;
    paidAmount: string;
    status: string;
    student: StudentRef;
    classAcademic?: ClassAcademicRef;
    serviceFee: { name: string };
  } | null;
  employee: { name: string } | null;
}

interface PrintPaymentsResponse {
  success: boolean;
  data: { payments: PrintPayment[] };
}

export function usePrintPayments(params: {
  academicYearId?: string;
  mode: "today" | "all" | "student";
  studentNis?: string;
  transactionId?: string;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: [
      "payments",
      "print",
      params.academicYearId,
      params.mode,
      params.studentNis,
      params.transactionId,
    ],
    queryFn: async () => {
      const { data } = await apiClient.get<PrintPaymentsResponse>(
        "/payments/print",
        {
          params: {
            academicYearId: params.academicYearId,
            mode: params.mode,
            studentNis: params.studentNis,
            transactionId: params.transactionId,
          },
        },
      );
      return data.data.payments;
    },
    enabled: params.enabled !== false,
  });
}
