"use client";

import { useQuery } from "@tanstack/react-query";
import type { FeeServiceCategory, Month } from "@/generated/prisma/client";
import { apiClient } from "@/lib/api-client";

export interface PaymentCardMonth {
  index: number;
  month: Month;
  year: number;
  tuition: { amount: number; paidAmount: number } | null;
  feeBills: {
    amount: number;
    paidAmount: number;
    details: Array<{
      name: string;
      category: FeeServiceCategory;
      amount: number;
      paidAmount: number;
    }>;
  };
  serviceFeeBills: {
    amount: number;
    paidAmount: number;
    details: Array<{ name: string; amount: number; paidAmount: number }>;
  };
  totalAmount: number;
  totalPaid: number;
  lastPaymentDate: string | null;
  receiptNos: string[];
}

export interface PaymentCardData {
  student: {
    nis: string;
    name: string;
    address: string;
    parentName: string;
  };
  class: { className: string; grade: number; section: string } | null;
  academicYear: {
    id: string;
    year: string;
    startDate: string;
    endDate: string;
  };
  months: PaymentCardMonth[];
}

interface PaymentCardResponse {
  success: boolean;
  data: PaymentCardData;
}

export function usePaymentCard(
  nis: string | null | undefined,
  academicYearId?: string,
) {
  return useQuery({
    queryKey: ["payment-card", nis, academicYearId] as const,
    queryFn: async () => {
      const { data } = await apiClient.get<PaymentCardResponse>(
        `/students/${nis}/payment-card`,
        {
          params: academicYearId ? { academicYearId } : undefined,
        },
      );
      return data.data;
    },
    enabled: !!nis,
  });
}
