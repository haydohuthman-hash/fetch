export function computeQuoteBreakdown(state) {
  if (!state?.serviceType || !state?.jobType) return null
  if (
    (state.jobType === 'deliveryPickup' ||
      state.jobType === 'heavyItem' ||
      state.jobType === 'homeMoving') &&
    (state?.distanceMeters == null || state?.durationSeconds == null)
  ) {
    return null
  }
  const km = (state.distanceMeters ?? 0) / 1000
  const routeMin = Math.max(10, Math.round((state.durationSeconds ?? 0) / 60))
  const totalItems =
    Object.values(state.itemCounts ?? {}).reduce((sum, qty) => sum + Math.max(0, qty || 0), 0) ||
    (Array.isArray(state.detectedItems) ? state.detectedItems.length : 0)
  const moveSizeFactor =
    state.homeBedrooms != null
      ? state.homeBedrooms >= 4
        ? 1.8
        : state.homeBedrooms === 3
          ? 1.5
          : state.homeBedrooms === 2
            ? 1.3
            : 1.1
      : state.moveSize === 'large'
        ? 1.45
        : state.moveSize === 'medium'
          ? 1.2
          : state.moveSize === 'small'
            ? 1
            : state.serviceType === 'move' && totalItems > 0
              ? 1.2
              : 1

  const isJunk = state.serviceType === 'remove'
  const junkLoadTier = isJunk
    ? totalItems >= 15 ? 'full_truck' : totalItems >= 8 ? 'half_truck' : totalItems >= 3 ? 'ute_load' : 'single'
    : null

  const baseFee = isJunk
    ? junkLoadTier === 'full_truck' ? 320 : junkLoadTier === 'half_truck' ? 195 : junkLoadTier === 'ute_load' ? 125 : 99
    : state.serviceType === 'pickup' ? 56 : 74
  const distanceFeePerKm = isJunk ? 4.5 : state.serviceType === 'pickup' ? 2.7 : 4.1
  const routeFee = km * distanceFeePerKm
  const routeTimeFee = routeMin * (state.serviceType === 'pickup' ? 0.45 : isJunk ? 0.7 : 0.6)
  const inventoryFee = isJunk
    ? Math.max(0, totalItems - 1) * 12
    : Math.max(0, totalItems - 1) * (state.serviceType === 'pickup' ? 5 : 8)

  const accessFee =
    (state.accessDetails?.stairs ? (isJunk ? 35 : 22) : 0) +
    (state.accessDetails?.lift === false ? (isJunk ? 18 : 12) : 0) +
    (state.accessDetails?.disassembly ? (isJunk ? 30 : 24) : 0) +
    Math.max(0, (state.accessDetails?.carryDistance ?? 0) - 10) * (isJunk ? 1.2 : 0.7)

  const disposalFee = isJunk && state.disposalRequired
    ? junkLoadTier === 'full_truck' ? 145 : junkLoadTier === 'half_truck' ? 88 : junkLoadTier === 'ute_load' ? 52 : 28
    : 0

  const autoHelpers =
    state.serviceType === 'move' && (moveSizeFactor >= 1.45 || totalItems >= 8 || routeMin >= 55)
      ? 2
      : state.serviceType === 'move' && (moveSizeFactor >= 1.2 || totalItems >= 4)
        ? 1
        : 0

  const helperFee = autoHelpers * (state.serviceType === 'pickup' ? 18 : 28)
  const heavyItemFee =
    state.jobType === 'heavyItem'
      ? (state.isHeavyItem ? 42 : 0) +
        (state.needsTwoMovers ? 28 : 0) +
        (state.needsSpecialEquipment ? 36 : 0) +
        (state.isBulky ? 16 : 0)
      : 0
  if (state.serviceType === 'helpers') {
    const hours = Math.max(1, state.helperHours ?? 1)
    const baseHelpersFee = 36
    const hourlyRate = 48
    const supportFee = /\bassembly\b/i.test(state.helperType ?? '')
      ? 14
      : /\bloading|lifting\b/i.test(state.helperType ?? '')
        ? 8
        : 0
    const subtotal = baseHelpersFee + hours * hourlyRate + supportFee
    const spread = Math.max(12, subtotal * 0.12)

    return {
      baseFee: Math.round(baseHelpersFee),
      routeFee: 0,
      routeTimeFee: 0,
      inventoryFee: 0,
      accessFee: 0,
      disposalFee: 0,
      helperFee: Math.round(hours * hourlyRate + supportFee),
      moveSizeMultiplier: 1,
      subtotal: Math.round(subtotal),
      spread: Math.round(spread),
      totalItems: 0,
      autoHelpers: 0,
    }
  }
  if (state.serviceType === 'cleaning') {
    const hours = Math.max(1, state.cleaningHours ?? 1)
    const baseCleaningFee = 36
    const hourlyRate = 48
    const supportFee = /\bdeep\b/i.test(state.cleaningType ?? '')
      ? 14
      : /\b(end of lease|bond)\b/i.test(state.cleaningType ?? '')
        ? 22
        : 0
    const subtotal = baseCleaningFee + hours * hourlyRate + supportFee
    const spread = Math.max(12, subtotal * 0.12)

    return {
      baseFee: Math.round(baseCleaningFee),
      routeFee: 0,
      routeTimeFee: 0,
      inventoryFee: 0,
      accessFee: 0,
      disposalFee: 0,
      helperFee: Math.round(hours * hourlyRate + supportFee),
      moveSizeMultiplier: 1,
      subtotal: Math.round(subtotal),
      spread: Math.round(spread),
      totalItems: 0,
      autoHelpers: 0,
    }
  }
  const subtotal =
    (baseFee + routeFee + routeTimeFee + inventoryFee + accessFee + disposalFee + helperFee + heavyItemFee) *
    moveSizeFactor
  const spread = Math.max(14, subtotal * 0.16)

  return {
    baseFee: Math.round(baseFee),
    routeFee: Math.round(routeFee),
    routeTimeFee: Math.round(routeTimeFee),
    inventoryFee: Math.round(inventoryFee),
    accessFee: Math.round(accessFee),
    disposalFee: Math.round(disposalFee),
    helperFee: Math.round(helperFee),
    moveSizeMultiplier: Number(moveSizeFactor.toFixed(2)),
    subtotal: Math.round(subtotal),
    spread: Math.round(spread),
    totalItems,
    autoHelpers,
  }
}

export function computePricing(state) {
  const breakdown = computeQuoteBreakdown(state)
  if (!breakdown) return null
  const km = (state.distanceMeters ?? 0) / 1000
  const totalItems = breakdown.totalItems
  const explanationParts = [
    `${state.serviceType} job`,
    `${km.toFixed(1)} km`,
    `${totalItems} item${totalItems === 1 ? '' : 's'}`,
  ]
  if (state.serviceType === 'helpers') {
    explanationParts.splice(0, explanationParts.length, 'helpers job', `${Math.max(1, state.helperHours ?? 1)} hr`)
    if (state.helperType?.trim()) explanationParts.push(state.helperType.trim())
  }
  if (state.serviceType === 'cleaning') {
    explanationParts.splice(0, explanationParts.length, 'cleaning job', `${Math.max(1, state.cleaningHours ?? 1)} hr`)
    if (state.cleaningType?.trim()) explanationParts.push(state.cleaningType.trim())
  }
  if (state.jobType === 'heavyItem') {
    explanationParts.splice(
      0,
      explanationParts.length,
      'heavy item job',
      `${km.toFixed(1)} km`,
      state.specialItemType || `${totalItems} item${totalItems === 1 ? '' : 's'}`,
    )
    if (state.needsTwoMovers) explanationParts.push('two movers')
    if (state.needsSpecialEquipment) explanationParts.push('special equipment')
  }
  if (state.accessDetails?.stairs) explanationParts.push('stairs')
  if (state.accessDetails?.disassembly) explanationParts.push('disassembly')
  if (state.serviceType === 'remove' && state.disposalRequired) explanationParts.push('disposal')
  if (state.serviceType !== 'helpers' && state.serviceType !== 'cleaning' && breakdown.autoHelpers > 0) {
    explanationParts.push(`${breakdown.autoHelpers} helper${breakdown.autoHelpers > 1 ? 's' : ''}`)
  }

  return {
    minPrice: Math.round(Math.max(45, breakdown.subtotal - breakdown.spread)),
    maxPrice: Math.round(Math.max(58, breakdown.subtotal + breakdown.spread)),
    currency: 'AUD',
    estimatedDuration:
      state.serviceType === 'helpers'
        ? Math.max(3600, Math.round((state.helperHours ?? 1) * 3600))
        : state.serviceType === 'cleaning'
          ? Math.max(3600, Math.round((state.cleaningHours ?? 1) * 3600))
          : Math.max(1800, Math.round((state.durationSeconds ?? 0) + 1200 + totalItems * 120)),
    explanation: explanationParts.join(' · '),
  }
}
