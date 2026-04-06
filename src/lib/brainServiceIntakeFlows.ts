/**
 * Neural-field entry: mini service cards open a branching Q&A; answers compile into a first user message.
 */

export type BrainIntakeTone = 'green' | 'teal' | 'blue' | 'orange' | 'slate' | 'rose'

export type BrainIntakeOption = {
  id: string
  label: string
  /** Next step id, or terminal. */
  next: string
}

export type BrainIntakeStep = {
  question: string
  options: BrainIntakeOption[]
}

export type BrainServiceIntakeFlow = {
  id: string
  carouselLabel: string
  carouselHint: string
  tone: BrainIntakeTone
  startStepId: string
  steps: Record<string, BrainIntakeStep>
}

export const BRAIN_INTAKE_DONE = '__done__'

function compilePath(lines: string[]): string {
  const body = lines.filter(Boolean).join(' ')
  return `I'd like help with: ${body}`.slice(0, 900)
}

/** Build user message from answered labels (no PII — user adds addresses in chat). */
export function compileIntakeMessage(flow: BrainServiceIntakeFlow, path: { question: string; answer: string }[]): string {
  const head = `${flow.carouselLabel}.`
  const detail = path.map((p) => `${p.question} ${p.answer}.`).join(' ')
  return compilePath([head, detail].filter(Boolean))
}

export const BRAIN_SERVICE_INTAKE_FLOWS: BrainServiceIntakeFlow[] = [
  {
    id: 'junk-removal',
    carouselLabel: 'Junk removal',
    carouselHint: 'Tip, kerb, site',
    tone: 'orange',
    startStepId: 'where',
    steps: {
      where: {
        question: 'Where is the junk?',
        options: [
          { id: 'res', label: 'Home / residential', next: 'volume' },
          { id: 'com', label: 'Office / commercial', next: 'volume' },
          { id: 'site', label: 'Building site', next: 'volume' },
        ],
      },
      volume: {
        question: 'Roughly how much?',
        options: [
          { id: 'small', label: 'A few items', next: BRAIN_INTAKE_DONE },
          { id: 'ute', label: 'Ute / trailer load', next: BRAIN_INTAKE_DONE },
          { id: 'truck', label: 'Truck load or more', next: BRAIN_INTAKE_DONE },
          { id: 'unsure', label: 'Not sure — advise me', next: BRAIN_INTAKE_DONE },
        ],
      },
    },
  },
  {
    id: 'home-moving',
    carouselLabel: 'Home moving',
    carouselHint: 'House or unit',
    tone: 'green',
    startStepId: 'type',
    steps: {
      type: {
        question: 'What kind of move?',
        options: [
          { id: 'h2h', label: 'Home to home', next: 'when' },
          { id: 'storage', label: 'Involves storage', next: 'when' },
          { id: 'partial', label: 'Partial / few rooms', next: 'when' },
        ],
      },
      when: {
        question: 'When are you thinking?',
        options: [
          { id: 'asap', label: 'ASAP', next: BRAIN_INTAKE_DONE },
          { id: 'week', label: 'This week', next: BRAIN_INTAKE_DONE },
          { id: 'plan', label: 'Planning ahead', next: BRAIN_INTAKE_DONE },
        ],
      },
    },
  },
  {
    id: 'delivery-pickup',
    carouselLabel: 'Pick & drop',
    carouselHint: 'Pickup → drop-off',
    tone: 'blue',
    startStepId: 'what',
    steps: {
      what: {
        question: 'What are we moving?',
        options: [
          { id: 'furniture', label: 'Furniture / bulky', next: 'urgent' },
          { id: 'boxes', label: 'Boxes / parcels', next: 'urgent' },
          { id: 'other', label: 'Something else', next: 'urgent' },
        ],
      },
      urgent: {
        question: 'How soon?',
        options: [
          { id: 'today', label: 'Today if possible', next: BRAIN_INTAKE_DONE },
          { id: 'few', label: 'Next few days', next: BRAIN_INTAKE_DONE },
          { id: 'flex', label: 'I’m flexible', next: BRAIN_INTAKE_DONE },
        ],
      },
    },
  },
  {
    id: 'cleaning',
    carouselLabel: 'Cleaning',
    carouselHint: 'Tidy or bond',
    tone: 'teal',
    startStepId: 'kind',
    steps: {
      kind: {
        question: 'What type of clean?',
        options: [
          { id: 'regular', label: 'Regular tidy', next: 'size' },
          { id: 'bond', label: 'Bond / end of lease', next: 'size' },
          { id: 'once', label: 'Once-off deep clean', next: 'size' },
        ],
      },
      size: {
        question: 'Place size?',
        options: [
          { id: 'apt', label: 'Apartment / unit', next: BRAIN_INTAKE_DONE },
          { id: 'house', label: 'House', next: BRAIN_INTAKE_DONE },
          { id: 'office', label: 'Office / commercial', next: BRAIN_INTAKE_DONE },
        ],
      },
    },
  },
  {
    id: 'helper',
    carouselLabel: 'Helper',
    carouselHint: 'Labour & tasks',
    tone: 'blue',
    startStepId: 'task',
    steps: {
      task: {
        question: 'What do you need hands for?',
        options: [
          { id: 'load', label: 'Loading / unloading', next: 'duration' },
          { id: 'pack', label: 'Packing help', next: 'duration' },
          { id: 'general', label: 'General labour', next: 'duration' },
        ],
      },
      duration: {
        question: 'How long?',
        options: [
          { id: 'fewh', label: 'A few hours', next: BRAIN_INTAKE_DONE },
          { id: 'day', label: 'Most of a day', next: BRAIN_INTAKE_DONE },
          { id: 'multi', label: 'Multiple days', next: BRAIN_INTAKE_DONE },
        ],
      },
    },
  },
  {
    id: 'heavy-item',
    carouselLabel: 'Heavy item',
    carouselHint: 'Piano, safe…',
    tone: 'slate',
    startStepId: 'item',
    steps: {
      item: {
        question: 'What are we moving?',
        options: [
          { id: 'piano', label: 'Piano / musical', next: 'access' },
          { id: 'appliance', label: 'Fridge / appliance', next: 'access' },
          { id: 'awkward', label: 'Awkward / heavy', next: 'access' },
        ],
      },
      access: {
        question: 'Stairs or tight access?',
        options: [
          { id: 'easy', label: 'Mostly ground / lift', next: BRAIN_INTAKE_DONE },
          { id: 'stairs', label: 'Stairs involved', next: BRAIN_INTAKE_DONE },
          { id: 'tight', label: 'Tight doorways / tricky', next: BRAIN_INTAKE_DONE },
        ],
      },
    },
  },
  {
    id: 'quote-pricing',
    carouselLabel: 'Quote',
    carouselHint: 'Pricing help',
    tone: 'rose',
    startStepId: 'scope',
    steps: {
      scope: {
        question: 'What do you need priced?',
        options: [
          { id: 'move', label: 'A move', next: 'detail' },
          { id: 'junk', label: 'Junk removal', next: 'detail' },
          { id: 'mixed', label: 'Not sure yet', next: 'detail' },
        ],
      },
      detail: {
        question: 'How detailed can you be now?',
        options: [
          { id: 'rough', label: 'Rough ballpark only', next: BRAIN_INTAKE_DONE },
          { id: 'addrs', label: 'I have addresses ready', next: BRAIN_INTAKE_DONE },
          { id: 'photos', label: 'I can send photos', next: BRAIN_INTAKE_DONE },
        ],
      },
    },
  },
  {
    id: 'live-booking',
    carouselLabel: 'Live job',
    carouselHint: 'Driver / status',
    tone: 'blue',
    startStepId: 'status',
    steps: {
      status: {
        question: 'What’s going on?',
        options: [
          { id: 'waiting', label: 'Waiting on a driver', next: BRAIN_INTAKE_DONE },
          { id: 'enroute', label: 'Driver en route', next: BRAIN_INTAKE_DONE },
          { id: 'issue', label: 'Something went wrong', next: BRAIN_INTAKE_DONE },
        ],
      },
    },
  },
  {
    id: 'how-fetch-works',
    carouselLabel: 'How it works',
    carouselHint: 'Book in app',
    tone: 'teal',
    startStepId: 'topic',
    steps: {
      topic: {
        question: 'What do you want to know?',
        options: [
          { id: 'book', label: 'How booking works', next: BRAIN_INTAKE_DONE },
          { id: 'pay', label: 'Payment & pricing', next: BRAIN_INTAKE_DONE },
          { id: 'cancel', label: 'Changes / cancellation', next: BRAIN_INTAKE_DONE },
        ],
      },
    },
  },
  {
    id: 'open-chat',
    carouselLabel: 'Something else',
    carouselHint: 'Free-form',
    tone: 'slate',
    startStepId: 'intent',
    steps: {
      intent: {
        question: 'Closest match?',
        options: [
          { id: 'general', label: 'General question', next: BRAIN_INTAKE_DONE },
          { id: 'feedback', label: 'Feedback / idea', next: BRAIN_INTAKE_DONE },
          { id: 'support', label: 'Account / support', next: BRAIN_INTAKE_DONE },
        ],
      },
    },
  },
]

export function getBrainIntakeFlow(id: string): BrainServiceIntakeFlow | undefined {
  return BRAIN_SERVICE_INTAKE_FLOWS.find((f) => f.id === id)
}
