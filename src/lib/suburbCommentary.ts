/**
 * Cheeky suburb-specific lines Fetch speaks when a pin drops.
 * Key = lowercase suburb name. Value = array of possible lines (one picked at random).
 */
const SUBURB_LINES: Record<string, string[]> = {
  'surfers paradise': [
    "Surfers Paradise! I love the beach there. Boardwalk vibes all day.",
    "Surfers! Sand between your toes kind of suburb. Good choice.",
    "Ah, Surfers Paradise. Tourists, towers, and the best sunsets on the coast.",
  ],
  'broadbeach': [
    "Broadbeach! Great food scene. I could live at that Thai place on the strip.",
    "Broadbeach, nice. Bit more chill than Surfers but still knows how to party.",
  ],
  'burleigh heads': [
    "Burleigh! Best point break in South East Queensland. Absolute vibe.",
    "Burleigh Heads. Acai bowls and good surf. Can't go wrong.",
  ],
  'coolangatta': [
    "Coolangatta! Basically the border but the waves are chef's kiss.",
    "Cooly! Feels like a small town but punches way above its weight.",
  ],
  'robina': [
    "Robina! Town Centre has everything. Very convenient spot.",
    "Robina, solid pick. Close to everything on the Gold Coast.",
  ],
  'southport': [
    "Southport! The old-school heart of the Gold Coast. Love the Broadwater.",
    "Southport. Chinatown vibes and waterfront walks. Underrated.",
  ],
  'nerang': [
    "Nerang! Gateway to the hinterland. Good pies at the bakery too.",
    "Nerang, nice. Half coast, half bush. Best of both worlds.",
  ],
  'varsity lakes': [
    "Varsity Lakes! That lake walk is actually really peaceful.",
    "Varsity! Feels like a hidden gem. Quiet but connected.",
  ],
  'palm beach': [
    "Palm Beach! Great fish and chips, and that surf's sneaky good.",
    "Palmy! Laid back vibes. One of my favourite stretches of beach.",
  ],
  'mermaid beach': [
    "Mermaid Beach! The Nobbys end is elite. Great cafes too.",
    "Mermaid! Close to everything but feels like its own little world.",
  ],
  'miami': [
    "Miami! Not Florida, but honestly just as good. Maybe better.",
    "Miami on the Gold Coast. Low-key one of the best spots.",
  ],
  'mudgeeraba': [
    "Mudgeeraba! Proper hinterland energy. I love the village vibe.",
    "Mudgee! You've got kangaroos and good coffee. What else do you need?",
  ],
  'labrador': [
    "Labrador! Broadwater sunsets from there are absolutely unreal.",
    "Labrador, nice. Quiet waterfront living. Very chill.",
  ],
  'hope island': [
    "Hope Island! Fancy! Golf course views and canal life.",
    "Hope Island. Very premium. I see you've got taste.",
  ],
  'coomera': [
    "Coomera! Dreamworld and Westfield. The north end is growing fast.",
    "Coomera, solid. New estates everywhere but still has that fresh energy.",
  ],
  'ormeau': [
    "Ormeau! That growth corridor energy. Good value too.",
    "Ormeau, nice. Quiet family vibes with easy highway access.",
  ],
  'helensvale': [
    "Helensvale! Tram and train. Best connected spot on the coast.",
    "Helensvale. Harbour Town shopping and light rail. Very practical.",
  ],
  'brisbane city': [
    "Brisbane City! The river city. Love the South Bank walk.",
    "Brisbane CBD. All business during the week, all brunch on weekends.",
  ],
  'brisbane': [
    "Brisbane! Love that river city energy. Underrated capital.",
    "Brissy! Best weather, best people, best kept secret.",
  ],
  'south brisbane': [
    "South Brisbane! Gallery vibes and laneway bars. Very cultured.",
    "South Brissy. GOMA, markets, and the best gelato in Queensland.",
  ],
  'fortitude valley': [
    "The Valley! Live music and late nights. Brisbane's heartbeat.",
    "Fortitude Valley. James Street by day, nightlife by night.",
  ],
  'west end': [
    "West End! The hippest suburb in Brisbane. Great markets too.",
    "West End. Boundary Street on a Saturday is peak Brisbane.",
  ],
  'new farm': [
    "New Farm! Powerhouse vibes and beautiful park walks.",
    "New Farm. Premium Brisbane living. Those jacarandas though.",
  ],
  'paddington': [
    "Paddington! Those Queenslander houses on the hill. Gorgeous.",
    "Paddo! Antique shops and Latrobe Terrace. Very charming.",
  ],
  'woolloongabba': [
    "Woolloongabba! The Gabba is right there. Cricket and footy.",
    "The Gabba end. Olympics coming through here too. Big energy.",
  ],
  'kangaroo point': [
    "Kangaroo Point! The cliffs are unreal. Best city views.",
    "KP! Rock climbing and river views. Hidden gem.",
  ],
  'indooroopilly': [
    "Indooroopilly! That shopping centre is basically a city.",
    "Indro! Westside legend. Great food court, better community.",
  ],
  'toowong': [
    "Toowong! UQ is just down the road. Smart suburb.",
    "Toowong. River views and that village energy. Love it.",
  ],
  'chermside': [
    "Chermside! Westfield up there is massive. Northside staple.",
    "Chermside. Big suburb energy. Hospital, shops, everything.",
  ],
  'carindale': [
    "Carindale! That Westfield is a whole day trip honestly.",
    "Carindale. Eastside and proud. Solid suburb.",
  ],
  'springfield': [
    "Springfield! That new city energy. Growing fast.",
    "Springfield. Modern, planned, and really coming together.",
  ],
  'logan': [
    "Logan! Diverse, real, and full of character.",
    "Logan. Don't sleep on it, some great pockets in there.",
  ],
  'ipswich': [
    "Ipswich! Heritage buildings and proper character.",
    "Ipswich. Old school Queensland. Love the history.",
  ],
  'redcliffe': [
    "Redcliffe! That peninsula life. Great fish and chips on the jetty.",
    "Redcliffe. Bee Gees territory. Good vibes by the water.",
  ],
  'noosa': [
    "Noosa! Absolute paradise. That main beach is world class.",
    "Noosa. Hastings Street and national park walks. Perfection.",
  ],
  'maroochydore': [
    "Maroochydore! Heart of the Sunny Coast. Great pub scene.",
    "Maroochy! New CBD coming through. Exciting times.",
  ],
  'caloundra': [
    "Caloundra! That coastline is stunning. Kings Beach is elite.",
    "Caloundra. Holiday vibes all year round.",
  ],
  'mooloolaba': [
    "Mooloolaba! The esplanade is proper beautiful. Love it there.",
    "Mooloolaba. Fish markets and beach walks. Can't beat it.",
  ],
  'toowoomba': [
    "Toowoomba! Garden city. Those parks in spring are something else.",
    "Toowoomba. Up on the range with the best air in Queensland.",
  ],
  'townsville': [
    "Townsville! North Queensland legend. Castle Hill sunsets.",
    "Townsville. Magnetic Island is right there. Tropical paradise.",
  ],
  'cairns': [
    "Cairns! Gateway to the reef. Tropical vibes at their finest.",
    "Cairns. Esplanade lagoon and reef trips. Living the dream.",
  ],
}

function pickRandom(lines: string[]): string {
  return lines[Math.floor(Math.random() * lines.length)]!
}

const GENERIC_LINES = [
  "Nice spot! I haven't been but it looks great on the map.",
  "Ooh, interesting choice. I like it.",
  "Sweet, locking that in. Looks like a solid area.",
  "Got it! New suburb for me but I'm always up for an adventure.",
  "Nice one. Pinned and ready to go.",
]

export function suburbCommentaryLine(suburb: string | undefined): string | null {
  if (!suburb) return null
  const key = suburb.trim().toLowerCase()
  const lines = SUBURB_LINES[key]
  if (lines?.length) return pickRandom(lines)
  const name = suburb.trim()
  if (!name) return null
  const generics = [
    `${name}! ${pickRandom(GENERIC_LINES)}`,
    `Ooh, ${name}. ${pickRandom(GENERIC_LINES)}`,
    `${name}, nice. ${pickRandom(GENERIC_LINES)}`,
  ]
  return pickRandom(generics)
}
