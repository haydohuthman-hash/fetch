const JOKES = [
  "Why did the couch go to therapy? Because it had too much emotional baggage.",
  "I tried to move a fridge once. We're not on speaking terms anymore.",
  "What do you call a lazy mover? A stay-putter.",
  "Why don't pianos ever get lost? Because they always know the right key.",
  "I told my GPS I needed to move house. It said, recalculating your life choices.",
  "What did the heavy item say to the mover? I'm not going anywhere without you.",
  "Why did the delivery truck break up with the van? It needed more space.",
  "I asked my couch if it wanted to move. It said it was already committed to this spot.",
  "What's a mover's favourite exercise? The deadlift, obviously.",
  "How does a smart fridge make decisions? It weighs its options, very carefully.",
  "Why did the box feel insecure? Because it was always getting taped up.",
  "I'd tell you a moving joke, but I'm still unpacking it.",
  "What's the hardest part about moving a pool table? The emotional weight of every missed shot.",
  "Why do removalists make great friends? They always help you move on.",
  "I asked a piano if it wanted to be moved. It said, don't push my buttons.",
]

const HOW_IT_WORKS = [
  "Just pick a job, drop a pin, and I'll sort the rest. Easy.",
  "Here's how it works. Choose your service, tell me the address, and I'll find someone nearby to help.",
  "Tap a job type, enter your pickup, and I handle the matching. You just watch the magic happen.",
  "Pick your service up top, then I'll ask for addresses. After that, I scan your items and get you a quote.",
  "It's simple. You tell me what needs moving, where from, where to, and I take it from there.",
  "Choose a service, drop your addresses, snap some photos if needed, and boom, you've got a quote.",
  "I match you with nearby drivers and helpers. Just give me the details and I'll handle the logistics.",
  "Think of me as your personal logistics butler. Pick a job, give me the location, and I'll run the operation.",
]

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!
}

export function getOrbTapLine(): string {
  return Math.random() < 0.5 ? pickRandom(JOKES) : pickRandom(HOW_IT_WORKS)
}

export function getHowItWorksTapLine(): string {
  return pickRandom(HOW_IT_WORKS)
}
