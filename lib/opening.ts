export type OpeningDetect = { name: string; tip: string }

type OpeningEntry = { moves: string[]; name: string; tip: string }

const OPENINGS: OpeningEntry[] = [
  { moves: ["e4", "e5"], name: "Open Game", tip: "A classic open position — develop knights and bishops toward the center, then castle." },
  { moves: ["e4", "e5", "Nf3", "Nc6", "Bc4"], name: "Italian Game", tip: "Develop your knight and bishop toward the center, then castle early." },
  { moves: ["e4", "e5", "Nf3", "Nc6", "Bb5"], name: "Ruy Lopez", tip: "Pin their knight and pressure the e5 pawn with your pieces." },
  { moves: ["e4", "e5", "Nf3", "Nc6", "Nc3", "Nf6"], name: "Four Knights Game", tip: "Solid and symmetric — castle early and fight for the center." },
  { moves: ["e4", "e5", "Nf3", "d6"], name: "Philidor Defense", tip: "They are a bit cramped — keep pressure on the center and develop fast." },
  { moves: ["e4", "e5", "Nf3", "f5"], name: "Latvian Gambit", tip: "They are pushing f5 early — stay calm, capture g5 if it is sound." },
  { moves: ["e4", "e5", "Nf3", "Nf6", "Nxe5"], name: "Petrov's Defense", tip: "They struck early at e5 — recapture properly and stay active." },
  { moves: ["e4", "c5"], name: "Sicilian Defense", tip: "Fight for d4 — try to develop your knight toward c3 and pressure the center." },
  { moves: ["e4", "e6"], name: "French Defense", tip: "Their c8 bishop is locked in — aim for d4 and keep developing." },
  { moves: ["e4", "c6"], name: "Caro-Kann Defense", tip: "Solid pawn chain ahead — develop your pieces toward the center and prepare d4." },
  { moves: ["e4", "d5"], name: "Scandinavian Defense", tip: "They came out for the d5 pawn — capture, develop, and build a strong center." },
  { moves: ["d4", "d5", "c4"], name: "Queen's Gambit", tip: "Control the center and develop quickly before you castle." },
  { moves: ["d4", "d5", "c4", "e6"], name: "Queen's Gambit Declined", tip: "Their e6 keeps d5 guarded — develop knights and bishop before committing." },
  { moves: ["d4", "d5", "c4", "dxc4"], name: "Queen's Gambit Accepted", tip: "They grabbed c4 — you can fight back in the center with e4." },
  { moves: ["d4", "Nf6", "c4", "g6"], name: "King's Indian Defense", tip: "They are fianchettoing — strike in the center with e4 and d5." },
  { moves: ["d4", "Nf6", "c4", "e6", "Nc3", "Bb4"], name: "Nimzo-Indian Defense", tip: "They pinned your knight — decide on b3 or Bd2 and keep the center strong." },
  { moves: ["d4", "Nf6", "c4", "e6", "Nf3", "b6"], name: "Queen's Indian Defense", tip: "Fianchetto pressure on your center — finish development then advance." },
  { moves: ["d4", "Nf6", "c4", "e5"], name: "Budapest Gambit", tip: "They gambited a pawn — you can accept c5 or return it for a strong center." },
  { moves: ["d4", "f5"], name: "Dutch Defense", tip: "They are attacking on the kingside — build a strong pawn center and be safe." },
  { moves: ["Nf3", "d5"], name: "Réti Opening", tip: "Flexible setup — develop and challenge their d5 pawn with c4." },
  { moves: ["b3"], name: "Nimzo-Larsen Attack", tip: "Fianchetto the bishop and build pressure along the long diagonal." },
  { moves: ["g3", "g6"], name: "Double Fianchetto Setup", tip: "Put both bishops on long diagonals and control the center with pieces." },
  { moves: ["c4", "e5"], name: "English Opening", tip: "You built a queenside space advantage — develop and fight for d5." },
  { moves: ["f4"], name: "Bird's Opening", tip: "You are controlling e5 — reinforce the center but keep your king safe." },
]

export function detectOpening(moves: string[]): OpeningDetect | null {
  if (!moves || moves.length === 0) return null
  let best: OpeningEntry | null = null
  for (const entry of OPENINGS) {
    if (entry.moves.length > moves.length) continue
    let match = true
    for (let i = 0; i < entry.moves.length; i++) {
      if (moves[i] !== entry.moves[i]) {
        match = false
        break
      }
    }
    if (match && (!best || entry.moves.length > best.moves.length)) {
      best = entry
    }
  }
  return best ? { name: best.name, tip: best.tip } : null
}