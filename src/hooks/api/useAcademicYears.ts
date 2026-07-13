"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { type AcademicYearFilters, queryKeys } from "@/lib/query-keys";

interface AcademicYear {
  id: string;
  year: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
  _count?: {
    classAcademics: number;
  };
}

interface AcademicYearListResponse {
  success: boolean;
  data: {
    academicYears: AcademicYear[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
}

interface AcademicYearResponse {
  success: boolean;
  data: AcademicYear;
}

export function useAcademicYears(filters: AcademicYearFilters = {}) {
  return useQuery({
    queryKey: queryKeys.academicYears.list(filters),
    queryFn: async () => {
      const { data } = await apiClient.get<AcademicYearListResponse>(
        "/academic-years",
        {
          params: filters as Record<
            string,
            string | number | boolean | undefined
          >,
        },
      );
      return data.data;
    },
    // Reference data: changes rarely, mutations invalidate explicitly.
    staleTime: 10 * 60 * 1000,
  });
}

export function useAcademicYear(id: string) {
  return useQuery({
    queryKey: queryKeys.academicYears.detail(id),
    queryFn: async () => {
      const { data } = await apiClient.get<AcademicYearResponse>(
        `/academic-years/${id}`,
      );
      return data.data;
    },
    enabled: !!id,
  });
}

export function useCreateAcademicYear() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (academicYear: {
      year: string;
      startDate: string;
      endDate: string;
      isActive?: boolean;
    }) => {
      const { data } = await apiClient.post<AcademicYearResponse>(
        "/academic-years",
        academicYear,
      );
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.academicYears.lists(),
      });
    },
  });
}

export function useUpdateAcademicYear() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: {
        year?: string;
        startDate?: string;
        endDate?: string;
        isActive?: boolean;
      };
    }) => {
      const { data } = await apiClient.put<AcademicYearResponse>(
        `/academic-years/${id}`,
        updates,
      );
      return data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.academicYears.lists(),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.academicYears.detail(variables.id),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.classAcademics.lists(),
      });
    },
  });
}

export function useDeleteAcademicYear() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/academic-years/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.academicYears.lists(),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.classAcademics.lists(),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.discounts.lists(),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.feeServices.lists(),
      });
    },
  });
}

export function useSetActiveAcademicYear() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.post<AcademicYearResponse>(
        `/academic-years/${id}/set-active`,
      );
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.academicYears.lists(),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.academicYears.active(),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.classAcademics.lists(),
      });
    },
  });
}
