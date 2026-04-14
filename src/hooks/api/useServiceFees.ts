"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { queryKeys, type ServiceFeeFilters } from "@/lib/query-keys";

export interface ServiceFee {
  id: string;
  classAcademicId: string;
  name: string;
  description: string | null;
  amount: string;
  billingMonths: string[]; // Month[] as string[] in JSON
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  classAcademic?: {
    id: string;
    className: string;
    academicYear?: { year: string };
  };
  _count?: { bills: number };
}

interface ServiceFeeListResponse {
  success: boolean;
  data: {
    serviceFees: ServiceFee[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
}

interface ServiceFeeResponse {
  success: boolean;
  data: ServiceFee;
}

export function useServiceFees(filters: ServiceFeeFilters = {}) {
  return useQuery({
    queryKey: queryKeys.serviceFees.list(filters),
    queryFn: async () => {
      const { data } = await apiClient.get<ServiceFeeListResponse>(
        "/service-fees",
        {
          params: filters as Record<
            string,
            string | number | boolean | undefined
          >,
        },
      );
      return data.data;
    },
  });
}

export function useServiceFee(id: string) {
  return useQuery({
    queryKey: queryKeys.serviceFees.detail(id),
    queryFn: async () => {
      const { data } = await apiClient.get<ServiceFeeResponse>(
        `/service-fees/${id}`,
      );
      return data.data;
    },
    enabled: !!id,
  });
}

interface CreateServiceFeeInput {
  classAcademicId: string;
  name: string;
  description?: string;
  amount: string;
  billingMonths: string[];
  isActive?: boolean;
}

export function useCreateServiceFee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateServiceFeeInput) => {
      const { data } = await apiClient.post<ServiceFeeResponse>(
        "/service-fees",
        input,
      );
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.serviceFees.lists(),
      });
    },
  });
}

export function useUpdateServiceFee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<
        Pick<
          ServiceFee,
          "name" | "description" | "amount" | "billingMonths" | "isActive"
        >
      >;
    }) => {
      const { data } = await apiClient.put<ServiceFeeResponse>(
        `/service-fees/${id}`,
        updates,
      );
      return data.data;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.serviceFees.lists(),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.serviceFees.detail(vars.id),
      });
    },
  });
}

export function useDeleteServiceFee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/service-fees/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.serviceFees.lists(),
      });
    },
  });
}
