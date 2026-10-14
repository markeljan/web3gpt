"use client"

import {
  Award,
  ChevronLeft,
  ChevronRight,
  Crown,
  ExternalLink,
  FileCode,
  Filter,
  FolderGit,
  Gift,
  Hash as HashIcon,
  Layers,
  MapPin,
  Medal,
  Sparkles,
  Trophy,
  Users,
  X,
} from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { polygonAmoy } from "viem/chains"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getChainById, getDisplayChainById } from "@/lib/config"
import { AGENT_DEPLOY_CHAINS } from "@/lib/constants"
import { deduplicateDeployments } from "@/lib/deployment-analytics"
import type { DeploymentRecordBase } from "@/lib/types"
import { cn, getExplorerUrl, getIpfsUrl } from "@/lib/utils"

type CategoryFilter = "my-contracts" | "all-contracts" | "leaderboard" | "rewards"

const ACTIVE_REWARDS_CHAIN_ID = polygonAmoy.id
const ITEMS_PER_PAGE = 9
const LEADERBOARD_LIMIT = 10
const TOP_POSITIONS_COUNT = 3

type PaginationState = {
  currentPage: number
  totalPages: number
  totalItems: number
}

type FilterState = {
  selectedChain: number | null
  activeCategory: CategoryFilter
}

export function ContractsDashboard({
  userDeployments,
  allDeployments,
  initialChainId = null,
}: {
  userDeployments: DeploymentRecordBase[]
  allDeployments: DeploymentRecordBase[]
  initialChainId?: number | null
}) {
  const [filters, setFilters] = useState<FilterState>({
    activeCategory: initialChainId ? "all-contracts" : "my-contracts",
    selectedChain: initialChainId,
  })

  const [pagination, setPagination] = useState<PaginationState>({
    currentPage: 1,
    totalItems: 0,
    totalPages: 1,
  })

  // Generate unique keys for deployments to avoid duplication
  const generateUniqueKey = useCallback(
    (deployment: DeploymentRecordBase, index: number): string =>
      `${deployment.chainId}-${deployment.contractAddress}-${deployment.deployHash}-${index}`,
    []
  )

  // Match the public analytics identity so dashboard and API totals agree.
  const deduplicatedUserDeployments = useMemo(() => deduplicateDeployments(userDeployments), [userDeployments])

  const deduplicatedAllDeployments = useMemo(() => deduplicateDeployments(allDeployments), [allDeployments])

  const currentDeployments = useMemo(
    () => (filters.activeCategory === "my-contracts" ? deduplicatedUserDeployments : deduplicatedAllDeployments),
    [filters.activeCategory, deduplicatedUserDeployments, deduplicatedAllDeployments]
  )

  const filteredDeployments = useMemo(
    () =>
      currentDeployments.filter((deployment) => {
        const matchesChain = filters.selectedChain === null || deployment.chainId === filters.selectedChain
        return matchesChain
      }),
    [currentDeployments, filters.selectedChain]
  )

  const deploymentsByChain = useMemo(() => {
    const grouped = currentDeployments.reduce<Record<number, number>>((acc, deployment) => {
      const { chainId } = deployment
      if (!acc[chainId]) {
        acc[chainId] = 0
      }
      acc[chainId] += 1
      return acc
    }, {})
    return grouped
  }, [currentDeployments])

  // Pagination logic
  const paginatedDeployments = useMemo(() => {
    if (filters.activeCategory === "leaderboard" || filters.activeCategory === "rewards") {
      return filteredDeployments
    }

    const startIndex = (pagination.currentPage - 1) * ITEMS_PER_PAGE
    const endIndex = startIndex + ITEMS_PER_PAGE
    return filteredDeployments.slice(startIndex, endIndex)
  }, [filteredDeployments, pagination.currentPage, filters.activeCategory])

  // Update pagination when filtered deployments change
  useEffect(() => {
    const totalItems =
      filters.activeCategory === "leaderboard"
        ? Math.min(filteredDeployments.length, LEADERBOARD_LIMIT)
        : filteredDeployments.length

    const totalPages =
      filters.activeCategory === "leaderboard" || filters.activeCategory === "rewards"
        ? 1
        : Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE))

    setPagination((prev) => ({
      currentPage: prev.currentPage > totalPages ? 1 : prev.currentPage,
      totalItems,
      totalPages,
    }))
  }, [filteredDeployments.length, filters.activeCategory])

  const selectChainFilter = useCallback((chainId: number) => {
    setFilters((prev) => ({
      ...prev,
      selectedChain: prev.selectedChain === chainId ? null : chainId,
    }))
    setPagination((prev) => ({ ...prev, currentPage: 1 }))
  }, [])

  const clearFilters = useCallback(() => {
    setFilters((prev) => ({ ...prev, selectedChain: null }))
    setPagination((prev) => ({ ...prev, currentPage: 1 }))
  }, [])

  const setActiveCategory = useCallback((category: CategoryFilter) => {
    setFilters((prev) => ({
      ...prev,
      activeCategory: category,
      selectedChain: null, // Reset chain filter when changing category
    }))
    setPagination({ currentPage: 1, totalItems: 0, totalPages: 1 })
  }, [])

  const goToPage = useCallback(
    (page: number) => {
      if (page >= 1 && page <= pagination.totalPages) {
        setPagination((prev) => ({ ...prev, currentPage: page }))
      }
    },
    [pagination.totalPages]
  )

  const categoryButtons = [
    {
      count: deduplicatedUserDeployments.length,
      description: "View and manage your deployed smart contracts",
      icon: Users,
      id: "my-contracts" as const,
      label: "My Contracts",
    },
    {
      count: deduplicatedAllDeployments.length,
      description: "Explore deployed smart contracts",
      icon: Layers,
      id: "all-contracts" as const,
      label: "All Contracts",
    },
    {
      count: null,
      description: "Track rankings and compete with other builders",
      icon: Trophy,
      id: "leaderboard" as const,
      label: "Leaderboard",
    },
    {
      count: null,
      description: "Earn rewards for completing deployment challenges",
      icon: Gift,
      id: "rewards" as const,
      label: "Rewards",
    },
  ]

  const activeDescription = categoryButtons.find((cat) => cat.id === filters.activeCategory)?.description

  // Filter leaderboard deployments by chain
  const leaderboardDeployments = useMemo(() => {
    const deployments = deduplicatedAllDeployments.filter((deployment) => {
      const matchesChain = filters.selectedChain === null || deployment.chainId === filters.selectedChain
      return matchesChain
    })
    return deployments.slice(0, LEADERBOARD_LIMIT)
  }, [deduplicatedAllDeployments, filters.selectedChain])

  // Get filtered chains for rewards
  const rewardChains = useMemo(
    () =>
      filters.selectedChain
        ? AGENT_DEPLOY_CHAINS.filter((chain) => chain.id === filters.selectedChain)
        : AGENT_DEPLOY_CHAINS,
    [filters.selectedChain]
  )

  return (
    <div className="min-h-full bg-linear-to-br from-background to-muted">
      <div className="container mx-auto max-w-7xl px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="font-bold text-3xl tracking-tight">Contract Deployments</h1>
              <p className="mt-1 text-muted-foreground">{activeDescription}</p>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Layers className="h-4 w-4" />
              <span>
                {(() => {
                  if (filters.activeCategory === "leaderboard") {
                    return `${leaderboardDeployments.length} recent deployments`
                  }
                  if (filters.activeCategory === "rewards") {
                    return `${rewardChains.length} chains`
                  }
                  return `${filteredDeployments.length} deployments`
                })()}
                {filters.selectedChain ? ` on ${getChainById(filters.selectedChain)?.name}` : null}
              </span>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card className="group transition-all duration-200 hover:shadow-md">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-2.5 transition-colors group-hover:bg-primary/15">
                  <Layers className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-muted-foreground text-sm">Active Chain</p>
                  <p className="font-bold text-2xl">
                    {filters.selectedChain ? getChainById(filters.selectedChain)?.name : "All"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="group transition-all duration-200 hover:shadow-md">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-2.5 transition-colors group-hover:bg-primary/15">
                  <FolderGit className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-muted-foreground text-sm">
                    {filters.activeCategory === "my-contracts" ? "Your" : "Total"} Contracts
                  </p>
                  <p className="font-bold text-2xl">
                    {filters.activeCategory === "my-contracts"
                      ? deduplicatedUserDeployments.length
                      : deduplicatedAllDeployments.length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="group transition-all duration-200 hover:shadow-md">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-2.5 transition-colors group-hover:bg-primary/15">
                  <HashIcon className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-muted-foreground text-sm">Active Chains</p>
                  <p className="font-bold text-2xl">
                    {filters.activeCategory === "rewards" ? 1 : Object.keys(deploymentsByChain).length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Unified Filters */}
        <Card className="mb-6 overflow-hidden">
          <CardContent className="p-0">
            {/* Category Buttons */}
            <div className="p-4 pb-0">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {categoryButtons.map((category) => {
                  const isActive = filters.activeCategory === category.id
                  const Icon = category.icon

                  return (
                    <Button
                      className={cn(
                        "group h-10 justify-start px-3 font-medium text-xs transition-all",
                        isActive && "shadow-xs"
                      )}
                      key={category.id}
                      onClick={() => setActiveCategory(category.id)}
                      size="sm"
                      variant={isActive ? "default" : "outline"}
                    >
                      <Icon
                        className={cn(
                          "mr-2 h-3.5 w-3.5 shrink-0 transition-transform",
                          isActive && "scale-110",
                          !isActive && "group-hover:scale-110"
                        )}
                      />
                      <span className="truncate">{category.label}</span>
                      {category.count !== null && (
                        <Badge
                          className="ml-auto flex h-4 min-w-5 items-center justify-center px-1 text-xs"
                          variant={isActive ? "secondary" : "outline"}
                        >
                          {category.count}
                        </Badge>
                      )}
                    </Button>
                  )
                })}
              </div>
            </div>

            {/* Divider */}
            <div className="mx-4 mt-4 h-px bg-border" />

            {/* Chain Filters */}
            <div className="p-4">
              <div className="space-y-3">
                {/* Filter Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-muted-foreground text-sm">Chain Filters</span>
                  </div>
                  {filters.selectedChain !== null && (
                    <Button
                      className="group h-5 px-2 text-xs transition-all hover:bg-destructive/10 hover:text-destructive"
                      onClick={clearFilters}
                      size="sm"
                      variant="ghost"
                    >
                      <X className="mr-1 h-3 w-3 transition-transform group-hover:rotate-90" />
                      Clear
                    </Button>
                  )}
                </div>

                {/* Chain Buttons */}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {AGENT_DEPLOY_CHAINS.map((chainInfo) => {
                    const deploymentCount = deploymentsByChain[chainInfo.id] || 0
                    const isSelected = filters.selectedChain === chainInfo.id

                    return (
                      <Button
                        className={cn(
                          "group h-9 justify-start px-3 font-medium text-xs transition-all",
                          isSelected && "shadow-xs",
                          isSelected && chainInfo.iconBackground,
                          !isSelected && "hover:border-primary/50"
                        )}
                        key={`button-${chainInfo.id}`}
                        onClick={() => selectChainFilter(chainInfo.id)}
                        size="sm"
                        variant={isSelected ? "default" : "outline"}
                      >
                        <Image
                          alt={chainInfo.name}
                          className={cn("mr-2 shrink-0 transition-transform", !isSelected && "group-hover:scale-110")}
                          height={16}
                          src={chainInfo.iconUrl}
                          width={16}
                        />
                        <span className="truncate">{chainInfo.name}</span>
                        {(filters.activeCategory === "my-contracts" || filters.activeCategory === "all-contracts") && (
                          <Badge
                            className="ml-auto flex h-4 min-w-5 items-center justify-center px-1 text-xs"
                            variant={isSelected ? "secondary" : "outline"}
                          >
                            {deploymentCount}
                          </Badge>
                        )}
                      </Button>
                    )
                  })}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Content Area */}
        {(() => {
          if (filters.activeCategory === "leaderboard") {
            return (
              <Card>
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Trophy className="h-5 w-5 text-yellow-500" />
                      Contracts Leaderboard
                    </CardTitle>
                    <Badge className="text-xs" variant="outline">
                      <Sparkles className="mr-1 h-3 w-3" />
                      Top Deployments
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {leaderboardDeployments.length > 0 ? (
                      leaderboardDeployments.map((deployment, index) => {
                        const chain = getDisplayChainById(deployment.chainId)
                        const addressUrl = chain
                          ? getExplorerUrl({ hash: deployment.contractAddress, type: "address", viemChain: chain })
                          : ""
                        const isTop3 = index < TOP_POSITIONS_COUNT

                        return (
                          <div
                            className={cn(
                              "group flex items-center justify-between rounded-lg p-4",
                              "bg-muted/30",
                              isTop3 && "ring-1",
                              index === 0 &&
                                "bg-yellow-50/90 ring-yellow-400 dark:bg-yellow-400/20 dark:ring-yellow-500/80",
                              index === 1 && "bg-gray-100/40 ring-gray-300 dark:bg-gray-400/20 dark:ring-gray-400/70",
                              index === 2 &&
                                "bg-yellow-600/30 ring-yellow-500 dark:bg-amber-700/15 dark:ring-amber-500/60"
                            )}
                            key={generateUniqueKey(deployment, index)}
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <div className="flex items-center gap-2">
                                <span className="w-7 text-center font-mono font-semibold text-muted-foreground text-sm">
                                  #{index + 1}
                                </span>
                                <LeaderboardIcon index={index} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="truncate font-medium font-mono text-sm">{deployment.contractAddress}</p>
                                  {addressUrl ? (
                                    <Link
                                      className="opacity-0 transition-opacity group-hover:opacity-100"
                                      href={addressUrl}
                                      rel="noopener noreferrer"
                                      target="_blank"
                                    >
                                      <ExternalLink className="h-3 w-3 text-muted-foreground hover:text-primary" />
                                    </Link>
                                  ) : null}
                                </div>
                                {chain && (
                                  <div className="mt-1 flex items-center gap-1.5">
                                    <Image alt={chain.name} height={14} src={chain.iconUrl} width={14} />
                                    <p className="text-muted-foreground text-xs">{chain.name}</p>
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="text-right">
                              <Badge className="text-xs" variant={isTop3 ? "default" : "secondary"}>
                                {isTop3 ? "Bonus" : "Earning"}
                              </Badge>
                            </div>
                          </div>
                        )
                      })
                    ) : (
                      <div className="py-12 text-center text-muted-foreground">
                        <Trophy className="mx-auto mb-3 h-8 w-8 opacity-50" />
                        <p className="font-medium">No deployments found</p>
                        <p className="mt-1 text-sm">
                          {filters.selectedChain
                            ? "Try selecting a different chain"
                            : "Deploy contracts to appear here"}
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          }

          if (filters.activeCategory === "rewards") {
            return (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {rewardChains.map((chain) => {
                  const deploymentCount = deploymentsByChain[chain.id] || 0
                  const hasDeployments = deploymentCount > 0

                  return (
                    <Card
                      className={cn(
                        "group relative overflow-hidden transition-all duration-300",
                        "hover:-translate-y-1 hover:shadow-lg",
                        !hasDeployments && "opacity-75"
                      )}
                      key={`card-${chain.id}`}
                    >
                      <div className="absolute inset-0 bg-linear-to-br from-transparent via-transparent to-primary/5" />
                      <CardHeader className="relative pb-4">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div className={cn("rounded-lg p-2", chain.iconBackground)}>
                              <Image alt={chain.name} height={24} src={chain.iconUrl} width={24} />
                            </div>
                            <div>
                              <CardTitle className="text-lg">{chain.name}</CardTitle>
                              <p className="mt-0.5 text-muted-foreground text-xs">
                                {hasDeployments ? `${deploymentCount} deployments` : "No deployments yet"}
                              </p>
                            </div>
                          </div>
                          <Gift className="h-5 w-5 text-muted-foreground/50" />
                        </div>
                      </CardHeader>
                      <CardContent className="relative space-y-3">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Status</span>
                            <Badge className="text-xs" variant="outline">
                              {chain.id === ACTIVE_REWARDS_CHAIN_ID ? (
                                <>
                                  <Sparkles className="mr-1 h-3 w-3" />
                                  <span>Tracking Active</span>
                                </>
                              ) : (
                                "Coming Soon"
                              )}
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Rewards</span>
                            <span className="font-medium">TBA</span>
                          </div>
                        </div>
                        <div className="border-t pt-2">
                          <p className="text-muted-foreground text-xs">
                            Complete deployment challenges on {chain.name} to earn exclusive rewards and climb the
                            leaderboard!
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )
          }

          // Contracts Grid or Empty State
          if (paginatedDeployments.length > 0) {
            return (
              <>
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
                  {paginatedDeployments.map((deployment, index) => {
                    const chain = getDisplayChainById(deployment.chainId)
                    const addressUrl = chain
                      ? getExplorerUrl({ hash: deployment.contractAddress, type: "address", viemChain: chain })
                      : ""
                    const txUrl = chain
                      ? getExplorerUrl({ hash: deployment.deployHash, type: "tx", viemChain: chain })
                      : ""

                    return (
                      <Card
                        className="group border-0 bg-card shadow-xs transition-all duration-200 hover:shadow-lg"
                        key={generateUniqueKey(deployment, index)}
                      >
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between">
                            <div className="min-w-0 flex-1">
                              <CardTitle className="truncate font-semibold text-lg">
                                {deployment.contractAddress}
                              </CardTitle>
                              <div className="mt-2 flex items-center gap-2">
                                {chain && (
                                  <Badge className="text-xs" variant="secondary">
                                    <Image
                                      alt={chain.name}
                                      className="mr-1"
                                      height={16}
                                      src={chain.iconUrl}
                                      width={16}
                                    />
                                    {chain?.name || deployment.chainId}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        </CardHeader>

                        <CardContent className="space-y-4">
                          {/* Contract Address */}
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 text-muted-foreground text-xs">
                              <MapPin className="h-3 w-3" />
                              <span>Contract Address</span>
                            </div>
                            {addressUrl ? (
                              <Link
                                className="group flex items-center gap-2 rounded-lg bg-muted/50 p-2 transition-colors hover:bg-muted/80"
                                href={addressUrl}
                                rel="noopener noreferrer"
                                target="_blank"
                              >
                                <code className="flex-1 truncate font-mono text-xs">{deployment.contractAddress}</code>
                                <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground group-hover:text-primary" />
                              </Link>
                            ) : (
                              <code className="block truncate rounded-lg bg-muted/50 p-2 font-mono text-xs">
                                {deployment.contractAddress}
                              </code>
                            )}
                          </div>

                          {/* Transaction Hash */}
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 text-muted-foreground text-xs">
                              <HashIcon className="h-3 w-3" />
                              <span>Transaction Hash</span>
                            </div>
                            {txUrl ? (
                              <Link
                                className="group flex items-center gap-2 rounded-lg bg-muted/50 p-2 transition-colors hover:bg-muted/80"
                                href={txUrl}
                                rel="noopener noreferrer"
                                target="_blank"
                              >
                                <code className="flex-1 truncate font-mono text-xs">{deployment.deployHash}</code>
                                <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground group-hover:text-primary" />
                              </Link>
                            ) : (
                              <code className="block truncate rounded-lg bg-muted/50 p-2 font-mono text-xs">
                                {deployment.deployHash}
                              </code>
                            )}
                          </div>

                          {/* IPFS Source */}
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 text-muted-foreground text-xs">
                              <FileCode className="h-3 w-3" />
                              <span>IPFS Source Code</span>
                            </div>
                            <Link
                              className="group flex items-center gap-2 rounded-lg bg-linear-to-r from-purple-50 to-pink-50 p-2 transition-colors hover:from-purple-100 hover:to-pink-100 dark:from-purple-900/20 dark:to-pink-900/20 dark:hover:from-purple-900/30 dark:hover:to-pink-900/30"
                              href={getIpfsUrl(deployment.cid)}
                              rel="noopener noreferrer"
                              target="_blank"
                            >
                              <code className="flex-1 truncate font-mono text-purple-700 text-xs dark:text-purple-300">
                                {deployment.cid}
                              </code>
                              <ExternalLink className="h-3 w-3 shrink-0 text-purple-500 group-hover:text-purple-600 dark:group-hover:text-purple-400" />
                            </Link>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
                <PaginationControls filters={filters} goToPage={goToPage} pagination={pagination} />
              </>
            )
          }

          // Empty State
          return (
            <Card>
              <CardContent className="p-12 text-center">
                <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-muted/20">
                  <FolderGit className="h-8 w-8 text-muted-foreground/50" />
                </div>
                <h3 className="mb-2 font-semibold text-lg">
                  {filteredDeployments.length === 0 ? "No deployments yet" : "No matching deployments"}
                </h3>
                <p className="mb-4 text-muted-foreground">
                  {(() => {
                    if (filteredDeployments.length === 0) {
                      return filters.activeCategory === "my-contracts"
                        ? "Deploy your first smart contract to get started."
                        : "No contracts have been deployed yet."
                    }
                    return "Try adjusting your filter criteria."
                  })()}
                </p>
                {filters.selectedChain !== null && (
                  <Button onClick={clearFilters} variant="outline">
                    Clear Filters
                  </Button>
                )}
              </CardContent>
            </Card>
          )
        })()}
      </div>
    </div>
  )
}

// Pagination component
const PaginationControls = ({
  filters,
  pagination,
  goToPage,
}: {
  filters: FilterState
  pagination: PaginationState
  goToPage: (page: number) => void
}) => {
  if (filters.activeCategory === "leaderboard" || filters.activeCategory === "rewards" || pagination.totalPages <= 1) {
    return null
  }

  return (
    <div className="mt-6 flex items-center justify-between">
      <div className="hidden text-muted-foreground text-sm md:block">
        Showing {(pagination.currentPage - 1) * ITEMS_PER_PAGE + 1} to{" "}
        {Math.min(pagination.currentPage * ITEMS_PER_PAGE, pagination.totalItems)} of {pagination.totalItems}{" "}
        deployments
      </div>
      <div className="flex items-center gap-2 max-sm:w-full max-sm:justify-center">
        <Button
          disabled={pagination.currentPage === 1}
          onClick={() => goToPage(pagination.currentPage - 1)}
          size="sm"
          variant="outline"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden md:block">Previous</span>
        </Button>
        <div className="flex items-center gap-1">
          {Array.from({ length: Math.min(2, pagination.totalPages) }, (_, i) => {
            const page = i + 1
            return (
              <Button
                className="h-8 w-8 p-0"
                key={page}
                onClick={() => goToPage(page)}
                size="sm"
                variant={pagination.currentPage === page ? "default" : "outline"}
              >
                {page}
              </Button>
            )
          })}
          {pagination.totalPages > 2 && (
            <>
              {pagination.currentPage > 2 && pagination.currentPage < pagination.totalPages - 1 ? (
                <Button className="h-8 w-8 p-0" size="sm" variant={"default"}>
                  {pagination.currentPage}
                </Button>
              ) : (
                <Button className="h-8 w-8 p-0" size="sm" variant={"outline"}>
                  ...
                </Button>
              )}
              {Array.from({ length: Math.min(2, pagination.totalPages) }, (_, i) => {
                const page = pagination.totalPages + i - 1
                return (
                  <Button
                    className="h-8 w-8 p-0"
                    key={page}
                    onClick={() => goToPage(page)}
                    size="sm"
                    variant={pagination.currentPage === page ? "default" : "outline"}
                  >
                    {page}
                  </Button>
                )
              })}
            </>
          )}
        </div>
        <Button
          disabled={pagination.currentPage === pagination.totalPages}
          onClick={() => goToPage(pagination.currentPage + 1)}
          size="sm"
          variant="outline"
        >
          <span className="hidden md:block">Next</span>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

const getIconColor = (index: number) => {
  switch (index) {
    case 0:
      return "text-yellow-500 dark:text-yellow-400"
    case 1:
      return "text-zinc-400 dark:text-zinc-500"
    case 2:
      return "text-amber-600 dark:text-amber-500"
    default:
      return "text-muted-foreground"
  }
}

// get icon for leaderboard
const LeaderboardIcon = ({ index }: { index: number }) => {
  const iconColor = getIconColor(index)
  switch (index) {
    case 0:
      return <Crown className={cn("h-4 w-4", iconColor)} />
    case 1:
      return <Medal className={cn("h-4 w-4", iconColor)} />
    case 2:
      return <Award className={cn("h-4 w-4", iconColor)} />
    default:
      return <Trophy className={cn("h-4 w-4", iconColor)} />
  }
}
