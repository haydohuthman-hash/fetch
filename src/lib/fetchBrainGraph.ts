import type { BookingJobType } from './assistant'
import type { BrainAccountSnapshot } from './fetchBrainAccountSnapshot'
import { brainCatalogIdToGraphNodeId, formatBrainMileageDisplay } from './fetchBrainAccountSnapshot'

export type BrainNodeKind = 'core' | 'hub' | 'memory' | 'activity' | 'job' | 'nav'

export type BrainNode = {
  id: string
  kind: BrainNodeKind
  label: string
  subtitle: string
  body: string
  x: number
  y: number
  radius: number
}

export type BrainEdge = { from: string; to: string }

function clamp(s: string, max: number) {
  const t = s.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}

function jobLabel(jt: BookingJobType | null) {
  if (!jt) return 'No active job'
  const labels: Record<BookingJobType, string> = {
    junkRemoval: 'Junk removal',
    deliveryPickup: 'Delivery pickup',
    heavyItem: 'Heavy item',
    homeMoving: 'Home moving',
    helper: 'Helper / labour',
    cleaning: 'Cleaning',
  }
  return labels[jt]
}

/** Deterministic pseudo-random 0..1 from string id */
function hash01(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (Math.imul(31, h) + id.charCodeAt(i)) | 0
  return (Math.abs(h) % 10001) / 10000
}

export function buildFetchBrainGraph(input: {
  chatTurns: { id: string; role: 'user' | 'assistant'; text: string }[]
  jobType: BookingJobType | null
  flowStep: string
  navActive: boolean
  pickupLine: string | null
  dropoffLine: string | null
  snapshot?: BrainAccountSnapshot | null
  /** Catalog id e.g. `activity:…` — matches `brainCatalogIdToGraphNodeId`. */
  focusedCatalogId?: string | null
}): { nodes: BrainNode[]; edges: BrainEdge[] } {
  const nodes: BrainNode[] = []
  const edges: BrainEdge[] = []

  const core: BrainNode = {
    id: 'core',
    kind: 'core',
    label: "Fetch's brain",
    subtitle: 'Cognitive core',
    body: 'Coordinates memory, booking context, voice, and navigation. Tap satellites to inspect traces.',
    x: 500,
    y: 360,
    radius: 34,
  }
  nodes.push(core)

  const memHub: BrainNode = {
    id: 'hub-memory',
    kind: 'hub',
    label: 'Chat memory',
    subtitle: 'Recent dialogue',
    body: 'Rolling buffer of what you and Fetch exchanged. Longer history stays summarized per turn.',
    x: 720,
    y: 200,
    radius: 22,
  }
  nodes.push(memHub)
  edges.push({ from: 'core', to: 'hub-memory' })

  const bookHub: BrainNode = {
    id: 'hub-booking',
    kind: 'hub',
    label: 'Booking graph',
    subtitle: 'Job & flow',
    body: `Stage: ${input.flowStep}. ${jobLabel(input.jobType)}.`,
    x: 260,
    y: 210,
    radius: 24,
  }
  nodes.push(bookHub)
  edges.push({ from: 'core', to: 'hub-booking' })

  const actHub: BrainNode = {
    id: 'hub-activity',
    kind: 'hub',
    label: 'Activity',
    subtitle: 'Live signals',
    body: 'Voice, UI events, and map attention streams that tune how Fetch responds.',
    x: 500,
    y: 580,
    radius: 22,
  }
  nodes.push(actHub)
  edges.push({ from: 'core', to: 'hub-activity' })

  const voiceSat: BrainNode = {
    id: 'act-voice',
    kind: 'activity',
    label: 'Voice channel',
    subtitle: 'TTS / mic',
    body: 'Speech synthesis and listening state sync with the neural pulse you see when Fetch talks.',
    x: 380,
    y: 640,
    radius: 12,
  }
  nodes.push(voiceSat)
  edges.push({ from: 'hub-activity', to: 'act-voice' })

  const mapSat: BrainNode = {
    id: 'act-map',
    kind: 'activity',
    label: 'Map attention',
    subtitle: 'Spatial focus',
    body: input.navActive
      ? 'Navigation route active — Fetch is weighting directions and ETA.'
      : 'Pickup / dropoff pins and suburb context inform tone and prompts.',
    x: 620,
    y: 640,
    radius: 12,
  }
  nodes.push(mapSat)
  edges.push({ from: 'hub-activity', to: 'act-map' })

  if (input.navActive) {
    const navHub: BrainNode = {
      id: 'hub-nav',
      kind: 'nav',
      label: 'Navigation',
      subtitle: 'Route memory',
      body: 'Turn-by-turn context is linked to the assistant so questions stay route-aware.',
      x: 840,
      y: 400,
      radius: 20,
    }
    nodes.push(navHub)
    edges.push({ from: 'core', to: 'hub-nav' })
    edges.push({ from: 'hub-nav', to: 'hub-memory' })
  }

  const jobBody = [
    input.pickupLine ? `Pickup: ${input.pickupLine}` : null,
    input.dropoffLine ? `Dropoff: ${input.dropoffLine}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  const jobNode: BrainNode = {
    id: 'job-current',
    kind: 'job',
    label: 'Current job',
    subtitle: jobLabel(input.jobType),
    body: jobBody || 'No addresses pinned yet — start a service from the sheet.',
    x: 140,
    y: 380,
    radius: 16,
  }
  nodes.push(jobNode)
  edges.push({ from: 'hub-booking', to: 'job-current' })

  const recent = input.chatTurns.slice(-8)
  recent.forEach((turn, i) => {
    const id = `mem-${turn.id}`
    const a = hash01(turn.id) * Math.PI * 2
    const ring = 72 + (i % 3) * 38
    const ox = Math.cos(a + i * 0.55) * ring
    const oy = Math.sin(a + i * 0.55) * ring * 0.85
    const n: BrainNode = {
      id,
      kind: 'memory',
      label: turn.role === 'user' ? 'You' : 'Fetch',
      subtitle: turn.role === 'user' ? 'Your message' : 'Assistant reply',
      body: clamp(turn.text, 420),
      x: memHub.x + ox,
      y: memHub.y + oy + 90,
      radius: turn.role === 'assistant' ? 11 : 9,
    }
    nodes.push(n)
    edges.push({ from: 'hub-memory', to: id })
    if (i > 0) edges.push({ from: `mem-${recent[i - 1]!.id}`, to: id })
  })

  if (recent.length === 0) {
    const placeholder: BrainNode = {
      id: 'mem-empty',
      kind: 'memory',
      label: 'Quiet',
      subtitle: 'No turns yet',
      body: 'Chat with Fetch from the sheet or mic — traces will appear here as linked neurons.',
      x: memHub.x,
      y: memHub.y + 120,
      radius: 10,
    }
    nodes.push(placeholder)
    edges.push({ from: 'hub-memory', to: 'mem-empty' })
  }

  const snap = input.snapshot
  if (snap) {
    const mile = formatBrainMileageDisplay(snap)
    const mileBody =
      mile.source === 'none'
        ? 'No mileage logged yet — complete a routed quote or job to populate.'
        : `Roughly ${(mile.meters / 1000).toFixed(1)} km from ${mile.source} data.`

    const accHub: BrainNode = {
      id: 'hub-account',
      kind: 'hub',
      label: 'Memories',
      subtitle: 'Account intel',
      body: clamp(
        `${snap.activityCount} activities · ${snap.alertCount} alerts (${snap.unreadAlertCount} unread) · ${snap.savedAddressCount} saved places.`,
        220,
      ),
      x: 660,
      y: 460,
      radius: 23,
    }
    nodes.push(accHub)
    edges.push({ from: 'core', to: 'hub-account' })

    const spendSat: BrainNode = {
      id: 'sat-spend',
      kind: 'hub',
      label: 'Spend',
      subtitle: `$${snap.totalSpendAud.toFixed(0)} AUD`,
      body: clamp(`${snap.paymentActivityCount} payment lines · ${snap.quoteActivityCount} quotes`, 160),
      x: 780,
      y: 360,
      radius: input.focusedCatalogId === 'section:spending' ? 22 : 18,
    }
    nodes.push(spendSat)
    edges.push({ from: 'hub-account', to: 'sat-spend' })

    const mileSat: BrainNode = {
      id: 'sat-mileage',
      kind: 'hub',
      label: 'Mileage',
      subtitle: mile.meters > 0 ? `${(mile.meters / 1000).toFixed(1)} km` : '—',
      body: clamp(mileBody, 180),
      x: 820,
      y: 500,
      radius: 17,
    }
    nodes.push(mileSat)
    edges.push({ from: 'hub-account', to: 'sat-mileage' })

    const placesSat: BrainNode = {
      id: 'sat-places',
      kind: 'hub',
      label: 'Places',
      subtitle: `${snap.savedAddressCount} saved`,
      body: clamp('Pickup/dropoff memory and labelled addresses.', 120),
      x: 540,
      y: 520,
      radius: input.focusedCatalogId === 'section:places' ? 21 : 17,
    }
    nodes.push(placesSat)
    edges.push({ from: 'hub-account', to: 'sat-places' })

    const alertSat: BrainNode = {
      id: 'sat-alerts',
      kind: 'hub',
      label: 'Alerts',
      subtitle: `${snap.unreadAlertCount} unread`,
      body: clamp('Notifications from quotes, payments, and dispatch.', 120),
      x: 720,
      y: 580,
      radius: 17,
    }
    nodes.push(alertSat)
    edges.push({ from: 'hub-account', to: 'sat-alerts' })

    const topActs = snap.activities.slice(0, 8)
    topActs.forEach((a, i) => {
      const focusId = `activity:${a.id}`
      const gid = brainCatalogIdToGraphNodeId(focusId)
      const ang = hash01(a.id) * Math.PI * 2 + i * 0.4
      const ring = 52 + (i % 4) * 28
      const baseR = 9
      const n: BrainNode = {
        id: gid,
        kind: 'memory',
        label: clamp(a.title, 28),
        subtitle: clamp(a.subtitle ?? '', 36),
        body: clamp(
          [
            typeof a.priceMax === 'number' ? `$${a.priceMax}` : '',
            a.paymentStatus ? a.paymentStatus : '',
          ]
            .filter(Boolean)
            .join(' · ') || 'Activity',
          100,
        ),
        x: accHub.x + Math.cos(ang) * ring,
        y: accHub.y + Math.sin(ang) * ring * 0.88,
        radius: input.focusedCatalogId === focusId ? Math.round(baseR * 1.5) : baseR,
      }
      nodes.push(n)
      edges.push({ from: 'hub-account', to: gid })
    })

    snap.addresses.slice(0, 4).forEach((addr, i) => {
      const focusId = `address:${addr.id}`
      const gid = brainCatalogIdToGraphNodeId(focusId)
      const n: BrainNode = {
        id: gid,
        kind: 'memory',
        label: clamp(addr.label, 20),
        subtitle: 'Saved',
        body: clamp(addr.address, 90),
        x: placesSat.x + 40 + i * 18,
        y: placesSat.y + 70 + (i % 2) * 24,
        radius: input.focusedCatalogId === focusId ? 12 : 8,
      }
      nodes.push(n)
      edges.push({ from: 'sat-places', to: gid })
    })
  }

  return { nodes, edges }
}
