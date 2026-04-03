import type { BookingStage, JobLane } from './types'

/** Short, confident, slightly witty — never long paragraphs. */

export function askWhatWeAreMoving(): string {
  return 'What can I fetch for you?'
}

export function askPickup(): string {
  return 'Easy — where are we grabbing it from?'
}

export function askDropoff(): string {
  return "Good — now where's it going?"
}

export function askBedrooms(): string {
  return 'Is this a 1, 2, 3, or 4+ bedroom move?'
}

export function askDeliveryItem(): string {
  return 'What are we picking up?'
}

export function askDeliveryFrom(): string {
  return 'Easy — where from?'
}

export function instantFetchQuickSetup(): string {
  return 'Easy — quick setup: quick run, junk removal, or move something?'
}

export function confirmPickup(): string {
  return 'Nice — got it.'
}

export function confirmDropoff(): string {
  return 'Perfect.'
}

export function confirmUnderstood(): string {
  return "Done — I've got it moving."
}

export function confirmPickupAndAskDropoff(): string {
  return `${confirmPickup()} ${askDropoff()}`
}

export function quickRunHint(): string {
  return 'Easy.'
}

export function confirmRoute(distanceKm: number, durationMin: number): string {
  return `Nice — I've mapped it. ${distanceKm} km, around ${durationMin} min.`
}

export function statePrice(total: number): string {
  return `$${total} all in. Want me to lock a driver?`
}

export function pricingRangeLine(
  min: number,
  max: number,
  durationMin: number,
  isBigMove: boolean,
): string {
  const roundedHour = durationMin >= 55 && durationMin <= 75
  const durationText = roundedHour ? 'about an hour' : `about ${durationMin} min`
  if (isBigMove || max >= 300) {
    return `Done. $${min} to $${max} — ${durationText}.`
  }
  return `Perfect. $${min} to $${max} — ${durationText}.`
}

export function searchingDriver(): string {
  return "Give me a sec — I'll fetch someone."
}

export function matchedDriver(name: string, eta?: number): string {
  if (eta != null && eta > 0) {
    return `Done. ${name} · ~${eta} min away.`
  }
  return `Done. ${name}'s on the way.`
}

export function needClearerLocation(which: 'pickup' | 'dropoff'): string {
  return which === 'pickup'
    ? 'Suburb or street for pickup?'
    : "Where's drop-off? Suburb is fine."
}

export function acknowledgedJob(serviceLine: string): string {
  return `Perfect — ${serviceLine}.`
}

export function laneConfirmation(lane: JobLane): string {
  switch (lane) {
    case 'single_item_small_move':
      return "Easy — I'll fetch that."
    case 'junk_removal':
      return 'Yep — I can handle that.'
    case 'whole_home_move':
      return "Big one — let's build this move the easy way."
    case 'delivery_pickup':
      return "Easy — I'll run and fetch it."
    default:
      return "Got it — I'll fetch it."
  }
}

export function stageNudge(stage: BookingStage): string {
  switch (stage) {
    case 'idle':
      return askWhatWeAreMoving()
    case 'building':
      return askPickup()
    case 'pricing':
      return 'Say yes and I will fetch the best driver.'
    case 'searching':
      return searchingDriver()
    case 'matched':
      return "Done — I've got it moving."
    case 'live':
      return 'You are live.'
    default:
      return 'Ready when you are.'
  }
}
