import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ZodObject, ZodRawShape, z } from "zod";

type Query = Record<string, string | string[] | undefined>;

function toQueryValue(value: unknown): string | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  if (Array.isArray(value)) {
    if (value.length === 0) return undefined;
    return value.map(String).join(",");
  }
  if (typeof value === "boolean") return value ? "true" : undefined;
  return String(value);
}

function pruneQuery(query: Query): Query {
  const out: Query = {};
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === "" || (Array.isArray(v) && v.length === 0))
      continue;
    out[k] = v;
  }
  return out;
}

export interface UseQueryFiltersOptions<TShape extends ZodRawShape> {
  schema: ZodObject<TShape>;
  defaultPage?: number;
  defaultLimit?: number;
  pageResetKeys?: Array<keyof z.infer<ZodObject<TShape>>>;
  debounceKeys?: Array<keyof z.infer<ZodObject<TShape>>>;
  debounceMs?: number;
}

export function useQueryFilters<TShape extends ZodRawShape>(
  options: UseQueryFiltersOptions<TShape>,
) {
  type Filters = z.infer<ZodObject<TShape>>;
  const {
    schema,
    defaultPage = 1,
    defaultLimit = 20,
    pageResetKeys,
    debounceKeys,
    debounceMs = 300,
  } = options;

  const router = useRouter();
  const filterKeys = useMemo(
    () => Object.keys(schema.shape) as (keyof Filters)[],
    [schema],
  );
  const debouncedSet = useMemo(
    () =>
      new Set<string>(
        (debounceKeys as string[] | undefined) ??
          filterKeys.filter((k) => k === "search" || k === "q").map(String),
      ),
    [debounceKeys, filterKeys],
  );
  const resetSet = useMemo(
    () =>
      new Set<string>(
        (pageResetKeys as string[] | undefined) ?? filterKeys.map(String),
      ),
    [pageResetKeys, filterKeys],
  );

  const parseFromQuery = useCallback(
    (raw: Query): Filters => {
      const candidate: Record<string, unknown> = {};
      for (const key of filterKeys) {
        const v = raw[key as string];
        if (v === undefined) continue;
        const shape = (
          schema.shape as unknown as Record<
            string,
            {
              def?: { type?: string };
              _def?: { typeName?: string; type?: string };
            }
          >
        )[key as string];
        const isArray =
          shape?.def?.type === "array" ||
          shape?._def?.type === "array" ||
          shape?._def?.typeName === "ZodArray";
        if (isArray && typeof v === "string")
          candidate[key as string] = v.split(",").filter(Boolean);
        else candidate[key as string] = Array.isArray(v) ? v[0] : v;
      }
      const parsed = schema.safeParse(candidate);
      return parsed.success
        ? (parsed.data as Filters)
        : (schema.parse({}) as Filters);
    },
    [filterKeys, schema],
  );

  const filters = useMemo(
    () => parseFromQuery(router.query as Query),
    [router.query, parseFromQuery],
  );
  const page =
    Number.parseInt((router.query.page as string) ?? "", 10) || defaultPage;
  const limit =
    Number.parseInt((router.query.limit as string) ?? "", 10) || defaultLimit;

  const [searchDrafts, setSearchDrafts] = useState<Record<string, string>>({});
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>(
    {},
  );

  // Flush drafts back to URL on debounce timer fire.
  useEffect(
    () => () => {
      for (const t of Object.values(debounceTimers.current)) clearTimeout(t);
    },
    [],
  );

  const writeQuery = useCallback(
    (patch: Query, resetPage: boolean) => {
      if (!router.isReady) return;
      const next: Query = { ...(router.query as Query), ...patch };
      if (resetPage) next.page = String(defaultPage);
      const pruned = pruneQuery(next);
      if (String(pruned.page ?? "") === String(defaultPage)) delete pruned.page;
      if (String(pruned.limit ?? "") === String(defaultLimit))
        delete pruned.limit;
      router.replace({ pathname: router.pathname, query: pruned }, undefined, {
        shallow: true,
      });
    },
    [router, defaultPage, defaultLimit],
  );

  const setFilter = useCallback(
    <K extends keyof Filters>(key: K, value: Filters[K] | null) => {
      const keyStr = String(key);
      const serialized = toQueryValue(value);
      const shouldResetPage = resetSet.has(keyStr);
      if (debouncedSet.has(keyStr)) {
        setSearchDrafts((d) => ({ ...d, [keyStr]: (value as string) ?? "" }));
        if (debounceTimers.current[keyStr])
          clearTimeout(debounceTimers.current[keyStr]);
        debounceTimers.current[keyStr] = setTimeout(() => {
          writeQuery({ [keyStr]: serialized }, shouldResetPage);
        }, debounceMs);
      } else {
        writeQuery({ [keyStr]: serialized }, shouldResetPage);
      }
    },
    [debouncedSet, resetSet, writeQuery, debounceMs],
  );

  const setFilters = useCallback(
    (patch: Partial<Filters>) => {
      const out: Query = {};
      let shouldResetPage = false;
      for (const [k, v] of Object.entries(patch)) {
        out[k] = toQueryValue(v);
        if (resetSet.has(k)) shouldResetPage = true;
      }
      writeQuery(out, shouldResetPage);
    },
    [resetSet, writeQuery],
  );

  const setPage = useCallback(
    (nextPage: number) => {
      writeQuery(
        { page: nextPage === defaultPage ? undefined : String(nextPage) },
        false,
      );
    },
    [writeQuery, defaultPage],
  );

  const setLimit = useCallback(
    (nextLimit: number) => {
      writeQuery(
        { limit: nextLimit === defaultLimit ? undefined : String(nextLimit) },
        true,
      );
    },
    [writeQuery, defaultLimit],
  );

  const reset = useCallback(() => {
    if (!router.isReady) return;
    const current = { ...(router.query as Query) };
    for (const k of filterKeys) delete current[k as string];
    delete current.page;
    delete current.limit;
    router.replace({ pathname: router.pathname, query: current }, undefined, {
      shallow: true,
    });
  }, [router, filterKeys]);

  // Expose draft values for debounced inputs (controlled components).
  const drafts = useMemo(() => {
    const out: Record<string, string> = {};
    for (const key of debouncedSet) {
      out[key] =
        key in searchDrafts
          ? searchDrafts[key]
          : (((filters as Record<string, unknown>)[key] as string) ?? "");
    }
    return out;
  }, [debouncedSet, searchDrafts, filters]);

  return {
    filters,
    page,
    limit,
    isReady: router.isReady,
    drafts,
    setFilter,
    setFilters,
    setPage,
    setLimit,
    reset,
  };
}
