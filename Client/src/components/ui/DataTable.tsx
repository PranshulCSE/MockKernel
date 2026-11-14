import React, { useState, useMemo } from 'react'
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '../../lib/cn'
import { Skeleton } from './Skeleton'
import { EmptyState } from './EmptyState'
import { Button } from './Button'

export interface Column<T> {
  key: string
  header: React.ReactNode
  render?: (row: T, index: number) => React.ReactNode
  sortable?: boolean
  sortValue?: (row: T) => string | number
  align?: 'left' | 'center' | 'right'
  width?: string
  className?: string
}

export interface DataTableProps<T> {
  data: T[]
  columns: Column<T>[]
  isLoading?: boolean
  keyExtractor?: (row: T, index: number) => string | number
  emptyState?: React.ReactNode
  emptyMessage?: string
  // External or Internal Pagination
  page?: number
  totalPages?: number
  totalItems?: number
  pageSize?: number
  onPageChange?: (page: number) => void
  // External Sorting
  sortBy?: string
  sortDirection?: 'asc' | 'desc' | null
  onSortChange?: (sortBy: string, direction: 'asc' | 'desc' | null) => void
  className?: string
  onRowClick?: (row: T) => void
}

export function DataTable<T extends Record<string, unknown>>({
  data,
  columns,
  isLoading = false,
  keyExtractor = (_row, idx) => idx,
  emptyState,
  emptyMessage = 'No records found.',
  page: controlledPage,
  totalPages: controlledTotalPages,
  totalItems: controlledTotalItems,
  pageSize = 10,
  onPageChange,
  sortBy: controlledSortBy,
  sortDirection: controlledSortDirection,
  onSortChange,
  className,
  onRowClick,
}: DataTableProps<T>) {
  // Internal sort state when uncontrolled
  const [internalSortKey, setInternalSortKey] = useState<string | null>(null)
  const [internalSortDir, setInternalSortDir] = useState<'asc' | 'desc' | null>(null)

  const activeSortKey = controlledSortBy !== undefined ? controlledSortBy : internalSortKey
  const activeSortDir = controlledSortDirection !== undefined ? controlledSortDirection : internalSortDir

  const handleHeaderClick = (col: Column<T>) => {
    if (!col.sortable) return
    const key = col.key
    let nextDir: 'asc' | 'desc' | null = 'asc'

    if (activeSortKey === key) {
      if (activeSortDir === 'asc') nextDir = 'desc'
      else if (activeSortDir === 'desc') nextDir = null
      else nextDir = 'asc'
    }

    if (onSortChange) {
      onSortChange(key, nextDir)
    } else {
      setInternalSortKey(nextDir ? key : null)
      setInternalSortDir(nextDir)
    }
  }

  // Internal client-side sorting when onSortChange is not provided
  const processedData = useMemo(() => {
    if (onSortChange || !activeSortKey || !activeSortDir) return data

    const activeCol = columns.find((c) => c.key === activeSortKey)
    return [...data].sort((a, b) => {
      let valA: unknown
      let valB: unknown

      if (activeCol?.sortValue) {
        valA = activeCol.sortValue(a)
        valB = activeCol.sortValue(b)
      } else {
        valA = a[activeSortKey]
        valB = b[activeSortKey]
      }

      if (valA === valB) return 0
      if (valA === null || valA === undefined) return 1
      if (valB === null || valB === undefined) return -1

      if (typeof valA === 'number' && typeof valB === 'number') {
        return activeSortDir === 'asc' ? valA - valB : valB - valA
      }

      const strA = String(valA).toLowerCase()
      const strB = String(valB).toLowerCase()
      const cmp = strA.localeCompare(strB)
      return activeSortDir === 'asc' ? cmp : -cmp
    })
  }, [data, columns, activeSortKey, activeSortDir, onSortChange])

  // Internal client-side pagination when onPageChange is not provided
  const [internalPage, setInternalPage] = useState(1)
  const currentPage = controlledPage !== undefined ? controlledPage : internalPage
  const totalPages =
    controlledTotalPages !== undefined
      ? controlledTotalPages
      : Math.max(1, Math.ceil(processedData.length / pageSize))
  const totalItems = controlledTotalItems !== undefined ? controlledTotalItems : processedData.length

  const paginatedData = useMemo(() => {
    if (onPageChange || controlledPage !== undefined) return processedData
    const start = (currentPage - 1) * pageSize
    return processedData.slice(start, start + pageSize)
  }, [processedData, currentPage, pageSize, onPageChange, controlledPage])

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return
    if (onPageChange) {
      onPageChange(newPage)
    } else {
      setInternalPage(newPage)
    }
  }

  return (
    <div
      className={cn(
        'w-full overflow-hidden rounded-card border border-white/10 bg-white/5 backdrop-blur-xl shadow-lg',
        className,
      )}
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left font-sans text-sm">
          <thead>
            <tr className="border-b border-white/10 bg-white/[0.03]">
              {columns.map((col) => {
                const isSorted = activeSortKey === col.key && activeSortDir !== null
                return (
                  <th
                    key={col.key}
                    scope="col"
                    style={{ width: col.width }}
                    className={cn(
                      'px-5 py-3.5 font-mono text-xs uppercase tracking-wider text-muted select-none',
                      col.align === 'center' && 'text-center',
                      col.align === 'right' && 'text-right',
                      col.sortable && 'cursor-pointer hover:text-ink transition-colors',
                      col.className,
                    )}
                    onClick={() => handleHeaderClick(col)}
                  >
                    <div
                      className={cn(
                        'flex items-center gap-1.5',
                        col.align === 'center' && 'justify-center',
                        col.align === 'right' && 'justify-end',
                      )}
                    >
                      <span>{col.header}</span>
                      {col.sortable && (
                        <span className="shrink-0 text-muted/60">
                          {isSorted ? (
                            activeSortDir === 'asc' ? (
                              <ArrowUp className="size-3.5 text-cyan" />
                            ) : (
                              <ArrowDown className="size-3.5 text-cyan" />
                            )
                          ) : (
                            <ArrowUpDown className="size-3.5 opacity-40 hover:opacity-100 transition-opacity" />
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>

          <tbody className="divide-y divide-white/5">
            {isLoading ? (
              Array.from({ length: pageSize > 5 ? 5 : pageSize }).map((_, rIdx) => (
                <tr key={`skel-row-${rIdx}`} className="bg-white/[0.01]">
                  {columns.map((c) => (
                    <td key={`skel-cell-${c.key}`} className="px-5 py-4">
                      <Skeleton className="h-4 w-4/5" rounded="sm" />
                    </td>
                  ))}
                </tr>
              ))
            ) : paginatedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-5 py-12 text-center">
                  {emptyState || (
                    <EmptyState
                      heading="No records found"
                      description={emptyMessage}
                      className="border-none bg-transparent shadow-none"
                    />
                  )}
                </td>
              </tr>
            ) : (
              paginatedData.map((row, rIdx) => (
                <tr
                  key={keyExtractor(row, rIdx)}
                  onClick={() => onRowClick?.(row)}
                  className={cn(
                    'bg-white/[0.01] transition-colors hover:bg-white/[0.04]',
                    onRowClick && 'cursor-pointer',
                  )}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        'px-5 py-4 text-ink font-sans',
                        col.align === 'center' && 'text-center',
                        col.align === 'right' && 'text-right',
                        col.className,
                      )}
                    >
                      {col.render
                        ? col.render(row, rIdx)
                        : (row[col.key] as React.ReactNode)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination controls footer */}
      {!isLoading && totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 px-5 py-3.5 bg-white/[0.02] text-xs text-muted">
          <div className="font-sans">
            Showing <span className="font-semibold text-ink">{(currentPage - 1) * pageSize + 1}</span> to{' '}
            <span className="font-semibold text-ink">{Math.min(currentPage * pageSize, totalItems)}</span> of{' '}
            <span className="font-semibold text-ink">{totalItems}</span> results
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => handlePageChange(currentPage - 1)}
              leftIcon={<ChevronLeft className="size-3.5" />}
              aria-label="Previous page"
            >
              Previous
            </Button>

            <span className="font-mono text-ink px-2">
              Page {currentPage} of {totalPages}
            </span>

            <Button
              variant="ghost"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => handlePageChange(currentPage + 1)}
              rightIcon={<ChevronRight className="size-3.5" />}
              aria-label="Next page"
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
